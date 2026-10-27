// ตั้งค่าร้าน (แถวเดียว id="shop") — อ่าน/ตรวจรูปแบบ JSON และคำนวณค่าส่งตามยอดซื้อ
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ShopSetting } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { freeShipFrom, parseRemoteZips, parseShippingTiers, parseWeightTiers, tierFee, type ShipConfig } from "@/lib/shipping";
import { parseOpeningHours } from "@/lib/home";

export const STOREFRONT_TAG = "storefront";

export type BankAccount = { bank: string; account: string; holder: string };
// ขั้นค่าส่ง/น้ำหนัก/พื้นที่ห่างไกล คำนวณใน src/lib/shipping.ts (ฟังก์ชันล้วน ใช้กับเทสต์หน่วยได้)
export { freeShipFrom, parseShippingTiers, tierFee, type ShippingTier } from "@/lib/shipping";

/** ชื่อธนาคารที่ใช้บ่อย — ใช้แสดงชื่อเต็ม/สีในหน้าชำระเงิน */
export const BANKS: Record<string, string> = {
  KBANK: "ธนาคารกสิกรไทย",
  SCB: "ธนาคารไทยพาณิชย์",
  BBL: "ธนาคารกรุงเทพ",
  KTB: "ธนาคารกรุงไทย",
  BAY: "ธนาคารกรุงศรีอยุธยา",
  TTB: "ธนาคารทหารไทยธนชาต",
  GSB: "ธนาคารออมสิน",
  BAAC: "ธ.ก.ส.",
  UOB: "ธนาคารยูโอบี",
  CIMB: "ธนาคารซีไอเอ็มบี ไทย",
  LHB: "ธนาคารแลนด์ แอนด์ เฮ้าส์",
  KKP: "ธนาคารเกียรตินาคินภัทร",
};
export const bankLabel = (code: string) => BANKS[code] ?? code;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseBankAccounts(v: unknown): BankAccount[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map((a) => ({ bank: String(a.bank ?? "").trim(), account: String(a.account ?? "").trim(), holder: String(a.holder ?? "").trim() }))
    .filter((a) => a.bank && a.account);
}

export type ShippingOption = { id: "std" | "express" | "pickup"; name: string; desc: string };
export const PICKUP_NAME = "รับสินค้าที่ร้าน";
export function shippingOptions(s: Pick<ShopSetting, "expressEnabled"> & Partial<Pick<ShopSetting, "pickupEnabled" | "pickupNote">>): ShippingOption[] {
  const opts: ShippingOption[] = [{ id: "std", name: "ส่งธรรมดา", desc: "ค่าส่งตามยอดสั่งซื้อ · ได้รับภายใน 2–3 วันทำการ" }];
  if (s.expressEnabled) opts.push({ id: "express", name: "ส่งด่วน", desc: "ได้รับภายใน 1–2 วันทำการ" });
  if (s.pickupEnabled) opts.push({ id: "pickup", name: PICKUP_NAME, desc: s.pickupNote?.trim() || "ไม่มีค่าส่ง · ร้านจะโทรนัดเวลารับสินค้า" });
  return opts;
}

/** ค่าตั้งค่าส่ง/เก็บเงินปลายทางที่ src/lib/shipping.ts ใช้คำนวณ */
export function shipConfig(s: ShopSetting): ShipConfig {
  return {
    tiers: parseShippingTiers(s.shippingTiers),
    expressEnabled: s.expressEnabled,
    expressExtraSatang: s.expressExtraSatang,
    weightTiers: parseWeightTiers(s.weightTiers),
    remoteZips: parseRemoteZips(s.remoteZips),
    remoteFeeSatang: Math.max(0, s.remoteFeeSatang),
    pickupEnabled: s.pickupEnabled,
    codEnabled: s.codEnabled,
    codFeeSatang: Math.max(0, s.codFeeSatang),
    codMaxSatang: Math.max(0, s.codMaxSatang),
  };
}

export function shippingFee(s: Pick<ShopSetting, "shippingTiers" | "expressEnabled" | "expressExtraSatang">, method: string, subtotalSatang: number) {
  const base = tierFee(parseShippingTiers(s.shippingTiers), subtotalSatang);
  return method === "express" && s.expressEnabled ? base + s.expressExtraSatang : base;
}

/** ค่าตั้งร้านล่าสุด (ไม่แคช) — ใช้ตอนคำนวณเงิน/ออกเอกสาร */
export async function getSettings() {
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" } });
  if (!s) throw new Error("ยังไม่ได้ตั้งค่าร้าน (รัน npm run db:seed)");
  return s;
}

/** ข้อมูลร้านที่แสดงต่อสาธารณะ (ท้ายเว็บ, แถบประกาศ, ลิงก์ LINE) — แคชไว้ ล้างด้วย tag storefront */
export async function getPublicShopInfo() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const s = await getSettings();
  const tiers = parseShippingTiers(s.shippingTiers);
  return {
    name: s.legalName,
    phone: s.phone,
    email: s.email,
    lineId: s.lineId,
    lineUrl: s.lineOaUrl,
    address: s.addressText,
    taxId: s.taxId,
    website: s.website,
    facebookUrl: s.facebookUrl,
    youtubeUrl: s.youtubeUrl,
    tiktokUrl: s.tiktokUrl,
    businessHours: s.businessHours,
    logoKey: s.logoKey,
    freeShipMinSatang: freeShipFrom(tiers),
    tiers,
    openingHours: parseOpeningHours(s.openingHours), // เวลาทำการแบบมีโครงสร้าง → สถานะ "ร้านเปิดอยู่/ปิดแล้ว" (U27)
  };
}
