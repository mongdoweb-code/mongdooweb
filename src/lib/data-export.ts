// สำรองข้อมูลทั้งร้านเป็น ZIP ของไฟล์ CSV (หนึ่งตาราง = หนึ่งไฟล์) — ใช้กับ /admin/export.zip (เจ้าของร้านเท่านั้น)
// - รายชื่อตารางอ่านจากฐานข้อมูลจริง (ชุดเดียวกับระบบสำรองข้อมูลอัตโนมัติ src/lib/backup.ts) → ตารางใหม่ที่เพิ่มภายหลังอยู่ในไฟล์เอง
// - คอลัมน์สร้างจากข้อมูลจริงของแต่ละตาราง จึงไม่ตกหล่นเมื่อเพิ่มฟิลด์ใหม่ภายหลัง
// ไม่รวมข้อมูลลับ: รหัสผ่าน (hash)/secret 2 ขั้น/รหัสสำรองของผู้ใช้, token ลิงก์ลูกค้า, session, ตัวจำกัดการล็อกอิน, ผู้รับ LINE
import "server-only";
import { tableRows, tables } from "@/lib/backup";
import { toCsv } from "@/lib/csv";
import { csvName, stripSecrets } from "@/lib/export-rules";
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

/** ตารางที่ไม่ส่งออก (ข้อมูลชั่วคราว/ข้อมูลยืนยันตัวตน) — นอกเหนือจากที่ backup.ts ข้ามอยู่แล้ว */
export const EXPORT_SKIP_TABLES = new Set(["AdminSession", "LoginThrottle", "LineRecipient"]);
const LABEL: Record<string, string> = {
  Order: "คำสั่งซื้อหน้าเว็บ", OrderItem: "รายการสินค้าในคำสั่งซื้อ", PaymentSlip: "ข้อมูลสลิป (ไม่รวมไฟล์ภาพ)", OrderEvent: "ประวัติคำสั่งซื้อ",
  Customer: "ลูกค้า", SalesDocument: "เอกสารขาย (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ)", SalesDocumentItem: "รายการในเอกสารขาย", DocPayment: "การรับชำระของใบแจ้งหนี้",
  SalesDocumentEvent: "ประวัติเอกสารขาย", DocSequence: "ตัวนับเลขที่เอกสาร", DocSlip: "สลิปของใบแจ้งหนี้ (ไม่รวมไฟล์ภาพ)", Product: "สินค้า",
  StockMovement: "ความเคลื่อนไหวสต็อก", Category: "หมวดหมู่", Inquiry: "คำขอจากลูกค้า", HeroSlide: "สไลด์หน้าแรก", Page: "หน้าเนื้อหา",
  ShopSetting: "ตั้งค่าร้าน", Admin: "ผู้ใช้หลังบ้าน (ไม่รวมรหัสผ่าน/2 ขั้น)", AdminLog: "บันทึกการใช้งาน", AdminTask: "งานที่ต้องทำ",
  InternalNote: "โน้ตภายใน", BackupRun: "ประวัติสำรองข้อมูล", Claim: "เคลม/คืนสินค้า", Review: "รีวิวสินค้า", StockAlert: "แจ้งเมื่อมีของ",
  Coupon: "คูปอง", CouponRedemption: "การใช้คูปอง", DataRequest: "คำขอข้อมูลส่วนบุคคล (PDPA)", EmailLog: "ประวัติอีเมลถึงลูกค้า",
  PurchaseOrder: "ใบสั่งซื้อ (ต้นทุน)", PurchaseOrderItem: "รายการในใบสั่งซื้อ", Project: "ผลงานติดตั้ง", Post: "บทความ",
  Redirect: "Redirect", NotFoundLog: "ลิงก์เสีย (404)", SearchLog: "คำค้นหา", SearchSynonym: "คำพ้องค้นหา", SpecAttribute: "สเปกสินค้า",
  VariantGroup: "กลุ่มตัวเลือกสินค้า", ContentVersion: "เวอร์ชันเนื้อหา (ย้อนกลับ)", Sequence: "ตัวนับเลขที่",
};

export async function buildDataExport(by: string) {
  const now = new Date();
  const entries: ZipEntry[] = [];
  const counts: string[] = [];
  for (const t of (await tables()).filter((t) => !EXPORT_SKIP_TABLES.has(t))) {
    const rows = stripSecrets(await tableRows(t));
    const file = csvName(t);
    entries.push({ name: file, data: tableCsv(rows), date: now });
    counts.push(`${file.padEnd(28)} ${String(rows.length).padStart(7)} แถว  — ${LABEL[t] ?? t}`);
  }
  const readme = [
    "สำรองข้อมูลร้านมองดูเว็บ",
    `สร้างเมื่อ ${now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} โดย ${by}`,
    "",
    "- ไฟล์ CSV เข้ารหัส UTF-8 (มี BOM) เปิดด้วย Excel / Google Sheets ได้ทันที",
    "- จำนวนเงินทุกคอลัมน์ที่ลงท้ายด้วย Satang เป็น \"สตางค์\" (หาร 100 = บาท)",
    "- จำนวนสินค้าที่ลงท้ายด้วย Milli เป็นหน่วย 1/1000 (หาร 1000 = จำนวนจริง)",
    "- เวลาเป็นมาตรฐาน UTC (ISO 8601) — เวลาไทย = UTC + 7 ชั่วโมง",
    "- ไม่รวมไฟล์ภาพ (สลิป รูปสินค้า) และข้อมูลลับ (รหัสผ่าน, รหัสยืนยัน 2 ขั้น, token ลิงก์ลูกค้า, session)",
    "- เก็บไฟล์นี้ในที่ปลอดภัย เพราะมีข้อมูลส่วนบุคคลของลูกค้า (PDPA)",
    "",
    ...counts,
    "",
  ].join("\r\n");
  entries.unshift({ name: "README.txt", data: "﻿" + readme, date: now });
  return { zip: createZip(entries), files: entries.length, summary: counts.length };
}
