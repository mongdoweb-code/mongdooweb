// ค่าใช้จ่ายร้าน — หมวด/ตรวจค่า (ฟังก์ชันล้วน ใช้ได้ทั้ง server และเบราว์เซอร์)
// ซื้อสินค้าเข้าสต็อกไม่ใช่ค่าใช้จ่ายในหน้านี้ (บันทึกผ่านใบสั่งซื้อ PO → เป็นต้นทุนสินค้าในรายงานกำไร)

export const EXPENSE_CATEGORIES = [
  { key: "SHIPPING", label: "ค่าขนส่ง / ไปรษณีย์" },
  { key: "LABOR", label: "ค่าแรง / ค่าจ้างติดตั้ง" },
  { key: "SALARY", label: "เงินเดือน / สวัสดิการพนักงาน" },
  { key: "RENT", label: "ค่าเช่า" },
  { key: "UTILITIES", label: "ค่าน้ำ ไฟ โทรศัพท์ อินเทอร์เน็ต" },
  { key: "MARKETING", label: "ค่าโฆษณา / การตลาด" },
  { key: "FEES", label: "ค่าธรรมเนียมธนาคาร / แพลตฟอร์ม" },
  { key: "SUPPLIES", label: "วัสดุสิ้นเปลือง / อุปกรณ์สำนักงาน" },
  { key: "TRAVEL", label: "ค่าน้ำมัน / เดินทาง" },
  { key: "REPAIR", label: "ค่าซ่อมบำรุง" },
  { key: "TAX", label: "ภาษี / ค่าธรรมเนียมราชการ" },
  { key: "OTHER", label: "อื่น ๆ" },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];
export const EXPENSE_CAT_KEYS = EXPENSE_CATEGORIES.map((c) => c.key) as ExpenseCategory[];
export const expenseCatLabel = (k: string) => EXPENSE_CATEGORIES.find((c) => c.key === k)?.label ?? "อื่น ๆ";
export const EXPENSE_METHODS = ["เงินสด", "โอนเงิน", "บัตรเครดิต", "หักบัญชีอัตโนมัติ", "เช็ค"] as const;

/** ไฟล์หลักฐาน (ใบเสร็จ/บิล): รูปที่ระบบแปลงแล้ว หรือ PDF — เก็บแบบส่วนตัว (ไม่ผ่าน /media) */
export const EXPENSE_FILE_RE = /^expenses\/\d{4}\/\d{2}\/[a-z0-9]+\.(webp|pdf)$/;
export const EXPENSE_FILE_MAX = 10 * 1024 * 1024;

export type ExpenseInput = {
  date: string; category: string; description: string; payee: string; amount: string; vat: string; wht: string;
  method: string; reference: string; note: string;
};

const baht = (s: string) => {
  const t = String(s ?? "").replace(/[,\s฿]/g, "");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/** ตรวจ + แปลงค่า (เงินเป็นสตางค์) · errors = ชื่อช่องที่ผิด → ข้อความ */
export function parseExpense(v: ExpenseInput, today: string) {
  const errors: Record<string, string> = {};
  const amountSatang = baht(v.amount), vatSatang = baht(v.vat), whtSatang = baht(v.wht);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || v.date > today) errors.date = "วันที่ไม่ถูกต้อง (ห้ามเป็นวันในอนาคต)";
  if (!EXPENSE_CAT_KEYS.includes(v.category as ExpenseCategory)) errors.category = "เลือกหมวดค่าใช้จ่าย";
  const description = String(v.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (description.length < 2) errors.description = "กรุณาใส่รายละเอียด";
  if (!Number.isInteger(amountSatang) || amountSatang <= 0 || amountSatang > 10_000_000_00) errors.amount = "กรุณาใส่ยอดเงิน (มากกว่า 0)";
  if (!Number.isInteger(vatSatang) || vatSatang < 0 || (Number.isInteger(amountSatang) && vatSatang >= amountSatang)) errors.vat = "ภาษีซื้อต้องน้อยกว่ายอดรวม";
  if (!Number.isInteger(whtSatang) || whtSatang < 0 || (Number.isInteger(amountSatang) && whtSatang >= amountSatang)) errors.wht = "ภาษีที่หักไว้ต้องน้อยกว่ายอดรวม";
  const method = String(v.method ?? "").trim().slice(0, 40);
  if (!method) errors.method = "เลือกวิธีจ่าย";
  return {
    errors,
    data: {
      date: v.date, category: v.category as ExpenseCategory, description, payee: String(v.payee ?? "").trim().slice(0, 120) || null,
      amountSatang, vatSatang: vatSatang || 0, whtSatang: whtSatang || 0, method,
      reference: String(v.reference ?? "").trim().slice(0, 100) || null, note: String(v.note ?? "").trim().slice(0, 1000) || null,
    },
  };
}

/** เงินที่จ่ายออกจริง = ยอดรวม − ภาษีที่ร้านหัก ณ ที่จ่ายไว้ (ร้านนำส่งสรรพากรเอง) */
export const expenseCash = (e: { amountSatang: number; whtSatang: number }) => e.amountSatang - e.whtSatang;
/** ค่าใช้จ่ายที่นับในกำไร = ยอดรวม − ภาษีซื้อ (ภาษีซื้อขอคืนได้เมื่อจด VAT) */
export const expenseCost = (e: { amountSatang: number; vatSatang: number }, vatRegistered: boolean) => e.amountSatang - (vatRegistered ? e.vatSatang : 0);
