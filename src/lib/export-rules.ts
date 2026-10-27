// กฎของไฟล์ส่งออกทั้งร้าน (/admin/export.zip) แบบ pure — ทดสอบใน tests/unit/privacy.test.ts

/** คอลัมน์ลับที่ตัดทิ้งทุกตาราง (เหลือ totpEnabled / mustChangePassword ไว้ได้ เพราะไม่ใช่ความลับ) */
export const SECRET_COLUMN = /^(passwordHash|totpSecret|backupCodes)$|token|secret|apikey|accesskey/i;

export const stripSecrets = (rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_COLUMN.test(k))));

/** ชื่อไฟล์เดิม (คงไว้ให้สคริปต์/สเปรดชีตที่เคยใช้) — ตารางอื่น: "SalesDocumentItem" → "sales_document_items.csv" */
const FILE: Record<string, string> = {
  Order: "orders", OrderItem: "order_items", PaymentSlip: "payment_slips", OrderEvent: "order_events", Customer: "customers",
  SalesDocument: "sales_documents", SalesDocumentItem: "sales_document_items", DocPayment: "doc_payments", SalesDocumentEvent: "doc_events",
  DocSequence: "doc_sequences", Product: "products", StockMovement: "stock_movements", Category: "categories", Inquiry: "inquiries",
  HeroSlide: "hero_slides", Page: "pages", ShopSetting: "shop_settings", Admin: "admin_users", AdminLog: "admin_log",
};
export const csvName = (t: string) => `${FILE[t] ?? `${t.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}s`}.csv`;
