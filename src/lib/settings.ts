// ตั้งค่าร้าน (แถวเดียว id="shop") — อ่าน/ตรวจรูปแบบ JSON และคำนวณค่าส่งตามยอดซื้อ
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ShopSetting } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parseOpeningHours } from "@/lib/home";

export const STOREFRONT_TAG = "storefront";

export type BankAccount = { bank: string; account: string; holder: string };
export type ShippingTier = { minSatang: number; feeSatang: number };

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

/** ขั้นค่าส่งเรียงตามยอดขั้นต่ำ ขั้นแรกเริ่มที่ 0 เสมอ */
export function parseShippingTiers(v: unknown): ShippingTier[] {
  const list = Array.isArray(v)
    ? v
        .filter(isObj)
        .map((t) => ({ minSatang: Math.max(0, Math.round(Number(t.minSatang))), feeSatang: Math.max(0, Math.round(Number(t.feeSatang))) }))
        .filter((t) => Number.isFinite(t.minSatang) && Number.isFinite(t.feeSatang))
    : [];
  list.sort((a, b) => a.minSatang - b.minSatang);
  const uniq = list.filter((t, i) => i === 0 || t.minSatang !== list[i - 1].minSatang);
  if (!uniq.length || uniq[0].minSatang !== 0) uniq.unshift({ minSatang: 0, feeSatang: uniq[0]?.feeSatang ?? 0 });
  return uniq;
}

/** ค่าส่งตามยอดสินค้า (สตางค์) */
export function tierFee(tiers: ShippingTier[], subtotalSatang: number) {
  let fee = tiers[0]?.feeSatang ?? 0;
  for (const t of tiers) if (subtotalSatang >= t.minSatang) fee = t.feeSatang;
  return fee;
}

/** ยอดขั้นต่ำที่ได้ส่งฟรี (ขั้นแรกที่ค่าส่ง 0 และสูงกว่า 0) — null = ไม่มีส่งฟรี */
export function freeShipFrom(tiers: ShippingTier[]) {
  return tiers.find((t) => t.feeSatang === 0 && t.minSatang > 0)?.minSatang ?? null;
}

export type ShippingOption = { id: "std" | "express"; name: string; desc: string };
export function shippingOptions(s: Pick<ShopSetting, "expressEnabled">): ShippingOption[] {
  const opts: ShippingOption[] = [{ id: "std", name: "ส่งธรรมดา", desc: "ค่าส่งตามยอดสั่งซื้อ · ได้รับภายใน 2–3 วันทำการ" }];
  if (s.expressEnabled) opts.push({ id: "express", name: "ส่งด่วน", desc: "ได้รับภายใน 1–2 วันทำการ" });
  return opts;
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
