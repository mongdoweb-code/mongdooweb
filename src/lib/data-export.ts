// สำรองข้อมูลทั้งร้านเป็น ZIP ของไฟล์ CSV (หนึ่งตาราง = หนึ่งไฟล์) — ใช้กับ /admin/export.zip (เจ้าของร้านเท่านั้น)
// คอลัมน์สร้างจากข้อมูลจริงของแต่ละตาราง จึงไม่ตกหล่นเมื่อเพิ่มฟิลด์ใหม่ภายหลัง
// ไม่รวมข้อมูลลับ: รหัสผ่าน/secret 2 ขั้นของผู้ใช้, session, ตัวจำกัดการล็อกอิน, ผู้รับ LINE
import "server-only";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { createZip, type ZipEntry } from "@/lib/zip";

type Row = Record<string, unknown>;

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v) && v.every((x) => typeof x !== "object")) return v.join(" | ");
  if (typeof v === "object") return JSON.stringify(v);
  return v;
};

function tableCsv(rows: Row[], fallbackHead: string[] = ["id"]) {
  const head = rows.length ? Object.keys(rows[0]) : fallbackHead;
  return toCsv(head, rows.map((r) => head.map((k) => cell(r[k]))));
}

const TABLES: [file: string, label: string, load: () => Promise<Row[]>][] = [
  ["orders.csv", "คำสั่งซื้อหน้าเว็บ", () => prisma.order.findMany({ orderBy: { createdAt: "asc" } })],
  ["order_items.csv", "รายการสินค้าในคำสั่งซื้อ", () => prisma.orderItem.findMany({ orderBy: { orderId: "asc" } })],
  ["payment_slips.csv", "ข้อมูลสลิป (ไม่รวมไฟล์ภาพ)", () => prisma.paymentSlip.findMany({ orderBy: { uploadedAt: "asc" } })],
  ["order_events.csv", "ประวัติคำสั่งซื้อ", () => prisma.orderEvent.findMany({ orderBy: { createdAt: "asc" } })],
  ["customers.csv", "ลูกค้า", () => prisma.customer.findMany({ orderBy: { code: "asc" } })],
  ["sales_documents.csv", "เอกสารขาย (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ)", () => prisma.salesDocument.findMany({ orderBy: { createdAt: "asc" } })],
  ["sales_document_items.csv", "รายการในเอกสารขาย", () => prisma.salesDocumentItem.findMany({ orderBy: [{ documentId: "asc" }, { sortOrder: "asc" }] })],
  ["doc_payments.csv", "การรับชำระของใบแจ้งหนี้", () => prisma.docPayment.findMany({ orderBy: { paidAt: "asc" } })],
  ["doc_events.csv", "ประวัติเอกสารขาย", () => prisma.salesDocumentEvent.findMany({ orderBy: { createdAt: "asc" } })],
  ["doc_sequences.csv", "ตัวนับเลขที่เอกสาร", () => prisma.docSequence.findMany()],
  ["products.csv", "สินค้า", () => prisma.product.findMany({ orderBy: { sku: "asc" } })],
  ["stock_movements.csv", "ความเคลื่อนไหวสต็อก", () => prisma.stockMovement.findMany()],
  ["categories.csv", "หมวดหมู่", () => prisma.category.findMany({ orderBy: { sortOrder: "asc" } })],
  ["inquiries.csv", "คำขอจากลูกค้า", () => prisma.inquiry.findMany({ orderBy: { createdAt: "asc" } })],
  ["hero_slides.csv", "สไลด์หน้าแรก", () => prisma.heroSlide.findMany({ orderBy: { sortOrder: "asc" } })],
  ["pages.csv", "หน้าเนื้อหา", () => prisma.page.findMany({ orderBy: { slug: "asc" } })],
  ["shop_settings.csv", "ตั้งค่าร้าน", () => prisma.shopSetting.findMany()],
  ["admin_users.csv", "ผู้ใช้หลังบ้าน (ไม่รวมรหัสผ่าน)", () =>
    prisma.admin.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, username: true, displayName: true, role: true, isActive: true, totpEnabled: true, mustChangePassword: true, lastLoginAt: true, createdAt: true } })],
  ["admin_log.csv", "บันทึกการใช้งาน", () => prisma.adminLog.findMany({ orderBy: { createdAt: "asc" } })],
];

export async function buildDataExport(by: string) {
  const now = new Date();
  const entries: ZipEntry[] = [];
  const counts: string[] = [];
  for (const [file, label, load] of TABLES) {
    const rows = await load();
    entries.push({ name: file, data: tableCsv(rows), date: now });
    counts.push(`${file.padEnd(28)} ${String(rows.length).padStart(7)} แถว  — ${label}`);
  }
  const readme = [
    "สำรองข้อมูลร้านมองดูเว็บ",
    `สร้างเมื่อ ${now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} โดย ${by}`,
    "",
    "- ไฟล์ CSV เข้ารหัส UTF-8 (มี BOM) เปิดด้วย Excel / Google Sheets ได้ทันที",
    "- จำนวนเงินทุกคอลัมน์ที่ลงท้ายด้วย Satang เป็น \"สตางค์\" (หาร 100 = บาท)",
    "- จำนวนสินค้าที่ลงท้ายด้วย Milli เป็นหน่วย 1/1000 (หาร 1000 = จำนวนจริง)",
    "- เวลาเป็นมาตรฐาน UTC (ISO 8601) — เวลาไทย = UTC + 7 ชั่วโมง",
    "- ไม่รวมไฟล์ภาพ (สลิป รูปสินค้า) และข้อมูลลับ (รหัสผ่าน, รหัสยืนยัน 2 ขั้น, session)",
    "- เก็บไฟล์นี้ในที่ปลอดภัย เพราะมีข้อมูลส่วนบุคคลของลูกค้า (PDPA)",
    "",
    ...counts,
    "",
  ].join("\r\n");
  entries.unshift({ name: "README.txt", data: "﻿" + readme, date: now });
  return { zip: createZip(entries), files: entries.length, summary: counts.length };
}
