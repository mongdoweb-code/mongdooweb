// เครื่องคำนวณหม้อแปลง (U8) — คำนวณฝั่งเบราว์เซอร์ได้ (ไม่มี import ฝั่ง server)
// วัตต์รวม = วัตต์ต่อดวง × จำนวน (ทุกแถว) × 1.2 (เผื่อกำลัง 20% ให้หม้อแปลงไม่ทำงานเต็มพิกัด)
// แนะนำหม้อแปลงที่มีของ แรงดันตรงกัน และวัตต์ ≥ ที่ต้องการ ตัวที่เล็กที่สุดก่อน (ถูกและพอดีงาน)

export const PSU_FACTOR = 1.2;

export type PsuPower = { v: "12" | "24"; ac: boolean | null };
export type PsuItem = { id: string; name: string; price: number; inStock: boolean; img?: string; watt: number; power: PsuPower | null };
export type PsuLight = { id: string; name: string; watt: number; power: PsuPower | null; price: number };

/** แรงดันตรงกัน (ไม่ระบุ AC/DC ฝั่งใดฝั่งหนึ่ง = ถือว่าใช้ด้วยกันได้ตามแรงดัน) */
export const powerMatch = (a: PsuPower, b: PsuPower | null) => !!b && a.v === b.v && (a.ac === null || b.ac === null || a.ac === b.ac);
export const powerText = (p: PsuPower) => `${p.ac === null ? "" : p.ac ? "AC" : "DC"}${p.v}V`;

/** วัตต์จากข้อความ เช่น "120W", "(30W)", "12วัตต์", "9x1W" → 9 · ไม่พบ = null */
export function wattOf(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:x\s*1\s*)?(?:w(?![a-z])|วัตต์)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

export const neededWatt = (rows: { watt: number; qty: number }[]) =>
  Math.ceil(rows.reduce((s, r) => s + (r.watt > 0 && r.qty > 0 ? r.watt * r.qty : 0), 0) * PSU_FACTOR * 10) / 10;

export type PsuPick = { item: PsuItem; qty: number; total: number };

/**
 * หม้อแปลงที่แนะนำ: ตัวเดียวที่พอ (เล็กสุดก่อน แล้วถูกสุด) สูงสุด 3 ตัว
 * ไม่มีตัวเดียวที่พอ → ใช้ตัวใหญ่สุดหลายตัว (แบ่งโคมเป็นวงจร) จำนวนน้อยที่สุด
 */
export function recommendPsu(need: number, power: PsuPower | null, psus: PsuItem[]): { single: PsuPick[]; multi: PsuPick | null } {
  if (!(need > 0)) return { single: [], multi: null };
  const pool = psus.filter((p) => p.inStock && p.price > 0 && p.watt > 0 && (!power || powerMatch(power, p.power)));
  const single = pool
    .filter((p) => p.watt >= need)
    .sort((a, b) => a.watt - b.watt || a.price - b.price)
    .slice(0, 3)
    .map((item) => ({ item, qty: 1, total: item.price }));
  if (single.length || !pool.length) return { single, multi: null };
  const biggest = [...pool].sort((a, b) => b.watt - a.watt || a.price - b.price)[0];
  const qty = Math.ceil(need / biggest.watt);
  return { single, multi: { item: biggest, qty, total: biggest.price * qty } };
}
