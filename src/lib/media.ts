// รูปภาพของร้าน (สินค้า สไลด์ โลโก้) — ย่อเป็น WebP 2 ขนาดก่อนเก็บผ่าน storage driver
// ขนาดเต็ม: กว้าง/สูงไม่เกิน 1600px · ย่อ (-sm): 480px สำหรับการ์ดสินค้า/ตะกร้า
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { sniffImage, storage } from "@/lib/storage";

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_PREFIXES = ["products", "slides", "logo", "categories", "reviews", "projects", "posts", "trust"] as const;
export type MediaPrefix = (typeof MEDIA_PREFIXES)[number];

export class MediaError extends Error {}

/** ตรวจ + ย่อ + เก็บรูป คืน storage key ของรูปขนาดเต็ม */
export async function saveImage(buf: Buffer, prefix: MediaPrefix, opts: { full?: number; thumb?: number } = {}) {
  if (buf.length > IMAGE_MAX_BYTES) throw new MediaError("ไฟล์รูปใหญ่เกิน 10 MB");
  const isGif = buf.subarray(0, 4).toString("ascii") === "GIF8";
  if (!sniffImage(buf) && !isGif) throw new MediaError("รองรับเฉพาะไฟล์ภาพ JPG, PNG, WEBP หรือ GIF");
  const id = `${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
  const now = new Date();
  const base = `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}`;
  const pipe = () => sharp(buf, { animated: false, failOn: "error" }).rotate();
  let full: Buffer, small: Buffer;
  try {
    full = await pipe().resize({ width: opts.full ?? 1600, height: opts.full ?? 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    small = await pipe().resize({ width: opts.thumb ?? 480, height: opts.thumb ?? 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  } catch {
    throw new MediaError("อ่านไฟล์รูปไม่ได้ (ไฟล์อาจเสีย)");
  }
  await storage().put(`${base}.webp`, full);
  await storage().put(`${base}-sm.webp`, small);
  return `${base}.webp`;
}

/** URL สาธารณะของรูป: key ที่อัปโหลด → /media/..., URL https ภายนอกใช้ตามเดิม */
export function mediaUrl(keyOrUrl: string | null | undefined, size: "full" | "sm" = "full") {
  if (!keyOrUrl) return null;
  if (/^https:\/\//i.test(keyOrUrl)) return keyOrUrl;
  const key = size === "sm" ? keyOrUrl.replace(/\.webp$/, "-sm.webp") : keyOrUrl;
  return `/media/${key}`;
}
