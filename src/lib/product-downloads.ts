// ไฟล์ดาวน์โหลดของสินค้า (U11/A8): สเปกชีต/คู่มือ PDF — เก็บผ่าน storage driver ที่ prefix "downloads/"
// Product.downloads = [{ key, name, sizeBytes }] · หน้าร้านดาวน์โหลดที่ /download/<slug>/<ชื่อไฟล์ใน key>
import "server-only";
import { randomBytes } from "node:crypto";
import { storage } from "@/lib/storage";

export type DownloadFile = { key: string; name: string; sizeBytes: number };

export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_DOWNLOADS = 10;
const KEY_RE = /^downloads\/\d{4}\/\d{2}\/[a-z0-9]{10,40}\.pdf$/;

export class DownloadError extends Error {}

/** อ่าน Product.downloads — ตัดรายการที่ผิดรูป */
export function parseDownloads(v: unknown): DownloadFile[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is DownloadFile => !!x && typeof x === "object" && typeof (x as DownloadFile).key === "string" && KEY_RE.test((x as DownloadFile).key))
    .map((x) => ({ key: x.key, name: cleanName(String(x.name ?? "")) || "เอกสาร", sizeBytes: Math.max(0, Math.floor(Number(x.sizeBytes) || 0)) }))
    .slice(0, MAX_DOWNLOADS);
}

/** ชื่อไฟล์ที่แสดง/ตั้งตอนดาวน์โหลด: ตัดอักขระควบคุมและ / \ " ออก ไม่เกิน 120 ตัว (ไม่รวม .pdf) */
export function cleanName(name: string) {
  return name
    .normalize("NFC")
    .replace(/\.pdf$/i, "")
    .replace(/[\u0000-\u001f\u007f/\\"<>:*?|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** ส่วนท้ายของ key (ใช้ใน URL ดาวน์โหลด) */
export const fileId = (key: string) => key.split("/").pop()!.replace(/\.pdf$/, "");
export const downloadHref = (slug: string, key: string) => `/download/${encodeURIComponent(slug)}/${fileId(key)}`;

/** ตรวจว่าเป็น PDF จริงจากไบต์แรก (%PDF-) ไม่เชื่อนามสกุล/ชนิดที่เบราว์เซอร์ส่งมา */
export function isPdf(buf: Buffer) {
  return buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** ตรวจ + เก็บไฟล์ PDF คืนรายการใหม่ (ยังไม่บันทึกลงฐานข้อมูล) */
export async function savePdf(buf: Buffer, name: string): Promise<DownloadFile> {
  if (buf.length === 0) throw new DownloadError("ไฟล์ว่าง");
  if (buf.length > PDF_MAX_BYTES) throw new DownloadError("ไฟล์ใหญ่เกิน 20 MB");
  if (!isPdf(buf)) throw new DownloadError("รองรับเฉพาะไฟล์ PDF");
  const now = new Date();
  const key = `downloads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now().toString(36)}${randomBytes(8).toString("hex")}.pdf`;
  await storage().put(key, buf);
  return { key, name: cleanName(name) || "เอกสาร", sizeBytes: buf.length };
}

export async function deletePdf(key: string) {
  if (KEY_RE.test(key)) await storage().delete(key);
}

/** ขนาดไฟล์อ่านง่าย เช่น "1.2 MB" */
export function fileSize(n: number) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Content-Disposition ที่รองรับชื่อภาษาไทย (RFC 6266/5987) */
export function contentDisposition(name: string, inline = false) {
  const full = `${cleanName(name) || "document"}.pdf`;
  const ascii = full.replace(/[^\x20-\x7e]/g, "_").replace(/_+/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`;
}
