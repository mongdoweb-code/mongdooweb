// รูปแบบตัวเลขที่ใช้ทั้งฝั่ง server และ client
export const phoneDigits = (s: string) => s.replace(/\D/g, "");
/** 0801112222 → 080-111-2222, 021234567 → 02-123-4567 */
export const formatPhone = (s: string) => {
  const d = phoneDigits(s);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith("0")) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return s;
};
/** สตางค์ → "฿1,234" / "฿1,234.50" */
export const bahtText = (satang: number) =>
  "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 });
