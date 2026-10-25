// ส่วนที่ใช้ร่วมกันของการบันทึกบทความ/ผลงาน (ฝั่ง server)
import "server-only";
import { MediaError, saveImage, type MediaPrefix } from "@/lib/media";
import { prisma } from "@/lib/prisma";

/** n = เลขรอบการบันทึก (ใช้ remount ช่องไฟล์/เนื้อหาหลังบันทึกสำเร็จ) · body = เนื้อหาที่บันทึกจริง (มีบรรทัดรูปที่ต่อท้ายให้) */
export type ContentFormState = { error?: string; fields?: string[]; ok?: string; id?: string; n?: number; body?: string };

export const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").normalize("NFC").trim().slice(0, max);
export const longText = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").normalize("NFC").replace(/\r\n?/g, "\n").trim().slice(0, max);

/** "SKU1, SKU2\nSKU3" → id สินค้าตามลำดับ · คืน SKU ที่ไม่พบด้วย */
export async function productIdsFromSkus(raw: string) {
  const skus = [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 24);
  if (!skus.length) return { ids: [] as string[], missing: [] as string[] };
  const rows = await prisma.product.findMany({ where: { sku: { in: skus, mode: "insensitive" } }, select: { id: true, sku: true } });
  const ids: string[] = [];
  const missing: string[] = [];
  for (const s of skus) {
    const p = rows.find((r) => r.sku.toLowerCase() === s.toLowerCase());
    if (p) ids.push(p.id);
    else missing.push(s);
  }
  return { ids, missing };
}

export async function skusOf(ids: string[]) {
  if (!ids.length) return "";
  const rows = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true } });
  return ids.map((id) => rows.find((r) => r.id === id)?.sku).filter(Boolean).join(", ");
}

/** อัปโหลดรูปหลายไฟล์ (ตรวจไบต์จริง + ย่อ WebP) — ผิดพลาดคืนข้อความ */
export async function uploadImages(f: FormData, field: string, prefix: MediaPrefix, max: number) {
  const keys: string[] = [];
  for (const file of f.getAll(field).slice(0, max)) {
    if (!(file instanceof File) || file.size === 0) continue;
    try {
      keys.push(await saveImage(Buffer.from(await file.arrayBuffer()), prefix));
    } catch (e) {
      return { keys, error: e instanceof MediaError ? `${file.name}: ${e.message}` : `อัปโหลด ${file.name} ไม่สำเร็จ` };
    }
  }
  return { keys, error: null };
}

/** "2026-10-22T09:00" (เวลาไทย จาก input datetime-local) → Date */
export function bkkDateTime(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** Date → ค่าสำหรับ input datetime-local (เวลาไทย) */
export const toBkkInput = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 16) : "");
