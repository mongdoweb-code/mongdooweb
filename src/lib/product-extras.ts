// ฟิลด์ล็อต 9 ในฟอร์มสินค้าหลังบ้าน: ราคาลดตามช่วงเวลา (A3), ราคาขายส่ง (A6), สเปกแบบมีโครงสร้าง (A5)
// ตรวจที่ server เสมอ — เงินเป็นสตางค์, เวลาที่กรอกเป็นเวลาไทย (UTC+7)
import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { parseTiers } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { cleanAttrs, defsFor, type SpecDef } from "@/lib/specs";

/** "2026-10-25T18:00" (เวลาไทยจาก input datetime-local) → Date · ว่าง = null · ผิดรูป = NaN Date */
export function parseBkk(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(NaN);
  return new Date(`${s.length === 16 ? `${s}:00` : s}+07:00`);
}
/** Date → ค่าสำหรับ input datetime-local (เวลาไทย) */
export const toBkkInput = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 16) : "");
/** วันเวลาไทยอ่านง่าย เช่น "25 ต.ค. 2569 18:00" */
export const bkkText = (d: Date) =>
  d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const money = (v: string) => {
  if (!v.trim()) return null;
  const n = Number(v.replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) : NaN;
};

export type SaleInput = { salePriceSatang: number | null; saleStartsAt: Date | null; saleEndsAt: Date | null };

/** ตรวจราคาลดตามช่วงเวลา (ราคาลดว่าง = ไม่ลด, ล้างเวลา) */
export function checkSale(priceSatang: number, saleRaw: string, startRaw: string, endRaw: string): { sale?: SaleInput; error?: string; field?: string } {
  const sale = money(saleRaw);
  if (sale == null) return { sale: { salePriceSatang: null, saleStartsAt: null, saleEndsAt: null } };
  if (Number.isNaN(sale) || sale <= 0) return { error: "ราคาลดไม่ถูกต้อง", field: "salePrice" };
  if (priceSatang <= 0) return { error: "สินค้า \"สอบถามราคา\" ตั้งราคาลดไม่ได้ — ใส่ราคาขายก่อน", field: "salePrice" };
  if (sale >= priceSatang) return { error: "ราคาลดต้องน้อยกว่าราคาขาย", field: "salePrice" };
  const start = parseBkk(startRaw);
  const end = parseBkk(endRaw);
  if (start && Number.isNaN(start.getTime())) return { error: "วันเริ่มลดราคาไม่ถูกต้อง", field: "saleStartsAt" };
  if (end && Number.isNaN(end.getTime())) return { error: "วันสิ้นสุดลดราคาไม่ถูกต้อง", field: "saleEndsAt" };
  if (start && end && end <= start) return { error: "วันสิ้นสุดต้องหลังวันเริ่มลดราคา", field: "saleEndsAt" };
  return { sale: { salePriceSatang: sale, saleStartsAt: start, saleEndsAt: end } };
}

/** ราคาขายส่งจาก JSON [{minQty, price(บาท)}] — จำนวนต้องเพิ่มขึ้นและราคาต้องลดลงทีละขั้น */
export function checkTiers(priceSatang: number, raw: string): { tiers?: { minQty: number; priceSatang: number }[]; error?: string } {
  let rows: { minQty?: unknown; price?: unknown }[] = [];
  try {
    rows = raw.trim() ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) throw new Error();
  } catch {
    return { error: "ข้อมูลราคาขายส่งไม่ถูกต้อง" };
  }
  const out: { minQty: number; priceSatang: number }[] = [];
  for (const r of rows.slice(0, 10)) {
    const q = String(r?.minQty ?? "").trim();
    const p = String(r?.price ?? "").trim();
    if (!q && !p) continue;
    const minQty = Math.floor(Number(q));
    const sat = money(p);
    if (!(minQty >= 2 && minQty <= 100000)) return { error: "จำนวนขั้นต่ำของราคาขายส่งต้องตั้งแต่ 2 ชิ้นขึ้นไป" };
    if (sat == null || Number.isNaN(sat) || sat <= 0) return { error: `ราคาขายส่งสำหรับ ${minQty} ชิ้นไม่ถูกต้อง` };
    if (priceSatang <= 0) return { error: "สินค้า \"สอบถามราคา\" ตั้งราคาขายส่งไม่ได้" };
    if (sat >= priceSatang) return { error: `ราคาขายส่ง ${minQty} ชิ้นขึ้นไป ต้องน้อยกว่าราคาขายปกติ` };
    out.push({ minQty, priceSatang: sat });
  }
  const sorted = parseTiers(out);
  if (sorted.length !== out.length) return { error: "จำนวนขั้นต่ำของราคาขายส่งซ้ำกัน" };
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i].priceSatang >= sorted[i - 1].priceSatang) return { error: "ราคาขายส่งขั้นที่ซื้อมากกว่าต้องถูกกว่าขั้นก่อนหน้า" };
  return { tiers: sorted };
}

/** อ่าน + ตรวจฟิลด์ล็อต 9 ทั้งหมดจากฟอร์มสินค้า */
export async function readProductExtras(f: FormData, categoryId: string, priceSatang: number) {
  const s = (k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
  const sale = checkSale(priceSatang, s("salePrice", 20), s("saleStartsAt", 30), s("saleEndsAt", 30));
  if (sale.error) return { error: sale.error, fields: [sale.field!] };
  const tiers = checkTiers(priceSatang, s("tierPrices", 5000));
  if (tiers.error) return { error: tiers.error, fields: ["tierPrices"] };
  let raw: Record<string, unknown> = {};
  try {
    const v = JSON.parse(s("attrs", 20000) || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) raw = v;
  } catch {}
  const defs: SpecDef[] = (await prisma.specAttribute.findMany()).map((d) => ({ ...d }));
  const { attrs, bad } = cleanAttrs(defsFor(defs, categoryId), raw);
  if (bad.length) {
    const labels = defs.filter((d) => bad.includes(d.code)).map((d) => d.label);
    return { error: `ค่าสเปกไม่ถูกต้อง: ${[...new Set(labels)].join(", ")}`, fields: bad.map((c) => `attr_${c}`) };
  }
  return {
    data: {
      ...sale.sale!,
      tierPrices: tiers.tiers!.length ? (tiers.tiers as Prisma.InputJsonValue) : Prisma.DbNull,
      attrs: Object.keys(attrs).length ? (attrs as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  };
}
