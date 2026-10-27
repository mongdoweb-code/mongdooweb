// เปรียบเทียบข้อมูลก่อน/หลังแก้ (A29) — ใช้ได้ทั้งฝั่ง server และหน้า /admin/log (ไม่แตะฐานข้อมูล)
// - ไม่เก็บความลับ: รหัสผ่าน, secret 2 ขั้น, token, รหัสสำรอง, คีย์ API
// - ข้อความยาว (คำอธิบาย HTML) ตัดเหลือ 300 ตัวอักษร · วันที่เป็น ISO · Json/Array เทียบแบบ JSON

export type Diff = Record<string, [unknown, unknown]>;

/** ชื่อฟิลด์ที่ห้ามบันทึกลง diff เด็ดขาด */
export const SECRET_FIELD = /password|totp|secret|token|backupcodes|apikey|accesskey|session/i;
/** ต้นทุน — พนักงาน (STAFF) ต้องไม่เห็น */
export const COST_FIELDS = new Set(["costSatang"]);

const MAX = 300;
function norm(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v.length > MAX ? `${v.slice(0, MAX)}… (${v.length} ตัวอักษร)` : v;
  if (typeof v === "bigint") return Number(v);
  if (v && typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 2000 ? `${s.slice(0, MAX)}…` : JSON.parse(s);
  }
  return v;
}
const empty = (v: unknown) => v === null || v === undefined || v === "";
function same(a: unknown, b: unknown) {
  if (empty(a) && empty(b)) return true;
  if (a instanceof Date || b instanceof Date) return norm(a) === norm(b);
  if ((a && typeof a === "object") || (b && typeof b === "object")) return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return a === b;
}

const SKIP = new Set(["id", "createdAt", "updatedAt"]);

/**
 * ฟิลด์ที่เปลี่ยน { field: [ก่อน, หลัง] } — null = ไม่มีอะไรเปลี่ยน
 * fields: เทียบเฉพาะฟิลด์เหล่านี้ (ค่าเริ่มต้น = ทุกคีย์ของ after ที่ไม่ใช่ undefined)
 */
export function diffOf(before: object | null | undefined, after: object, fields?: string[]): Diff | null {
  const A = (before ?? {}) as Record<string, unknown>, B = after as Record<string, unknown>;
  const keys = fields ?? Object.keys(B).filter((k) => B[k] !== undefined);
  const out: Diff = {};
  for (const k of keys) {
    if (SKIP.has(k) || SECRET_FIELD.test(k)) continue;
    if (!same(A[k], B[k])) out[k] = [norm(A[k]), norm(B[k])];
  }
  return Object.keys(out).length ? out : null;
}

/** diff ที่ผู้ใช้คนนี้ดูได้ (พนักงานไม่เห็นต้นทุน) */
export function visibleDiff(diff: unknown, owner: boolean): Diff | null {
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
  const out: Diff = {};
  for (const [k, v] of Object.entries(diff as Record<string, unknown>)) {
    if (SECRET_FIELD.test(k) || (!owner && COST_FIELDS.has(k)) || !Array.isArray(v)) continue;
    out[k] = [v[0], v[1]];
  }
  return Object.keys(out).length ? out : null;
}

/** ชื่อฟิลด์ภาษาไทยสำหรับแสดงในบันทึก (ไม่มีในรายการ = แสดงชื่อฟิลด์เดิม) */
export const FIELD_LABEL: Record<string, string> = {
  name: "ชื่อ", slug: "ลิงก์ (slug)", sku: "รหัสสินค้า", categoryId: "หมวด", unit: "หน่วย", priceSatang: "ราคา (สตางค์)",
  compareAtSatang: "ราคาก่อนลด (สตางค์)", trackStock: "นับสต็อก", stock: "สต็อก", inStock: "มีของ", isActive: "เปิดขาย",
  isBestSeller: "ขายดี", badge: "ป้าย", shortDescription: "คำอธิบายสั้น", description: "รายละเอียด", keywords: "คำค้น",
  seoTitle: "SEO title", seoDescription: "SEO description", weightGram: "น้ำหนัก (กรัม)", specs: "สเปก", images: "รูป",
  useAreas: "พื้นที่ใช้งาน", lightColor: "สีไฟ", includesPsu: "มีหม้อแปลง", isAccessory: "อุปกรณ์เสริม", costSatang: "ต้นทุน (สตางค์)",
  customerName: "ชื่อผู้รับ", phone: "เบอร์โทร", email: "อีเมล", addressLine: "ที่อยู่", subdistrict: "ตำบล/แขวง", district: "อำเภอ/เขต",
  province: "จังหวัด", postalCode: "รหัสไปรษณีย์", note: "หมายเหตุ", taxInvoice: "ใบกำกับภาษี", tags: "แท็ก",
  legalName: "ชื่อร้าน", addressText: "ที่อยู่ร้าน", lineId: "LINE ID", bankAccounts: "บัญชีธนาคาร", promptpayId: "พร้อมเพย์",
  promptpayName: "ชื่อพร้อมเพย์", shippingTiers: "ค่าส่ง", vatEnabled: "คิด VAT", vatMode: "รูปแบบ VAT", taxId: "เลขผู้เสียภาษี",
  logoKey: "โลโก้", ga4Id: "GA4", metaPixelId: "Meta Pixel", announcementText: "ข้อความแถบประกาศ", announcementEnabled: "แสดงแถบประกาศ",
  autoCancelDays: "ยกเลิกอัตโนมัติ (วัน)", lowStockThreshold: "เกณฑ์สินค้าใกล้หมด", backupRetentionDays: "เก็บสำรองข้อมูล (วัน)",
};
