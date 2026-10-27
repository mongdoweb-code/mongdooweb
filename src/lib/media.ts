// รูปภาพของร้าน (สินค้า สไลด์ โลโก้ บทความ ผลงาน) — ย่อเป็น WebP ก่อนเก็บผ่าน storage driver
// ไฟล์ต่อรูป: <base>.webp (เต็ม ≤1600px) · <base>-sm.webp (480px — การ์ด/ตะกร้า เดิม)
// รอบ 3 (U14/A15): รูปย่อตามความกว้าง <base>-w320/-w640/-w960/-w1280 ทั้ง .webp และ .avif (ถ้า sharp รองรับ AVIF)
//   - สร้างตอนอัปโหลด และสร้างย้อนหลังได้ที่ หลังบ้าน › ตรวจรูปภาพ ("สร้างรูปย่อใหม่")
//   - ถ้ายังไม่มี /media/<key> สร้างให้เองตอนเรียกครั้งแรก (generateVariant) แล้วเก็บไว้ใช้ต่อ
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { IMG_WIDTHS } from "@/lib/img-srcset";
import { sniffImage, storage } from "@/lib/storage";

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_PREFIXES = ["products", "slides", "logo", "categories", "reviews", "projects", "posts", "trust"] as const;
export type MediaPrefix = (typeof MEDIA_PREFIXES)[number];
export type VariantFormat = "webp" | "avif";

export class MediaError extends Error {}

/** sharp ในเครื่องนี้เข้ารหัส AVIF ได้ไหม (prebuilt ของ sharp มี libheif + aom — ถ้าไม่มีจะใช้ WebP อย่างเดียว) */
export const AVIF_SUPPORTED = (() => {
  try {
    return !!sharp.format.heif?.output?.buffer && "aom" in (sharp.versions as Record<string, string>);
  } catch {
    return false;
  }
})();

const QUALITY = { webp: 78, avif: 50 } as const;

/** <base>.webp → <base>-w640.webp / .avif */
export const variantKey = (key: string, w: number, fmt: VariantFormat = "webp") => key.replace(/\.webp$/, `-w${w}.${fmt}`);
/** แยก key ของรูปย่อ: products/x-w640.avif → { base: "products/x.webp", w: 640, fmt: "avif" } */
export function parseVariant(key: string): { base: string; w: number; fmt: VariantFormat } | null {
  const m = /^(.+)-w(\d+)\.(webp|avif)$/.exec(key);
  if (!m || !(IMG_WIDTHS as readonly number[]).includes(Number(m[2]))) return null;
  return { base: `${m[1]}.webp`, w: Number(m[2]), fmt: m[3] as VariantFormat };
}

async function encode(src: Buffer, w: number, fmt: VariantFormat) {
  const p = sharp(src, { failOn: "error" }).resize({ width: w, height: w, fit: "inside", withoutEnlargement: true });
  return fmt === "avif" ? p.avif({ quality: QUALITY.avif, effort: 2 }).toBuffer() : p.webp({ quality: QUALITY.webp }).toBuffer();
}

/** เขียนไฟล์ (แทนที่ของเดิม — local driver ไม่เขียนทับ จึงลบก่อน) */
async function putReplace(key: string, data: Buffer) {
  try {
    await storage().put(key, data);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    await storage().delete(key);
    await storage().put(key, data);
  }
}

/** สร้างรูปย่อทุกขนาดจากรูปเต็ม (ข้ามที่มีอยู่แล้ว เว้นแต่ force) — คืนจำนวนไฟล์ที่สร้าง */
export async function generateVariants(key: string, opts: { force?: boolean; src?: Buffer } = {}) {
  const src = opts.src ?? (await storage().get(key));
  if (!src) throw new MediaError("ไม่พบไฟล์รูป");
  let n = 0;
  for (const w of IMG_WIDTHS)
    for (const fmt of AVIF_SUPPORTED ? (["webp", "avif"] as const) : (["webp"] as const)) {
      const k = variantKey(key, w, fmt);
      if (!opts.force && (await storage().get(k))) continue;
      await putReplace(k, await encode(src, w, fmt));
      n++;
    }
  return n;
}

// สร้างรูปย่อตามคำขอ (หน้า /media) — จำกัดทำพร้อมกัน 2 งาน และรวมคำขอซ้ำของ key เดียวกัน
const inflight = new Map<string, Promise<Buffer | null>>();
let running = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>) {
  if (running >= 2) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

/** คืนรูปย่อ (สร้างและเก็บถ้ายังไม่มี) — null = ไม่มีรูปต้นฉบับ */
export function generateVariant(key: string): Promise<Buffer | null> {
  const v = parseVariant(key);
  if (!v || (v.fmt === "avif" && !AVIF_SUPPORTED)) return Promise.resolve(null);
  const hit = inflight.get(key);
  if (hit) return hit;
  const job = slot(async () => {
    const src = await storage().get(v.base);
    if (!src) return null;
    const out = await encode(src, v.w, v.fmt);
    await putReplace(key, out).catch(() => {});
    return out;
  }).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** ตรวจ + ย่อ + เก็บรูป คืน storage key ของรูปขนาดเต็ม (สร้างรูปย่อทุกขนาดด้วย) */
export async function saveImage(buf: Buffer, prefix: MediaPrefix, opts: { full?: number; thumb?: number; variants?: boolean } = {}) {
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
  // รูปย่อหลายขนาด (โลโก้ไม่ต้อง) — สร้างไม่สำเร็จไม่ทำให้อัปโหลดล้ม เพราะ /media สร้างให้ภายหลังได้
  if (opts.variants ?? prefix !== "logo") await generateVariants(`${base}.webp`, { src: full }).catch(() => 0);
  return `${base}.webp`;
}

/** URL สาธารณะของรูป: key ที่อัปโหลด → /media/..., URL https ภายนอกใช้ตามเดิม */
export function mediaUrl(keyOrUrl: string | null | undefined, size: "full" | "sm" = "full") {
  if (!keyOrUrl) return null;
  if (/^https:\/\//i.test(keyOrUrl)) return keyOrUrl;
  const key = size === "sm" ? keyOrUrl.replace(/\.webp$/, "-sm.webp") : keyOrUrl;
  return `/media/${key}`;
}
