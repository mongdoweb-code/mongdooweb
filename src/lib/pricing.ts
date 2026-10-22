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
