// แม่แบบอีเมลลูกค้า (ส่วนคำนวณล้วน ไม่มี import ฝั่ง server → ทดสอบหน่วยได้) — ใช้ผ่าน src/lib/email.ts
export const EMAIL_TEMPLATES = ["ORDER_RECEIVED", "PAID", "SHIPPED"] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];
export type TemplateText = { subject: string; body: string };

export const TEMPLATE_LABEL: Record<EmailTemplate | "TEST", string> = {
  ORDER_RECEIVED: "ได้รับคำสั่งซื้อ",
  PAID: "ชำระเงินแล้ว",
  SHIPPED: "จัดส่งแล้ว",
  TEST: "ทดสอบ",
};

/** ตัวแปรที่ใช้ในแม่แบบได้ */
export const TEMPLATE_VARS = ["{orderNo}", "{name}", "{total}", "{tracking}", "{trackUrl}", "{orderUrl}", "{shop}"];

export const DEFAULT_TEMPLATES: Record<EmailTemplate, TemplateText> = {
  ORDER_RECEIVED: {
    subject: "ได้รับคำสั่งซื้อ {orderNo} แล้ว — {shop}",
    body: "เรียนคุณ{name}\n\nร้านได้รับคำสั่งซื้อเลขที่ {orderNo} ยอดชำระ {total} แล้ว ขอบคุณที่สั่งซื้อครับ\n\nดู/พิมพ์ใบสั่งซื้อ: {orderUrl}\nติดตามสถานะและแนบสลิป: {trackUrl}\n\n{shop}",
  },
  PAID: {
    subject: "ยืนยันการชำระเงิน {orderNo} — {shop}",
    body: "เรียนคุณ{name}\n\nร้านยืนยันคำสั่งซื้อ {orderNo} ยอด {total} เรียบร้อยแล้ว กำลังเตรียมจัดส่งสินค้าให้\n\nติดตามสถานะ: {trackUrl}\n\n{shop}",
  },
  SHIPPED: {
    subject: "จัดส่งสินค้าแล้ว {orderNo} — {shop}",
    body: "เรียนคุณ{name}\n\nร้านจัดส่งคำสั่งซื้อ {orderNo} แล้ว\nเลขพัสดุ: {tracking}\n\nติดตามสถานะ: {trackUrl}\n\n{shop}",
  },
};

/** แม่แบบที่ร้านแก้ไว้ (ช่องที่ว่าง = ใช้ค่าเริ่มต้น) */
export function parseTemplates(v: unknown): Record<EmailTemplate, TemplateText> {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out = {} as Record<EmailTemplate, TemplateText>;
  for (const k of EMAIL_TEMPLATES) {
    const t = o[k] && typeof o[k] === "object" ? (o[k] as Record<string, unknown>) : {};
    const subject = typeof t.subject === "string" && t.subject.trim() ? t.subject.trim().slice(0, 200) : DEFAULT_TEMPLATES[k].subject;
    const body = typeof t.body === "string" && t.body.trim() ? t.body.slice(0, 5000) : DEFAULT_TEMPLATES[k].body;
    out[k] = { subject, body };
  }
  return out;
}

/** แม่แบบ "รับสินค้าที่ร้านแล้ว" (คำสั่งซื้อรับที่ร้าน ใช้แทนแม่แบบจัดส่งแล้ว — ไม่มีเลขพัสดุ) */
export const PICKUP_DONE_TEMPLATE: TemplateText = {
  subject: "รับสินค้าเรียบร้อย {orderNo} — {shop}",
  body: "เรียนคุณ{name}\n\nคุณรับสินค้าตามคำสั่งซื้อ {orderNo} ที่ร้านเรียบร้อยแล้ว ขอบคุณที่ใช้บริการครับ\n\nดู/พิมพ์ใบสั่งซื้อ: {orderUrl}\n\n{shop}",
};

/** แม่แบบที่ใช้จริง: คำสั่งซื้อรับที่ร้าน + แม่แบบจัดส่งแล้ว → แม่แบบรับสินค้าที่ร้าน (ห้ามแสดงเลขพัสดุ) */
export function templateFor(templates: Record<EmailTemplate, TemplateText>, template: EmailTemplate, o: { shippingMethod: string }): TemplateText {
  return template === "SHIPPED" && o.shippingMethod === "pickup" ? PICKUP_DONE_TEMPLATE : templates[template];
}

export function renderTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

