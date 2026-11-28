// สร้างรูปใส่ลายน้ำ (sharp): วางลายน้ำตามตำแหน่ง/ขนาด/ความทึบ หรือเรียงซ้ำทั้งภาพ → WebP → เก็บที่ wm/<ver>/<key> ใช้ซ้ำ
import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import { storage } from "@/lib/storage";
import { wmVariant, wmVersion, type Watermark } from "@/lib/watermark";

export async function renderWatermarked(key: string, w: Watermark): Promise<Buffer | null> {
  const cacheKey = `wm/${wmVersion(w)}/${key}`;
  const cached = await storage().get(cacheKey).catch(() => null);
  if (cached) return cached;
  // รูปย่อ (-sm / -wNNN): ย่อจากรูปเต็มก่อนแล้วจึงใส่ลายน้ำ (ขนาด/ระยะเป็น % จึงตรงกับรูปเต็ม)
  const v = wmVariant(key);
  const [orig, mark] = await Promise.all([storage().get(v ? v.src : key).catch(() => null), storage().get(w.key).catch(() => null)]);
  if (!orig) return null;
  const base = v ? await sharp(orig).rotate().resize({ width: v.width, withoutEnlargement: true }).toBuffer() : orig;
  if (!mark) return base;
  const img = sharp(base).rotate();
  const meta = await img.metadata();
  const W = meta.width ?? 1200, H = meta.height ?? 900;
  const mw = Math.max(16, Math.round((W * w.size) / 100));
  // ลายน้ำ: ย่อตามสัดส่วน + ลดความทึบ (คูณช่อง alpha ด้วยค่าความทึบ)
  let wm = await sharp(mark).resize({ width: mw, withoutEnlargement: false }).ensureAlpha()
    .composite([{ input: Buffer.from([255, 255, 255, Math.round((255 * w.opacity) / 100)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
    .png().toBuffer();
  const wmMeta = await sharp(wm).metadata();
  const mh = wmMeta.height ?? mw;
  let layer: OverlayOptions;
  if (w.pos === "tile") {
    // เรียงซ้ำ: เว้นช่องรอบลายน้ำ 60% ของขนาดตัวเอง
    const padX = Math.round(mw * 0.6), padY = Math.round(mh * 0.9);
    wm = await sharp(wm).extend({ top: padY >> 1, bottom: padY - (padY >> 1), left: padX >> 1, right: padX - (padX >> 1), background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    layer = { input: wm, tile: true, top: 0, left: 0 };
  } else {
    const m = Math.round((W * w.margin) / 100);
    const left = w.pos[1] === "l" ? m : w.pos[1] === "r" ? W - mw - m : Math.round((W - mw) / 2);
    const top = w.pos[0] === "t" ? m : w.pos[0] === "b" ? H - mh - m : Math.round((H - mh) / 2);
    layer = { input: wm, left: Math.max(0, Math.min(W - mw, left)), top: Math.max(0, Math.min(H - mh, top)) };
  }
  const out = await img.composite([layer]).webp({ quality: 84 }).toBuffer();
  await storage().put(cacheKey, out).catch(() => {});
  return out;
}
