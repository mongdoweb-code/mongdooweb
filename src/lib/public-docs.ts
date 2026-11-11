// ลิงก์เอกสารฝั่งลูกค้า: /track/receipt/:id?t=<publicToken>
// - publicToken = สุ่ม 32 ไบต์ (base64url 43 ตัว) สร้างเมื่อจำเป็นครั้งแรก (lazy) จากหน้าติดตามคำสั่งซื้อที่ยืนยันเบอร์โทรแล้ว
// - ไม่มีโทเคน/โทเคนไม่ตรง/ยังเป็นฉบับร่าง = 404 (ไม่บอกว่าเอกสารมีอยู่จริง)
// หลังบ้าน (ล็อต 4) จะสร้างลิงก์ให้ลูกค้าได้ด้วย publicReceiptUrl(await ensurePublicToken(id), id)
import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { DOC_INCLUDE } from "@/lib/docs";
import QRCode from "qrcode";
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

// ---------- รอบ 3: ลิงก์ลับใบเสนอราคา (ยืนยันออนไลน์ U25) และใบแจ้งหนี้ (ชำระออนไลน์ U26) ----------

/** คืนโทเคนของเอกสารที่ออกแล้ว (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ) สร้างใหม่ถ้ายังไม่มี — null = ฉบับร่าง/ไม่พบ */
export async function ensureDocToken(docId: string): Promise<string | null> {
  const d = await prisma.salesDocument.findUnique({ where: { id: docId }, select: { status: true, publicToken: true } });
  if (!d || d.status === "DRAFT") return null;
  if (d.publicToken) return d.publicToken;
  await prisma.salesDocument.updateMany({ where: { id: docId, publicToken: null }, data: { publicToken: randomBytes(32).toString("base64url") } });
  return (await prisma.salesDocument.findUnique({ where: { id: docId }, select: { publicToken: true } }))?.publicToken ?? null;
}

/** /track/doc/:id?t= — ใบเสนอราคา/ใบแจ้งหนี้ · ใบเสร็จใช้ /track/receipt */
export const publicDocUrl = (d: { id: string; type: string }, token: string) =>
  d.type === "RECEIPT" ? publicReceiptUrl(d.id, token) : `/track/doc/${encodeURIComponent(d.id)}?t=${encodeURIComponent(token)}`;

/** ใบเสนอราคา/ใบแจ้งหนี้สำหรับลูกค้า (รวมสลิปที่ลูกค้าแนบ) — null ถ้าโทเคนไม่ถูกต้อง */
export async function getPublicDoc(id: string, token: string | undefined) {
  if (!token || !TOKEN_RE.test(token) || id.length > 40) return null;
  const d = await prisma.salesDocument.findUnique({
    where: { id },
    include: {
      ...DOC_INCLUDE,
      slips: { orderBy: { createdAt: "desc" }, select: { id: true, amountSatang: true, transferredAt: true, status: true, rejectReason: true, createdAt: true } },
    },
  });
  if (!d || (d.type !== "QUOTATION" && d.type !== "INVOICE") || d.status === "DRAFT" || !d.publicToken) return null;
  const a = Buffer.from(d.publicToken), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return d;
}

/** QR + ลิงก์ลับสำหรับพิมพ์บนใบเสนอราคา/ใบแจ้งหนี้ที่ออกแล้ว (ลูกค้าสแกนเพื่อดู/ยืนยัน/แนบสลิป) — สร้างโทเคนถ้ายังไม่มี
 *  null = ปิดในตั้งค่า / ฉบับร่าง / ยกเลิก / ชนิดเอกสารอื่น */
export async function onlineQrFor(d: { id: string; type: string; status: string }, enabled: boolean): Promise<{ qr: string; url: string } | null> {
  if (!enabled || (d.type !== "QUOTATION" && d.type !== "INVOICE") || d.status === "DRAFT" || d.status === "VOID") return null;
  const token = await ensureDocToken(d.id);
  if (!token) return null;
  const url = `${(process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${publicDocUrl(d, token)}`;
  return { url, qr: await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 280 }) };
}

/** บอตพรีวิวลิงก์ (LINE / Facebook / Messenger / Slack …) — ไม่นับเป็นลูกค้าเปิดดู */
const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|facebot|line\/|linespider|whatsapp|telegram|slack|discord|skype|embedly|vkshare|pinterest|google-?inspectiontool|headless/i;

/** บันทึกว่าลูกค้าเปิดลิงก์ (ใบเสนอราคา/ใบแจ้งหนี้) — ไม่นับบอตและแอดมินที่ล็อกอินอยู่
 *  นับครั้งละไม่ถี่กว่า 60 วินาที (กดรีเฟรช/หน้า render ซ้ำในคำขอเดียวไม่นับซ้ำ) — เงื่อนไขอยู่ใน UPDATE เดียว กันสองคำขอพร้อมกัน
 *  ประวัติ VIEWED: ครั้งแรก และเมื่อห่างครั้งก่อน ≥ 6 ชม. */
export async function recordDocView(d: { id: string; type: string; status: string; lastViewedAt: Date | null }, ua: string, isAdmin: boolean) {
  if (isAdmin || !ua || BOT_UA.test(ua) || d.status === "VOID") return;
  const now = new Date();
  const r = await prisma.salesDocument.updateMany({
    where: { id: d.id, OR: [{ lastViewedAt: null }, { lastViewedAt: { lt: new Date(now.getTime() - 60e3) } }] },
    data: { viewCount: { increment: 1 }, lastViewedAt: now },
  });
  if (!r.count) return;
  const first = !d.lastViewedAt;
  if (first) await prisma.salesDocument.updateMany({ where: { id: d.id, firstViewedAt: null }, data: { firstViewedAt: now } });
  if (first || now.getTime() - d.lastViewedAt!.getTime() >= 6 * 3600e3) {
    await prisma.salesDocumentEvent.create({ data: { documentId: d.id, type: "VIEWED", note: first ? "ลูกค้าเปิดดูครั้งแรก" : "ลูกค้าเปิดดูอีกครั้ง" } });
  }
}
