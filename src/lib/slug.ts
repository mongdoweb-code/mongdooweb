// ลิงก์สินค้า /product/<slug> — รองรับภาษาไทยแบบยาวเหมือนเว็บเดิม (WooCommerce) เช่น
//   /product/ไฟส่องต้นไม้-ไฟส่องส่วนหย่อม-48w-แสงวอร์มไวท์-3200k
// อักษรที่ใช้ได้: ภาษาไทย (พยัญชนะ สระ วรรณยุกต์ เลขไทย) · a-z · 0-9 · คั่นด้วย "-"
// ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ (ไม่มี import)

/** ความยาวสูงสุด (ตัวอักษร) — URL เดิมยาวสุด ~110 ตัว */
export const PRODUCT_SLUG_MAX = 200;
/** ความยาวเมื่อสร้างจากชื่อสินค้าอัตโนมัติ (ตัดที่ขอบคำ) */
const FROM_NAME_MAX = 120;

// ไทย: ก-ฺ (0E01–0E3A) · เ-๎ (0E40–0E4E) · ๐-๙ (0E50–0E59) — ไม่รวมสัญลักษณ์ ฿ ๏ ๚ ๛
const CH = "a-z0-9\\u0E01-\\u0E3A\\u0E40-\\u0E4E\\u0E50-\\u0E59";
export const PRODUCT_SLUG_RE = new RegExp(`^[${CH}]+(?:-[${CH}]+)*$`, "u");
const NOT_ALLOWED = new RegExp(`[^${CH}]+`, "gu");

/** ทำความสะอาดลิงก์ที่พิมพ์เอง: ตัวเล็ก · เว้นวรรค/อักษรอื่น → "-" · ไม่มี "-" ซ้อน/หัวท้าย */
export function cleanProductSlug(raw: string, max = PRODUCT_SLUG_MAX): string {
  let s = raw.normalize("NFC").toLowerCase().trim().replace(NOT_ALLOWED, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > max) {
    s = s.slice(0, max);
    const cut = s.lastIndexOf("-");
    if (cut > max * 0.6) s = s.slice(0, cut); // ตัดที่ขอบคำ ไม่ให้คำสุดท้ายขาดครึ่ง
    s = s.replace(/-+$/, "");
  }
  return s;
}

/** สร้างลิงก์จากชื่อสินค้า เช่น "ไฟส่องต้นไม้ 10W (แสงวอร์มไวท์)" → "ไฟส่องต้นไม้-10w-แสงวอร์มไวท์" */
export const slugFromName = (name: string) => cleanProductSlug(name, FROM_NAME_MAX);

export const isProductSlug = (s: string) => s.length > 0 && s.length <= PRODUCT_SLUG_MAX && PRODUCT_SLUG_RE.test(s);
