// แถบเมนูด่วนด้านบนหลังบ้าน: รายการที่เลือกได้ + ค่าเริ่มต้น + ตรวจค่าที่บันทึก (Admin.quickMenu) — ใช้ได้ทั้ง server/client
import { ADMIN_MENU } from "./admin-menu";
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

/** ปุ่ม "สร้างใหม่" (ทางลัดที่ไม่มีในเมนูซ้าย) */
const CREATE_ITEMS: QuickItem[] = [
  { key: "qt-new", label: "ออกใบเสนอราคา", href: "/admin/docs/QUOTATION/new/edit", icon: "qt", create: true, group: "สร้างใหม่" },
  { key: "iv-new", label: "ออกใบแจ้งหนี้", href: "/admin/docs/INVOICE/new/edit", icon: "iv", create: true, group: "สร้างใหม่" },
  { key: "product-new", label: "เพิ่มสินค้า", href: "/admin/products/new", icon: "products", create: true, group: "สร้างใหม่" },
  { key: "order-new", label: "สร้างคำสั่งซื้อ", href: "/admin/orders/new", icon: "orders", create: true, group: "สร้างใหม่" },
  { key: "customer-new", label: "เพิ่มลูกค้า", href: "/admin/customers/new", icon: "cust", create: true, group: "สร้างใหม่" },
  { key: "po-new", label: "สร้างใบสั่งซื้อ", href: "/admin/purchase-orders/new", icon: "po", create: true, ownerOnly: true, group: "สร้างใหม่" },
];

/** ทุกเมนู = ปุ่มสร้างใหม่ + ทุกเมนูซ้าย (src/lib/admin-menu.ts) ตามกลุ่มเดียวกับเมนูซ้าย — เพิ่มเมนูซ้ายแล้วมีให้เลือกที่นี่เอง */
export const QUICK_ITEMS: QuickItem[] = [
  ...CREATE_ITEMS,
  ...ADMIN_MENU.map((m) => ({ key: m.key, label: m.label, href: m.href, icon: m.icon, group: m.group, ...(m.ownerOnly ? { ownerOnly: true } : {}), ...(m.external ? { external: true } : {}) })),
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
