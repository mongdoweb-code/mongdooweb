// ภาษีหัก ณ ที่จ่าย (ลูกค้านิติบุคคลหักไว้ตอนจ่ายเงิน แล้วออกหนังสือรับรอง 50 ทวิ ให้ร้าน) — ฟังก์ชันล้วน ใช้ได้ทั้ง server และเบราว์เซอร์
// หลัก: ฐานภาษี = ยอดก่อน VAT ของงวดที่ชำระ · ภาษีที่หัก = ฐาน × อัตรา · ยอดที่ตัดหนี้ (ใบเสร็จ) = เต็มจำนวน · เงินที่ได้รับจริง = ตัดหนี้ − ภาษีที่หัก

export const WHT_RATES = [
  { bp: 100, label: "1% — ค่าขนส่ง" },
  { bp: 200, label: "2% — ค่าโฆษณา" },
  { bp: 300, label: "3% — ค่าบริการ / ค่าจ้างทำของ / ค่าติดตั้ง" },
  { bp: 500, label: "5% — ค่าเช่า" },
] as const;
export const WHT_RATE_SET = new Set<number>(WHT_RATES.map((r) => r.bp));
/** ภาษีที่หักต้องไม่เกิน 15% ของยอดที่ตัดหนี้ (กันพิมพ์ผิด) */
export const WHT_MAX_SHARE = 0.15;

/** ฐานภาษีของงวดที่ชำระ (ยอดก่อน VAT ตามสัดส่วนของใบแจ้งหนี้) */
export function whtBase(amountSatang: number, invoice: { grandSatang: number; vatSatang: number }) {
  if (!invoice.grandSatang || amountSatang <= 0) return 0;
  return Math.round((amountSatang * (invoice.grandSatang - invoice.vatSatang)) / invoice.grandSatang);
}

/** ภาษีที่หัก = ฐาน × อัตรา (ปัดเป็นสตางค์) */
export const whtAmount = (baseSatang: number, rateBp: number) => Math.round((baseSatang * rateBp) / 10000);

/** ตรวจค่าที่ส่งมา (null = ถูกต้อง · ข้อความ = ผิด) */
export function whtError(amountSatang: number, rateBp: number, whtSatang: number): string | null {
  if (!whtSatang && !rateBp) return null;
  if (!WHT_RATE_SET.has(rateBp)) return "เลือกอัตราภาษีหัก ณ ที่จ่าย";
  if (!Number.isInteger(whtSatang) || whtSatang <= 0) return "กรุณาใส่ยอดภาษีที่ลูกค้าหักไว้";
  if (whtSatang > Math.round(amountSatang * WHT_MAX_SHARE)) return "ยอดภาษีหัก ณ ที่จ่ายสูงเกินไป — ตรวจตัวเลขอีกครั้ง";
  return null;
}

/** ข้อความบนใบเสร็จ */
export function whtLine(w: { rateBp: number; satang: number; certNo?: string | null }, amountSatang: number, money: (s: number) => string) {
  return `หักภาษี ณ ที่จ่าย ${w.rateBp / 100}% ${money(w.satang)} บาท${w.certNo ? ` (หนังสือรับรองเลขที่ ${w.certNo})` : ""} · รับเงินสุทธิ ${money(amountSatang - w.satang)} บาท`;
}
