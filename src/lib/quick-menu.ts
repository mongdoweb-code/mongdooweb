// แถบเมนูด่วนด้านบนหลังบ้าน: รายการที่เลือกได้ + ค่าเริ่มต้น + ตรวจค่าที่บันทึก (Admin.quickMenu) — ไม่มี import ใช้ได้ทั้ง server/client
// แต่ละคนตั้งเอง (เก็บที่บัญชีผู้ใช้) · เมนูเฉพาะเจ้าของร้านไม่แสดงให้พนักงาน (หน้าเหล่านั้นก็ตรวจสิทธิ์ซ้ำเองอยู่แล้ว)

export type QuickItem = {
  key: string;
  label: string;
  href: string;
  /** คีย์ไอคอนใน src/app/admin/_components/admin-icons.tsx */
  icon: string;
  /** ปุ่ม "สร้าง/เพิ่ม" — แสดงเครื่องหมาย + ที่ไอคอน */
  create?: boolean;
  ownerOnly?: boolean;
  /** เปิดแท็บใหม่ (หน้าร้าน) */
  external?: boolean;
  group: string;
};

export const QUICK_ITEMS: QuickItem[] = [
  { key: "qt-new", label: "ออกใบเสนอราคา", href: "/admin/docs/QUOTATION/new/edit", icon: "qt", create: true, group: "สร้างใหม่" },
  { key: "iv-new", label: "ออกใบแจ้งหนี้", href: "/admin/docs/INVOICE/new/edit", icon: "iv", create: true, group: "สร้างใหม่" },
  { key: "product-new", label: "เพิ่มสินค้า", href: "/admin/products/new", icon: "products", create: true, group: "สร้างใหม่" },
  { key: "order-new", label: "สร้างคำสั่งซื้อ", href: "/admin/orders/new", icon: "orders", create: true, group: "สร้างใหม่" },
  { key: "customer-new", label: "เพิ่มลูกค้า", href: "/admin/customers/new", icon: "cust", create: true, group: "สร้างใหม่" },
  { key: "po-new", label: "สร้างใบสั่งซื้อ", href: "/admin/purchase-orders/new", icon: "po", create: true, ownerOnly: true, group: "สร้างใหม่" },
  { key: "products", label: "สินค้า", href: "/admin/products", icon: "products", group: "สินค้าและสต็อก" },
  { key: "categories", label: "หมวดหมู่สินค้า", href: "/admin/categories", icon: "cats", group: "สินค้าและสต็อก" },
  { key: "stock", label: "สต็อก", href: "/admin/stock", icon: "stock", group: "สินค้าและสต็อก" },
  { key: "stock-count", label: "นับสต็อกทั้งร้าน", href: "/admin/stock/count", icon: "count", group: "สินค้าและสต็อก" },
  { key: "po", label: "ใบสั่งซื้อ (PO)", href: "/admin/purchase-orders", icon: "po", group: "สินค้าและสต็อก" },
  { key: "orders", label: "คำสั่งซื้อ", href: "/admin", icon: "orders", group: "งานขาย" },
  { key: "quotes", label: "ใบเสนอราคา", href: "/admin/docs/QUOTATION", icon: "qt", group: "งานขาย" },
  { key: "invoices", label: "ใบแจ้งหนี้", href: "/admin/docs/INVOICE", icon: "iv", group: "งานขาย" },
  { key: "receipts", label: "ใบเสร็จรับเงิน", href: "/admin/docs/RECEIPT", icon: "rc", group: "งานขาย" },
  { key: "customers", label: "ลูกค้า", href: "/admin/customers", icon: "cust", group: "งานขาย" },
  { key: "inquiries", label: "คำขอจากลูกค้า", href: "/admin/inquiries", icon: "inbox", group: "งานขาย" },
  { key: "tasks", label: "งานที่ต้องทำ", href: "/admin/tasks", icon: "task", group: "งานขาย" },
  { key: "dashboard", label: "ภาพรวม", href: "/admin/dashboard", icon: "dash", group: "รายงาน" },
  { key: "reports", label: "รายงานยอดขาย", href: "/admin/reports", icon: "report", group: "รายงาน" },
  { key: "daily", label: "ปิดยอดประจำวัน", href: "/admin/reports/daily", icon: "cash", group: "รายงาน" },
  { key: "receivables", label: "ลูกหนี้ค้างชำระ", href: "/admin/reports/receivables", icon: "debt", group: "รายงาน" },
  { key: "settings", label: "ตั้งค่าร้าน", href: "/admin/settings", icon: "settings", ownerOnly: true, group: "รายงาน" },
  { key: "shop", label: "ดูหน้าร้าน", href: "/", icon: "shop", external: true, group: "รายงาน" },
];

/** ค่าเริ่มต้น (ยังไม่เคยตั้ง) — เมนูที่ใช้บ่อย */
export const QUICK_DEFAULT = ["qt-new", "iv-new", "product-new", "products", "categories", "stock", "stock-count"];
/** เลือกได้สูงสุด — มากกว่านี้แถบยาวจนไม่ "ด่วน" */
export const QUICK_MAX = 10;

/** เมนูที่ผู้ใช้คนนี้เลือกได้ (พนักงานไม่เห็นเมนูเฉพาะเจ้าของร้าน) */
export const availableQuickItems = (owner: boolean) => QUICK_ITEMS.filter((i) => owner || !i.ownerOnly);

/** ค่าที่บันทึกไว้ → รายการคีย์ที่ใช้ได้จริง (ตัดคีย์ที่ไม่รู้จัก/ซ้ำ/ไม่มีสิทธิ์ · เกินจำนวนตัดทิ้ง) · null/ไม่ใช่ array = ค่าเริ่มต้น · [] = ซ่อนแถบ */
export function parseQuickMenu(v: unknown, owner: boolean): string[] {
  const allowed = new Set(availableQuickItems(owner).map((i) => i.key));
  const src = Array.isArray(v) ? v : QUICK_DEFAULT;
  const out: string[] = [];
  for (const k of src) if (typeof k === "string" && allowed.has(k) && !out.includes(k) && out.length < QUICK_MAX) out.push(k);
  return out;
}
