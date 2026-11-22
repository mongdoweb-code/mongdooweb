// POST /api/admin/videos/upload?kind=video|poster — อัปโหลดคลิป (ถ่ายจากมือถือ ≤200 MB ≤3 นาที) / รูปปก ของหน้าวิดีโอ ทันทีที่เลือก
// อยู่ใต้ /api (ไม่ผ่าน proxy ที่จำกัดขนาด body 40 MB) · ส่งไฟล์เป็น body ตรง ๆ (ไม่ใช่ multipart) แล้วอ่านแบบสตรีมพร้อมจำกัดขนาด
// ตรวจสิทธิ์เองทุกครั้ง (routeAdmin) + Origin ต้องเป็นโดเมนเดียวกัน · คืน { key, url, seconds?, hevc? } — ฟอร์มบันทึก key ตอนกด "บันทึกคลิป"
import { routeAdmin } from "@/lib/auth";
import { IMAGE_MAX_BYTES, MediaError, mediaUrl, saveImage } from "@/lib/media";
import { CLIP_MAX_BYTES, VideoError, saveClip } from "@/lib/video";

const err = (msg: string, status = 400) => Response.json({ error: msg }, { status });

/** อ่าน body ทีละส่วน — เกินขนาดหยุดทันที (ไม่อ่านทั้งไฟล์เข้าหน่วยความจำก่อนตรวจ) */
async function readLimited(req: Request, max: number): Promise<Buffer | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

export async function POST(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return err("ไม่อนุญาต", 403);
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "video" && kind !== "poster") return err("ชนิดไฟล์ไม่ถูกต้อง");
  const max = kind === "video" ? CLIP_MAX_BYTES : IMAGE_MAX_BYTES;
  const buf = await readLimited(req, max).catch(() => null);
  if (!buf) return err(kind === "video" ? "ไฟล์วิดีโอใหญ่เกิน 200 MB" : "ไฟล์รูปใหญ่เกิน 10 MB", 413);
  if (!buf.length) return err("ไม่พบไฟล์");
  try {
    if (kind === "poster") {
      const key = await saveImage(buf, "videos", { full: 1280, thumb: 480 });
      return Response.json({ key, url: mediaUrl(key, "sm") });
    }
    const v = await saveClip(buf);
    return Response.json({ key: v.key, url: mediaUrl(v.key), seconds: v.seconds, hevc: v.hevc });
  } catch (e) {
    if (e instanceof MediaError || e instanceof VideoError) return err(e.message);
    console.error("video upload", e);
    return err("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  }
}
