// ชื่อภาษาไทยของชนิดบันทึก (รวมชนิดใหม่ของระบบผู้ใช้/เนื้อหา/คำขอ) + ตัวกรองที่ใช้ร่วมกันระหว่างหน้าและไฟล์ CSV
import type { Prisma } from "../../../../../generated/prisma/client";
import { LOG_TYPES } from "@/lib/admin-log";

export const ALL_LOG_TYPES: Record<string, string> = {
  ...LOG_TYPES,
  DENIED: "ถูกปฏิเสธสิทธิ์",
  SESSION_REVOKE: "ออกจากระบบอุปกรณ์อื่น",
  TWO_FACTOR: "ยืนยันตัวตน 2 ขั้น",
  INQUIRY: "คำขอจากลูกค้า",
  PAGES: "หน้าเนื้อหา",
  FAQ: "คำถามที่พบบ่อย",
  DATA_EXPORT: "ส่งออกข้อมูลทั้งหมด",
  LOG_EXPORT: "ส่งออกบันทึกการใช้งาน",
  CUSTOMER_EXPORT: "ส่งออกรายชื่อลูกค้า",
  CUSTOMER_MERGE: "รวมลูกค้าซ้ำ",
  SYSTEM: "ทดสอบระบบ",
  ORDER: "คำสั่งซื้อ",
  STOCK: "สต็อก",
  CRON: "งานอัตโนมัติ",
  CRON_DAILY: "งานอัตโนมัติรายวัน",
};

export const LOG_TABS = {
  all: { label: "ทั้งหมด", types: null },
  auth: { label: "เข้าสู่ระบบ/ความปลอดภัย", types: ["LOGIN", "LOGIN_FAIL", "LOCKOUT", "LOGOUT", "IDLE_LOGOUT", "PASSWORD", "ADMIN_USER", "DENIED", "SESSION_REVOKE", "TWO_FACTOR"] },
  orders: { label: "คำสั่งซื้อ", types: [] },
  ops: { label: "งานร้าน/สต็อก/อัตโนมัติ", types: ["ORDER", "STOCK", "CRON", "CRON_DAILY", "LABEL"] },
  content: { label: "สินค้าและเนื้อหา", types: ["PRODUCT", "CATEGORY", "SLIDES", "CONTENT_ROLLBACK", "PAGES", "FAQ"] },
  docs: { label: "เอกสารขาย/ลูกค้า", types: ["DOC", "CUSTOMER", "LABEL", "INQUIRY", "CUSTOMER_MERGE", "CUSTOMER_EXPORT"] },
  settings: { label: "ตั้งค่า/ส่งออก", types: ["SETTINGS", "ORDERS_EXPORT", "DATA_EXPORT", "LOG_EXPORT", "SYSTEM"] },
  line: { label: "แจ้งเตือน LINE", types: ["LINE"] },
} as const;
export type LogTab = keyof typeof LOG_TABS;

export const ORDER_EVENT: Record<string, string> = { CREATED: "สร้างคำสั่งซื้อ", SLIP_UPLOADED: "แนบสลิป", APPROVED: "อนุมัติการชำระเงิน", REJECTED: "ปฏิเสธสลิป", REOPENED: "เปิดตรวจใหม่", SHIPPED: "จัดส่ง", CANCELLED: "ยกเลิก", NOTE: "โน้ตภายใน", EDITED: "แก้ไขข้อมูลผู้รับ", REFUNDED: "ยกเลิกและคืนเงิน" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymd = /^\d{4}-\d{2}-\d{2}$/;

export type LogFilter = { tab: LogTab; q: string; user: string; from: string; to: string; page: number };

export function parseLogFilter(sp: Record<string, string | string[] | undefined>): LogFilter {
  const tab = one(sp.tab) in LOG_TABS ? (one(sp.tab) as LogTab) : "all";
  const from = ymd.test(one(sp.from)) ? one(sp.from) : "";
  let to = ymd.test(one(sp.to)) ? one(sp.to) : "";
  if (from && to && to < from) to = from;
  return { tab, q: one(sp.q).trim().slice(0, 80), user: one(sp.user).slice(0, 40), from, to, page: Math.max(1, Math.floor(Number(one(sp.page))) || 1) };
}

/** ช่วงวันที่ตามเวลาไทย → เงื่อนไข createdAt */
export function dateWhere(f: LogFilter) {
  if (!f.from && !f.to) return undefined;
  return {
    ...(f.from ? { gte: new Date(`${f.from}T00:00:00+07:00`) } : {}),
    ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00+07:00`).getTime() + 864e5) } : {}),
  };
}

export function adminLogWhere(f: LogFilter): Prisma.AdminLogWhereInput {
  const types = LOG_TABS[f.tab].types;
  const at = dateWhere(f);
  return {
    ...(types ? { type: { in: [...types] } } : {}),
    ...(f.q ? { note: { contains: f.q, mode: "insensitive" } } : {}),
    ...(f.user === "none" ? { adminId: null } : f.user ? { adminId: f.user } : {}),
    ...(at ? { createdAt: at } : {}),
  };
}

export function orderEventWhere(f: LogFilter): Prisma.OrderEventWhereInput {
  const at = dateWhere(f);
  return {
    ...(f.q ? { OR: [{ note: { contains: f.q, mode: "insensitive" } }, { order: { orderNo: { contains: f.q, mode: "insensitive" } } }] } : {}),
    ...(f.user === "none" ? { adminId: null } : f.user ? { adminId: f.user } : {}),
    ...(at ? { createdAt: at } : {}),
  };
}

export const logQuery = (f: LogFilter, patch: Partial<Record<keyof LogFilter, string>> = {}) => {
  const base: Record<string, string> = { tab: f.tab === "all" ? "" : f.tab, q: f.q, user: f.user, from: f.from, to: f.to, page: f.page > 1 ? String(f.page) : "" };
  const s = new URLSearchParams(Object.entries({ ...base, ...patch }).filter(([, v]) => v)).toString();
  return s ? `?${s}` : "";
};
