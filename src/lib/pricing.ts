// ราคาต่อชิ้นที่ใช้จริง (สตางค์) — ใช้ร่วมกันทั้งหน้าร้าน ตะกร้า และการบันทึกคำสั่งซื้อ (คำนวณที่เซิร์ฟเวอร์เสมอ)
// ลำดับ: ราคาปกติ → ราคาลดตามช่วงเวลา (ถ้าอยู่ในช่วง) → ราคาขายส่งตามจำนวน — ใช้ราคาที่ "ต่ำสุด"
// ราคา 0 = สอบถามราคา (ไม่คิดราคาลด/ราคาส่ง)

export type PriceInput = {
  priceSatang: number;
  compareAtSatang?: number | null;
  salePriceSatang?: number | null;
  saleStartsAt?: Date | null;
  saleEndsAt?: Date | null;
  tierPrices?: unknown;
};

export type Tier = { minQty: number; priceSatang: number };

/** อ่าน tierPrices จาก JSON — ตัดแถวผิดรูป เรียง minQty น้อยไปมาก, minQty ≥ 2 */
export function parseTiers(v: unknown): Tier[] {
  if (!Array.isArray(v)) return [];
  const out: Tier[] = [];
  for (const r of v) {
    if (!r || typeof r !== "object") continue;
    const minQty = Math.floor(Number((r as Tier).minQty));
    const priceSatang = Math.round(Number((r as Tier).priceSatang));
    if (Number.isFinite(minQty) && minQty >= 2 && Number.isFinite(priceSatang) && priceSatang > 0) out.push({ minQty, priceSatang });
  }
  return out.sort((a, b) => a.minQty - b.minQty).filter((t, i, a) => i === 0 || t.minQty !== a[i - 1].minQty);
}

/** ราคาลดตามช่วงเวลามีผลอยู่หรือไม่ */
export function saleActive(p: PriceInput, now: Date = new Date()) {
  if (!p.salePriceSatang || p.salePriceSatang <= 0 || p.priceSatang <= 0 || p.salePriceSatang >= p.priceSatang) return false;
  if (p.saleStartsAt && now < p.saleStartsAt) return false;
  if (p.saleEndsAt && now >= p.saleEndsAt) return false;
  return true;
}

/** ราคาต่อชิ้นสำหรับจำนวน qty */
export function unitPriceSatang(p: PriceInput, qty = 1, now: Date = new Date()) {
  if (p.priceSatang <= 0) return 0;
  let price = saleActive(p, now) ? p.salePriceSatang! : p.priceSatang;
  for (const t of parseTiers(p.tierPrices)) if (qty >= t.minQty && t.priceSatang < price) price = t.priceSatang;
  return price;
}

/** ราคาที่แสดงบนการ์ด/หน้าสินค้า (1 ชิ้น) + ราคาเดิมขีดฆ่า */
export function displayPrice(p: PriceInput, now: Date = new Date()) {
  const price = unitPriceSatang(p, 1, now);
  const was = saleActive(p, now) ? p.priceSatang : p.compareAtSatang && p.compareAtSatang > price ? p.compareAtSatang : null;
  return { priceSatang: price, compareAtSatang: was, saleEndsAt: saleActive(p, now) ? p.saleEndsAt ?? null : null };
}

// ---------------------------------------------------------------------------
// ล็อต 9: ข้อมูลราคาสำหรับหน้าร้าน (บาท) — ส่งไปเบราว์เซอร์ให้คำนวณสถานะ "ลดราคาตามเวลา" เองด้วย
// เพราะหน้าร้านถูกแคชไว้: หมดเวลาลดแล้วราคาต้องกลับเป็นปกติทันที แม้แคชยังไม่หมดอายุ
// ไฟล์นี้ไม่มี import ฝั่ง server → ใช้ได้ทั้ง server และ client component
// ---------------------------------------------------------------------------

/** ลดราคาตามช่วงเวลา: p = ราคาลด, r = ราคาปกติ, w = ราคาขีดฆ่าเมื่อไม่อยู่ในช่วงลด, f/t = เริ่ม/สิ้นสุด (ms) */
export type SaleInfo = { p: number; r: number; w?: number | null; f?: number | null; t?: number | null };
/** ราคาขายส่ง [จำนวนขั้นต่ำ, ราคาต่อชิ้น (บาท)] เรียงจากน้อยไปมาก */
export type TierInfo = [number, number][];

/** ข้อมูลลดราคาตามเวลาที่ยังไม่หมดอายุ (ใช้ใส่ใน catalog/หน้าสินค้า) — ไม่มี/หมดแล้ว = null */
export function saleInfo(p: PriceInput, now: Date = new Date()): SaleInfo | null {
  if (!p.salePriceSatang || p.salePriceSatang <= 0 || p.priceSatang <= 0 || p.salePriceSatang >= p.priceSatang) return null;
  if (p.saleEndsAt && now >= p.saleEndsAt) return null;
  return {
    p: p.salePriceSatang / 100,
    r: p.priceSatang / 100,
    w: p.compareAtSatang && p.compareAtSatang > p.priceSatang ? p.compareAtSatang / 100 : null,
    f: p.saleStartsAt ? p.saleStartsAt.getTime() : null,
    t: p.saleEndsAt ? p.saleEndsAt.getTime() : null,
  };
}

/** ราคาขายส่งเป็นบาท (เฉพาะขั้นที่ถูกกว่าราคาปกติ) */
export function tierInfo(p: PriceInput): TierInfo {
  if (p.priceSatang <= 0) return [];
  return parseTiers(p.tierPrices)
    .filter((t) => t.priceSatang < p.priceSatang)
    .map((t) => [t.minQty, t.priceSatang / 100] as [number, number]);
}

/** เวลาที่ราคาจะเปลี่ยนครั้งถัดไป (เริ่ม/หมดช่วงลด) — ใช้กำหนดอายุแคชหน้าร้าน */
export function nextPriceChange(list: PriceInput[], now: Date = new Date()): Date | null {
  let next: number | null = null;
  for (const p of list) {
    if (!p.salePriceSatang) continue;
    for (const d of [p.saleStartsAt, p.saleEndsAt]) {
      const t = d?.getTime();
      if (t != null && t > now.getTime() && (next == null || t < next)) next = t;
    }
  }
  return next == null ? null : new Date(next);
}

/** อายุแคช (วินาที) ให้หมดรอบพอดีกับเวลาที่ราคาเปลี่ยน — อย่างน้อย 30 วินาที อย่างมาก 1 ชั่วโมง */
export function revalidateFor(next: Date | null, now: Date = new Date(), max = 3600) {
  if (!next) return max;
  return Math.max(30, Math.min(max, Math.ceil((next.getTime() - now.getTime()) / 1000) + 1));
}

export type PriceView = { price: number; compareAt: number | null; on: boolean; endsAt: number | null };

/** ราคา 1 ชิ้นที่ควรแสดง ณ เวลา now (ms) จากข้อมูลที่แคชไว้ — ไม่มีข้อมูลลดตามเวลา = ใช้ค่าที่ server คำนวณมา */
export function viewPrice(item: { price: number; compareAt?: number | null; sale?: SaleInfo | null }, now: number | null): PriceView {
  const s = item.sale;
  if (!s || now == null) return { price: item.price, compareAt: item.compareAt ?? null, on: !!s && item.price === s.p, endsAt: s && item.price === s.p ? s.t ?? null : null };
  const on = (!s.f || now >= s.f) && (!s.t || now < s.t);
  return on ? { price: s.p, compareAt: s.r, on: true, endsAt: s.t ?? null } : { price: s.r, compareAt: s.w && s.w > s.r ? s.w : null, on: false, endsAt: null };
}

/** ราคาต่อชิ้นเมื่อซื้อ qty ชิ้น (บาท) = ต่ำสุดของราคา 1 ชิ้น ณ ตอนนี้ กับราคาขายส่งที่ถึงขั้น */
export function unitForQty(base: number, tiers: TierInfo | null | undefined, qty: number) {
  let price = base;
  if (base <= 0) return 0;
  for (const [min, t] of tiers ?? []) if (qty >= min && t < price) price = t;
  return price;
}

/** % ส่วนลด (ปัดเศษ) */
export const percentOff = (price: number, was: number) => (was > price && was > 0 ? Math.round((1 - price / was) * 100) : 0);

/** ราคาหลังลด x% ปัดเป็นบาทเต็ม (สตางค์) — ไม่ต่ำกว่า 1 บาท */
export function priceAfterPercent(priceSatang: number, pct: number) {
  return Math.max(100, Math.round((priceSatang * (100 - pct)) / 100 / 100) * 100);
}
