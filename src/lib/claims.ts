// เคลมประกัน / คืน-เปลี่ยนสินค้า (U16/U17/A16) — แทนคำขอชนิด CLAIM เดิมในกล่องคำขอ (คำขอเก่ายังเปิดอ่านได้)
// - ยืนยันตัวตนด้วยเลขที่คำสั่งซื้อ + เบอร์โทร (ข้อความผิดเหมือนกันทุกกรณี ไม่บอกใบ้ว่าเลขที่มีจริง)
// - ประกัน 1 ปีนับจากวันที่ชำระเงิน · คืน/เปลี่ยน (เสียหายจากขนส่ง) ภายใน 7 วันนับจากวันจัดส่ง (ยังไม่ส่ง = วันที่ชำระ)
// - รูปอาการเสีย ≤ 4 รูป แปลงเป็น WebP (ลบ EXIF/GPS) เก็บแบบส่วนตัวที่ "claims/" — เปิดได้จากหลังบ้านเท่านั้น
// - เลขที่ CL+YYMM-NNNNN จองใน transaction (src/lib/sequence.ts)
import "server-only";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import type { ClaimKind, ClaimStatus, OrderStatus } from "../../generated/prisma/client";
import { formatPhone, phoneDigits } from "@/lib/format";
import { siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { nextSeq } from "@/lib/sequence";
import { sniffImage, storage } from "@/lib/storage";

export const CLAIM_PREFIX = "claims";
export const CLAIM_MAX_FILES = 4;
export const CLAIM_FILE_MAX = 10 * 1024 * 1024;
export const WARRANTY_DAYS = 365;
export const RETURN_DAYS = 7;
const DAY = 864e5;

export const CLAIM_KIND: Record<ClaimKind, string> = { WARRANTY: "เคลมประกัน", RETURN: "คืน/เปลี่ยนสินค้า (เสียหายจากขนส่ง)" };
export const CLAIM_STATUS: Record<ClaimStatus, string> = {
  NEW: "รับเรื่องแล้ว",
  REVIEWING: "กำลังตรวจสอบ",
  APPROVED: "อนุมัติ",
  REJECTED: "ไม่อนุมัติ",
  RESOLVED: "ดำเนินการเสร็จแล้ว",
};
export const CLAIM_STATUS_CLS: Record<ClaimStatus, string> = { NEW: "new", REVIEWING: "warn", APPROVED: "ok", REJECTED: "gray", RESOLVED: "ok" };
export const isClaimStatus = (s: string): s is ClaimStatus => s in CLAIM_STATUS;

export class ClaimError extends Error {
  constructor(message: string, readonly status = 400, readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

const CLAIMABLE: OrderStatus[] = ["PAID", "SHIPPED"];
const NOT_FOUND = "ไม่พบคำสั่งซื้อ ตรวจเลขที่คำสั่งซื้อและเบอร์โทรอีกครั้ง";

export type ClaimItem = { itemId: string; productId: string | null; name: string; qty: number };

/** ระยะประกัน/คืนสินค้าของคำสั่งซื้อ */
export function claimWindows(o: { paidAt: Date | null; shippedAt: Date | null }, now = new Date()) {
  const warrantyUntil = o.paidAt ? new Date(o.paidAt.getTime() + WARRANTY_DAYS * DAY) : null;
  const from = o.shippedAt ?? o.paidAt;
  const returnUntil = from ? new Date(from.getTime() + RETURN_DAYS * DAY) : null;
  return {
    warrantyUntil,
    returnUntil,
    inWarranty: !!warrantyUntil && now <= warrantyUntil,
    canReturn: !!returnUntil && now <= returnUntil,
  };
}

/** คำสั่งซื้อที่ยืนยันตัวตนแล้ว (เลขที่ + เบอร์) — null ถ้าไม่ตรง */
export async function findClaimOrder(orderNoRaw: string, phoneRaw: string) {
  const orderNo = orderNoRaw.trim().toUpperCase().slice(0, 40);
  const phone = phoneDigits(phoneRaw).slice(0, 12);
  if (!orderNo || phone.length < 9) return null;
  const o = await prisma.order.findUnique({ where: { orderNo }, include: { items: { orderBy: { id: "asc" } } } });
  if (!o || phoneDigits(o.phone) !== phone) return null;
  return o;
}

/** ข้อมูลสำหรับฟอร์มขั้นที่ 2 (เลือกสินค้า/ประเภท) */
export async function claimLookup(orderNo: string, phone: string) {
  const o = await findClaimOrder(orderNo, phone);
  if (!o) throw new ClaimError(NOT_FOUND, 404);
  if (!CLAIMABLE.includes(o.status))
    throw new ClaimError(o.status === "CANCELLED" ? "คำสั่งซื้อนี้ถูกยกเลิกแล้ว แจ้งเคลมไม่ได้" : "แจ้งเคลม/คืนสินค้าได้หลังร้านยืนยันการชำระเงินแล้ว", 409);
  const w = claimWindows(o);
  return {
    orderNo: o.orderNo,
    name: o.customerName,
    paidAt: o.paidAt?.toISOString() ?? null,
    shippedAt: o.shippedAt?.toISOString() ?? null,
    warrantyUntil: w.warrantyUntil?.toISOString() ?? null,
    returnUntil: w.returnUntil?.toISOString() ?? null,
    inWarranty: w.inWarranty,
    canReturn: w.canReturn,
    items: o.items.map((i) => ({ id: i.id, name: i.nameSnapshot, qty: i.qty })),
  };
}

async function storePhoto(f: File) {
  if (f.size > CLAIM_FILE_MAX) throw new ClaimError("รูปใหญ่เกิน 10 MB ต่อรูป", 400, { files: "รูปใหญ่เกิน 10 MB ต่อรูป" });
  const buf = Buffer.from(await f.arrayBuffer());
  if (!sniffImage(buf)) throw new ClaimError("รูปต้องเป็นไฟล์ภาพ JPG, PNG หรือ WEBP", 400, { files: "รูปต้องเป็นไฟล์ภาพ JPG, PNG หรือ WEBP" });
  let out: Buffer;
  try {
    out = await sharp(buf, { failOn: "error" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new ClaimError("อ่านไฟล์รูปไม่ได้ (ไฟล์อาจเสีย)", 400, { files: "อ่านไฟล์รูปไม่ได้ (ไฟล์อาจเสีย)" });
  }
  const now = new Date();
  const key = `${CLAIM_PREFIX}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now().toString(36)}${randomBytes(6).toString("hex")}.webp`;
  await storage().put(key, out);
  return key;
}

const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** บันทึกเรื่องเคลม (multipart: orderNo, phone, kind, items = JSON [{ id, qty }], issue, files[]) */
export async function createClaim(form: FormData) {
  const o = await findClaimOrder(text(form.get("orderNo"), 40), text(form.get("phone"), 20));
  if (!o) throw new ClaimError(NOT_FOUND, 404);
  if (!CLAIMABLE.includes(o.status)) throw new ClaimError("แจ้งเคลม/คืนสินค้าได้หลังร้านยืนยันการชำระเงินแล้ว", 409);
  const kind: ClaimKind = form.get("kind") === "RETURN" ? "RETURN" : "WARRANTY";
  const w = claimWindows(o);
  const fields: Record<string, string> = {};
  if (kind === "RETURN" && !w.canReturn) fields.kind = `เลยกำหนดคืน/เปลี่ยนสินค้า ${RETURN_DAYS} วันแล้ว — เลือก "เคลมประกัน" แทน`;

  let picked: { id?: unknown; qty?: unknown }[] = [];
  try {
    const raw = JSON.parse(text(form.get("items"), 4000) || "[]");
    if (Array.isArray(raw)) picked = raw.slice(0, 60);
  } catch {}
  const byId = new Map(o.items.map((i) => [i.id, i]));
  const items: ClaimItem[] = [];
  for (const p of picked) {
    const it = byId.get(String(p?.id ?? ""));
    const qty = Math.floor(Number(p?.qty));
    if (!it || items.some((x) => x.itemId === it.id)) continue;
    items.push({ itemId: it.id, productId: it.productId, name: it.nameSnapshot, qty: Math.min(Math.max(1, Number.isFinite(qty) ? qty : 1), it.qty) });
  }
  if (!items.length) fields.items = "กรุณาเลือกสินค้าที่ต้องการเคลมอย่างน้อย 1 รายการ";
  const issue = text(form.get("issue"), 3000);
  if (issue.length < 10) fields.issue = "กรุณาอธิบายอาการ/ปัญหาอย่างน้อย 10 ตัวอักษร";
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > CLAIM_MAX_FILES) fields.files = `แนบรูปได้ไม่เกิน ${CLAIM_MAX_FILES} รูป`;
  if (kind === "RETURN" && !files.length) fields.files = "การคืน/เปลี่ยนสินค้าเสียหายจากขนส่ง ต้องแนบรูปสินค้า/กล่องอย่างน้อย 1 รูป";
  if (Object.keys(fields).length) throw new ClaimError(Object.values(fields)[0], 400, fields);

  const images: string[] = [];
  for (const f of files) images.push(await storePhoto(f));
  const claim = await prisma.$transaction(async (tx) => {
    const claimNo = await nextSeq(tx, "CL");
    return tx.claim.create({
      data: { claimNo, kind, orderId: o.id, name: o.customerName, phone: phoneDigits(o.phone), items, issue, images, inWarranty: kind === "WARRANTY" ? w.inWarranty : w.canReturn },
    });
  });
  return { claim, order: o, windows: w };
}

/** ข้อความแจ้ง LINE ร้าน (ไม่ใส่ที่อยู่) */
export function claimMessage(c: { id: string; claimNo: string; kind: ClaimKind; name: string; phone: string; issue: string; images: string[]; inWarranty: boolean | null; items: unknown }, orderNo: string) {
  const items = parseClaimItems(c.items);
  return [
    c.kind === "RETURN" ? "📦 ขอคืน/เปลี่ยนสินค้าใหม่" : "🛠️ แจ้งเคลมประกันใหม่",
    `${c.claimNo} · คำสั่งซื้อ ${orderNo}`,
    `ลูกค้า: ${c.name} · ${formatPhone(c.phone)}`,
    `สินค้า: ${items.slice(0, 5).map((i) => `${i.name} × ${i.qty}`).join(", ")}`,
    c.kind === "WARRANTY" ? (c.inWarranty ? "✅ อยู่ในประกัน" : "⚠️ หมดประกันแล้ว") : c.inWarranty ? "✅ อยู่ในกำหนด 7 วัน" : "⚠️ เลยกำหนด 7 วัน",
    `อาการ: ${c.issue.length > 160 ? c.issue.slice(0, 159) + "…" : c.issue}`,
    c.images.length ? `รูปแนบ ${c.images.length} รูป` : "",
    "",
    `เปิดดู: ${siteUrl()}/admin/claims/${c.id}`,
  ].filter((l, i, a) => l || a[i - 1] !== "").join("\n");
}

export function parseClaimItems(v: unknown): ClaimItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return { itemId: String(o.itemId ?? ""), productId: typeof o.productId === "string" ? o.productId : null, name: String(o.name ?? "").slice(0, 300), qty: Math.max(1, Math.floor(Number(o.qty)) || 1) };
    })
    .slice(0, 60);
}

/** เรื่องเคลมของคำสั่งซื้อ (แสดงในหน้าติดตาม — สถานะ + ข้อความจากร้าน) */
export async function claimsOfOrder(orderId: string) {
  const rows = await prisma.claim.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
  return rows.map((c) => ({
    claimNo: c.claimNo, kind: c.kind, kindLabel: CLAIM_KIND[c.kind], status: c.status, statusLabel: CLAIM_STATUS[c.status],
    resolution: c.resolution, createdAt: c.createdAt.toISOString(), items: parseClaimItems(c.items).map((i) => `${i.name} × ${i.qty}`),
  }));
}
