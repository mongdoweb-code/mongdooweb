// คำขอจากลูกค้า (ขอใบเสนอราคา/ติดต่อ/เคลม) — ป้ายภาษาไทยและการอ่านค่า JSON ที่ลูกค้าส่งมา
import type { InquiryKind, InquiryStatus } from "../../generated/prisma/client";

export const INQ_KIND: Record<InquiryKind, string> = { QUOTE: "ขอใบเสนอราคา", CONTACT: "ติดต่อสอบถาม", CLAIM: "เคลม/รับประกัน" };
export const INQ_STATUS: Record<InquiryStatus, string> = { NEW: "ใหม่", IN_PROGRESS: "กำลังดำเนินการ", DONE: "เสร็จแล้ว", SPAM: "สแปม" };
export const INQ_STATUS_CLS: Record<InquiryStatus, string> = { NEW: "new", IN_PROGRESS: "warn", DONE: "ok", SPAM: "gray" };
export const isInqStatus = (s: string): s is InquiryStatus => s in INQ_STATUS;
export const isInqKind = (s: string): s is InquiryKind => s in INQ_KIND;

export type InqItem = { slug: string; name: string; qty: number };

export function parseInqItems(v: unknown): InqItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      const qty = Math.floor(Number(o.qty));
      return { slug: String(o.slug ?? "").slice(0, 200), name: String(o.name ?? o.slug ?? "").slice(0, 300), qty: qty > 0 && qty <= 100000 ? qty : 1 };
    })
    .filter((x) => x.slug || x.name)
    .slice(0, 100);
}

/** storage key ของรูปแนบ — รับทั้ง "key" และ { key } (ข้ามค่าอื่น) */
export const parseAttachments = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { key?: unknown }).key === "string" ? (x as { key: string }).key : ""))
        .filter(Boolean)
        .slice(0, 20)
    : [];
