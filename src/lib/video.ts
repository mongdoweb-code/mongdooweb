// วิดีโอสินค้า: ตรวจไฟล์ MP4 จากไบต์จริง (ไม่เชื่อนามสกุล) + อ่านความยาวจาก box "mvhd" — ไม่ต้องใช้ ffmpeg บนเซิร์ฟเวอร์
// ไม่แปลงไฟล์ (เก็บตามที่อัปโหลด) จึงรับเฉพาะ MP4 ที่เบราว์เซอร์เล่นได้ (H.264/AAC จากมือถือ/กล้องทั่วไป)
import { randomBytes } from "node:crypto";
import { storage } from "@/lib/storage";

export const VIDEO_MAX_BYTES = 30 * 1024 * 1024;
export const VIDEO_MIN_SECONDS = 10;
export const VIDEO_MAX_SECONDS = 60;
export class VideoError extends Error {}

/** box ระดับบนสุด/ย่อยของ MP4: [ชนิด, ตำแหน่งเริ่มเนื้อหา, ตำแหน่งจบ] */
function* boxes(buf: Buffer, start: number, end: number): Generator<[string, number, number]> {
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    let head = 8;
    if (size === 1) {
      if (p + 16 > end) return;
      const big = buf.readBigUInt64BE(p + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) return;
      size = Number(big);
      head = 16;
    } else if (size === 0) size = end - p; // ถึงท้ายไฟล์
    if (size < head || p + size > end) return;
    yield [type, p + head, p + size];
    p += size;
  }
}

/** ไฟล์เป็น MP4/MOV (มี "ftyp") ไหม — แบรนด์ที่รับ: isom, mp41/42, avc1, iso2–6, M4V, qt (iPhone .mov ที่ตั้งชื่อ .mp4) */
export function isMp4(buf: Buffer) {
  return buf.length > 12 && buf.toString("latin1", 4, 8) === "ftyp";
}

/** ความยาว (วินาที) จาก moov → mvhd · อ่านไม่ได้ = null */
export function mp4Duration(buf: Buffer): number | null {
  for (const [t, s, e] of boxes(buf, 0, buf.length)) {
    if (t !== "moov") continue;
    for (const [t2, s2] of boxes(buf, s, e)) {
      if (t2 !== "mvhd") continue;
      const version = buf.readUInt8(s2);
      if (version === 1) {
        const scale = buf.readUInt32BE(s2 + 20);
        const dur = Number(buf.readBigUInt64BE(s2 + 24));
        return scale ? dur / scale : null;
      }
      const scale = buf.readUInt32BE(s2 + 12);
      const dur = buf.readUInt32BE(s2 + 16);
      return scale && dur !== 0xffffffff ? dur / scale : null;
    }
  }
  return null;
}

/** ตรวจ + เก็บวิดีโอ → { key, seconds } */
export async function saveVideo(buf: Buffer) {
  if (buf.length > VIDEO_MAX_BYTES) throw new VideoError("ไฟล์วิดีโอใหญ่เกิน 30 MB");
  if (!isMp4(buf)) throw new VideoError("รองรับเฉพาะไฟล์วิดีโอ MP4");
  const sec = mp4Duration(buf);
  if (sec == null) throw new VideoError("อ่านความยาววิดีโอไม่ได้ (ไฟล์อาจเสีย) — ลองบันทึกใหม่เป็น MP4");
  if (sec < VIDEO_MIN_SECONDS - 0.5) throw new VideoError(`วิดีโอสั้นเกินไป (${sec.toFixed(1)} วินาที) — ต้อง ${VIDEO_MIN_SECONDS}–${VIDEO_MAX_SECONDS} วินาที`);
  if (sec > VIDEO_MAX_SECONDS + 0.5) throw new VideoError(`วิดีโอยาวเกินไป (${Math.round(sec)} วินาที) — ต้อง ${VIDEO_MIN_SECONDS}–${VIDEO_MAX_SECONDS} วินาที`);
  const now = new Date();
  const key = `videos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now().toString(36)}${randomBytes(5).toString("hex")}.mp4`;
  await storage().put(key, buf);
  return { key, seconds: Math.round(sec) };
}

export const isVideoKey = (k: unknown): k is string => typeof k === "string" && /^videos\/\d{4}\/\d{2}\/[a-z0-9]+\.mp4$/.test(k);
export const isPosterKey = (k: unknown): k is string => typeof k === "string" && /^videos\/\d{4}\/\d{2}\/[a-z0-9]+\.webp$/.test(k);
