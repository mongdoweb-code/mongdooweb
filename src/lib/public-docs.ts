// ลิงก์เอกสารฝั่งลูกค้า: /track/receipt/:id?t=<publicToken>
// - publicToken = สุ่ม 32 ไบต์ (base64url 43 ตัว) สร้างเมื่อจำเป็นครั้งแรก (lazy) จากหน้าติดตามคำสั่งซื้อที่ยืนยันเบอร์โทรแล้ว
// - ไม่มีโทเคน/โทเคนไม่ตรง/ยังเป็นฉบับร่าง = 404 (ไม่บอกว่าเอกสารมีอยู่จริง)
// หลังบ้าน (ล็อต 4) จะสร้างลิงก์ให้ลูกค้าได้ด้วย publicReceiptUrl(await ensurePublicToken(id), id)
import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { DOC_INCLUDE } from "@/lib/docs";
import { prisma } from "@/lib/prisma";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** คืนโทเคนของใบเสร็จ (สร้างใหม่ถ้ายังไม่มี) — null เมื่อไม่ใช่ใบเสร็จที่ออกแล้ว */
export async function ensurePublicToken(docId: string): Promise<string | null> {
  const d = await prisma.salesDocument.findUnique({ where: { id: docId }, select: { type: true, status: true, publicToken: true } });
  if (!d || d.type !== "RECEIPT" || d.status === "DRAFT") return null;
  if (d.publicToken) return d.publicToken;
  const token = randomBytes(32).toString("base64url");
  // updateMany + เงื่อนไข publicToken = null กันสองคำขอพร้อมกันเขียนทับกัน
  await prisma.salesDocument.updateMany({ where: { id: docId, publicToken: null }, data: { publicToken: token } });
  const after = await prisma.salesDocument.findUnique({ where: { id: docId }, select: { publicToken: true } });
  return after?.publicToken ?? null;
}

export const publicReceiptUrl = (docId: string, token: string) => `/track/receipt/${encodeURIComponent(docId)}?t=${encodeURIComponent(token)}`;

/** ใบเสร็จที่ออกแล้ว (ไม่รวมฉบับร่าง/ยกเลิก) ของคำสั่งซื้อ พร้อมลิงก์ลับ */
export async function orderReceiptLinks(orderId: string) {
  const docs = await prisma.salesDocument.findMany({
    where: { orderId, type: "RECEIPT", status: { notIn: ["DRAFT", "VOID"] }, docNo: { not: null } },
    orderBy: { issueDate: "asc" },
    select: { id: true, docNo: true, issueDate: true, grandSatang: true },
  });
  const out: { id: string; docNo: string; issueDate: string | null; grandSatang: number; url: string }[] = [];
  for (const d of docs) {
    const t = await ensurePublicToken(d.id);
    if (t) out.push({ id: d.id, docNo: d.docNo!, issueDate: d.issueDate?.toISOString() ?? null, grandSatang: d.grandSatang, url: publicReceiptUrl(d.id, t) });
  }
  return out;
}

/** ใบเสร็จสำหรับลูกค้า — null ถ้าโทเคนไม่ถูกต้อง */
export async function getPublicReceipt(id: string, token: string | undefined) {
  if (!token || !TOKEN_RE.test(token) || id.length > 40) return null;
  const d = await prisma.salesDocument.findUnique({ where: { id }, include: DOC_INCLUDE });
  if (!d || d.type !== "RECEIPT" || d.status === "DRAFT" || !d.publicToken) return null;
  const a = Buffer.from(d.publicToken), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return d;
}
