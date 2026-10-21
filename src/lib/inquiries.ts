// คำขอจากลูกค้า (ขอใบเสนอราคา / ติดต่อร้าน) — ตรวจข้อมูล, เก็บรูปแนบแบบส่วนตัว, บันทึก Inquiry, ข้อความแจ้ง LINE ร้าน
// รูปแนบเก็บที่ prefix "inquiries/" ซึ่ง "ไม่อยู่" ใน MEDIA_PREFIXES → เปิดผ่าน /media ไม่ได้
// แอดมินเปิดดูได้ที่ GET /api/inquiries/:id/attachments/:n (ต้องเข้าสู่ระบบ)
import "server-only";
import type { InquiryKind, InquiryStatus } from "../../generated/prisma/client";
import { createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import { phoneDigits } from "@/lib/format";
import { siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { sniffImage, storage } from "@/lib/storage";
import { isThaiPhone } from "@/lib/thai-address";

export const INQUIRY_MAX_FILES = 3;
export const INQUIRY_FILE_MAX = 10 * 1024 * 1024; // ต่อรูป (เบราว์เซอร์ย่อให้ก่อนส่งอยู่แล้ว)
export const INQUIRY_PREFIX = "inquiries";

export type InquiryKindT = "QUOTE" | "CONTACT";
export type InquiryItem = { slug: string; name: string; qty: number };

export class InquiryError extends Error {
  constructor(message: string, readonly status = 400, readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** แฮช IP (ไม่เก็บ IP จริง) — ใช้ดูสแปมซ้ำจากที่เดียวกัน */
export const ipHash = (ip: string) => createHash("sha256").update(`mdw-inquiry|${ip}`).digest("hex").slice(0, 32);

/** สินค้าในตะกร้าที่แนบมา: ใช้ชื่อจากฐานข้อมูลเสมอ (ไม่เชื่อชื่อจากเบราว์เซอร์) */
async function parseItems(raw: string): Promise<InquiryItem[]> {
  let obj: unknown;
  try {
    obj = raw ? JSON.parse(raw) : {};
  } catch {
    return [];
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const wanted = Object.entries(obj as Record<string, unknown>)
    .map(([slug, q]) => [slug.slice(0, 120), Math.min(Math.max(1, Math.floor(Number(q) || 0)), 9999)] as const)
    .filter(([slug]) => slug)
    .slice(0, 30);
  if (!wanted.length) return [];
  const rows = await prisma.product.findMany({ where: { slug: { in: wanted.map(([s]) => s) }, isActive: true }, select: { slug: true, name: true } });
  const name = new Map(rows.map((r) => [r.slug, r.name]));
  return wanted.filter(([s]) => name.has(s)).map(([slug, qty]) => ({ slug, name: name.get(slug)!, qty }));
}

/** ย่อ/แปลงรูปเป็น WebP (ลบข้อมูล EXIF/GPS ออกด้วย) แล้วเก็บแบบส่วนตัว */
async function storeAttachment(f: File) {
  if (f.size > INQUIRY_FILE_MAX) throw new InquiryError("รูปแนบใหญ่เกิน 10 MB ต่อรูป", 400, { files: "รูปแนบใหญ่เกิน 10 MB ต่อรูป" });
  const buf = Buffer.from(await f.arrayBuffer());
  if (!sniffImage(buf)) throw new InquiryError("รูปแนบต้องเป็นไฟล์ภาพ JPG, PNG หรือ WEBP", 400, { files: "รูปแนบต้องเป็นไฟล์ภาพ JPG, PNG หรือ WEBP" });
  let out: Buffer;
  try {
    out = await sharp(buf, { failOn: "error" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new InquiryError("อ่านไฟล์รูปไม่ได้ (ไฟล์อาจเสีย)", 400, { files: "อ่านไฟล์รูปไม่ได้ (ไฟล์อาจเสีย)" });
  }
  const now = new Date();
  const key = `${INQUIRY_PREFIX}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now().toString(36)}${randomBytes(6).toString("hex")}.webp`;
  await storage().put(key, out);
  return key;
}

/** ตรวจ + บันทึกคำขอ — คืน id ของ Inquiry */
export async function createInquiry(form: FormData, kind: InquiryKindT, ip: string) {
  const v = {
    name: text(form.get("name"), 120),
    phone: phoneDigits(text(form.get("phone"), 20)),
    email: text(form.get("email"), 160),
    company: text(form.get("company"), 160),
    message: text(form.get("message"), 4000),
  };
  const fields: Record<string, string> = {};
  if (v.name.length < 2) fields.name = "กรุณากรอกชื่อ";
  if (!isThaiPhone(v.phone)) fields.phone = "เบอร์โทรไม่ถูกต้อง — มือถือ 10 หลัก หรือเบอร์บ้าน 9 หลัก";
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) fields.email = "รูปแบบอีเมลไม่ถูกต้อง";
  if (v.message.length < 10) fields.message = kind === "QUOTE" ? "กรุณาเล่ารายละเอียดงานอย่างน้อย 10 ตัวอักษร" : "กรุณาพิมพ์ข้อความอย่างน้อย 10 ตัวอักษร";
  const files = kind === "QUOTE" ? form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0) : [];
  if (files.length > INQUIRY_MAX_FILES) fields.files = `แนบรูปได้ไม่เกิน ${INQUIRY_MAX_FILES} รูป`;
  if (Object.keys(fields).length) throw new InquiryError(Object.values(fields)[0], 400, fields);

  const items = kind === "QUOTE" ? await parseItems(text(form.get("items"), 8000)) : [];
  const attachments: string[] = [];
  for (const f of files) attachments.push(await storeAttachment(f));

  const row = await prisma.inquiry.create({
    data: {
      kind, name: v.name, phone: v.phone, email: v.email || null, company: v.company || null, message: v.message,
      items, attachments, ipHash: ipHash(ip),
    },
  });
  return { id: row.id, ...v, items, attachments };
}

/** ข้อความแจ้งเตือนร้านทาง LINE (ไม่ใส่เบอร์/อีเมลลูกค้า — ดูในหลังบ้าน) */
export function inquiryMessage(i: { id: string; name: string; company: string; message: string; items: InquiryItem[]; attachments: string[] }, kind: InquiryKindT) {
  const head = kind === "QUOTE" ? "[คำขอใบเสนอราคาใหม่]" : "[ข้อความติดต่อใหม่]";
  const lines = [head, `จาก: ${i.name}${i.company ? ` (${i.company})` : ""}`];
  if (i.items.length) lines.push(`สินค้า: ${i.items.slice(0, 5).map((x) => `${x.name} × ${x.qty}`).join(", ")}${i.items.length > 5 ? ` และอีก ${i.items.length - 5} รายการ` : ""}`);
  if (i.attachments.length) lines.push(`รูปแนบ ${i.attachments.length} รูป`);
  lines.push(`ข้อความ: ${i.message.length > 160 ? i.message.slice(0, 159) + "…" : i.message}`);
  lines.push(`เปิดดู: ${siteUrl()}/admin/inquiries/${i.id}`);
  return lines.join("\n");
}

// ---------- ป้ายภาษาไทยและการอ่านค่า JSON (หลังบ้าน) ----------
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
