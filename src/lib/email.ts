// อีเมลแจ้งลูกค้า (U23/A19): รับคำสั่งซื้อ / ชำระแล้ว / จัดส่ง (พร้อมเลขพัสดุ) ผ่าน SMTP
// ค่าเชื่อมต่ออยู่ใน env เท่านั้น: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM (ไม่เก็บในฐานข้อมูล)
// - ส่งเมื่อร้านเปิด "ส่งอีเมลลูกค้า" และลูกค้ากรอกอีเมล · แม่แบบแก้ได้ในหลังบ้าน (ShopSetting.emailTemplates)
// - ไม่มีค่า SMTP = บันทึก SKIPPED · ส่งไม่สำเร็จ = FAILED — ไม่ทำให้งานหลัก (สั่งซื้อ/อนุมัติ/จัดส่ง) ล้มเด็ดขาด (เรียกใน after())
// - ส่งแต่ละแม่แบบครั้งเดียวต่อคำสั่งซื้อ (ดูจาก EmailLog ที่ SENT แล้ว)
import "server-only";
import nodemailer from "nodemailer";
import { carrierTrackUrl } from "@/lib/carriers";
import { siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";

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

export function renderTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

const env = (k: string) => process.env[k]?.trim() ?? "";
/** ค่าตัวอย่างจาก .env.example (smtp.example.com / change-me) = ยังไม่ได้ตั้งค่าจริง → ไม่พยายามส่ง */
export const isPlaceholderSmtp = (host: string, password: string, from: string) =>
  /(^|\.)example\.(com|org|net)$/i.test(host) || /^(change-?me|changeme|xxx+|your[-_]?password)$/i.test(password) || /@example\.(com|org|net)>?$/i.test(from);
/** สถานะการตั้งค่า SMTP (ไม่เปิดเผยรหัสผ่าน) */
export function smtpStatus() {
  const host = env("SMTP_HOST"), from = env("SMTP_FROM") || env("SMTP_USER");
  const placeholder = !!host && isPlaceholderSmtp(host, env("SMTP_PASSWORD"), from);
  return { configured: !!host && !!from && !placeholder, placeholder, host, port: Number(env("SMTP_PORT")) || 587, user: env("SMTP_USER"), from };
}

let transport: nodemailer.Transporter | null = null;
function mailer() {
  if (transport) return transport;
  const s = smtpStatus();
  transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: s.user ? { user: s.user, pass: env("SMTP_PASSWORD") } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transport;
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** เนื้อหา HTML แบบเรียบ (ข้อความหลบอักขระพิเศษ + ลิงก์กดได้) */
function htmlBody(text: string) {
  const linked = escHtml(text).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);
  return `<div style="font-family:Tahoma,sans-serif;font-size:15px;line-height:1.6;color:#1c1c1c">${linked.replace(/\n/g, "<br>")}</div>`;
}

type SendResult = { status: "SENT" | "FAILED" | "SKIPPED"; error?: string };

async function deliver(to: string, subject: string, body: string): Promise<SendResult> {
  const st = smtpStatus();
  if (!st.configured) return { status: "SKIPPED", error: st.placeholder ? "ค่า SMTP ยังเป็นค่าตัวอย่าง (smtp.example.com / change-me) — ไม่ได้ส่ง" : "ยังไม่ได้ตั้งค่า SMTP (SMTP_HOST/SMTP_FROM)" };
  try {
    await mailer().sendMail({ from: smtpStatus().from, to, subject: subject.replace(/[\r\n]+/g, " "), text: body, html: htmlBody(body) });
    return { status: "SENT" };
  } catch (e) {
    return { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

const baht = (satang: number) => "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 });

/**
 * ส่งอีเมลแจ้งลูกค้าตามแม่แบบ — เรียกใน after() เท่านั้น ไม่โยน error
 * ไม่ส่งซ้ำ: แม่แบบเดียวกันที่ SENT แล้วกับคำสั่งซื้อนี้จะข้าม
 */
export async function sendOrderEmail(orderNo: string, template: EmailTemplate) {
  try {
    const [s, o] = await Promise.all([
      prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { emailEnabled: true, emailTemplates: true, legalName: true } }),
      prisma.order.findUnique({ where: { orderNo } }),
    ]);
    if (!s?.emailEnabled || !o?.email) return;
    if (await prisma.emailLog.findFirst({ where: { orderId: o.id, template, status: "SENT" }, select: { id: true } })) return;
    const t = parseTemplates(s.emailTemplates)[template];
    const trackUrl = `${siteUrl()}/track?no=${encodeURIComponent(o.orderNo)}`;
    const vars = {
      orderNo: o.orderNo, name: o.customerName, total: baht(o.totalSatang), shop: s.legalName, trackUrl,
      orderUrl: o.publicToken ? `${siteUrl()}/track/order/${encodeURIComponent(o.orderNo)}?t=${o.publicToken}` : trackUrl,
      tracking: o.trackingNo ? `${o.trackingNo}${o.carrier ? ` (${o.carrier})` : ""}${carrierTrackUrl(o.carrier, o.trackingNo) ? ` ${carrierTrackUrl(o.carrier, o.trackingNo)}` : ""}` : "-",
    };
    const r = await deliver(o.email, renderTemplate(t.subject, vars), renderTemplate(t.body, vars));
    await prisma.emailLog.create({ data: { to: o.email, template, orderId: o.id, status: r.status, error: r.error ?? null } });
    if (r.status === "SENT") await prisma.orderEvent.create({ data: { orderId: o.id, type: "EMAILED", note: `ส่งอีเมล "${TEMPLATE_LABEL[template]}" ถึง ${o.email}`, notified: true } });
  } catch (e) {
    await prisma.emailLog
      .create({ data: { to: "-", template, status: "FAILED", error: `ระบบ: ${(e instanceof Error ? e.message : String(e)).slice(0, 280)}` } })
      .catch(() => {});
  }
}

/** ส่งอีเมลทดสอบ (ปุ่มในหน้าตั้งค่า) — ใช้แม่แบบที่เลือกกับข้อมูลตัวอย่าง */
export async function sendTestEmail(to: string, template: EmailTemplate, templates: unknown, shopName: string) {
  const t = parseTemplates(templates)[template];
  const vars = {
    orderNo: "MDW-000000-0000", name: "ลูกค้าตัวอย่าง", total: "฿1,234", tracking: "TH0123456789 (Kerry Express)", shop: shopName,
    trackUrl: `${siteUrl()}/track`, orderUrl: `${siteUrl()}/track`,
  };
  const r = await deliver(to, `[ทดสอบ] ${renderTemplate(t.subject, vars)}`, renderTemplate(t.body, vars));
  await prisma.emailLog.create({ data: { to, template: "TEST", status: r.status, error: r.error ?? null } });
  return r;
}
