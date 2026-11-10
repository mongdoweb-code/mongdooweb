// POST /admin/products/upload — อัปโหลดรูป/วิดีโอสินค้าทันทีที่เลือก (ก่อนกดบันทึกสินค้า)
// kind=image → products/…webp (+รูปย่อ) · kind=video → videos/…mp4 (MP4 ≤30 MB 10–60 วินาที) · kind=poster → videos/…webp (ภาพปกวิดีโอ)
// คืน { key, url, sm?, seconds? } — ฟอร์มสินค้าเก็บ key ไว้ แล้วบันทึกลงสินค้าตอนกด "บันทึกสินค้า"
// ไฟล์ที่อัปโหลดแล้วแต่ไม่ได้บันทึกลงสินค้า จะไม่ถูกใช้ที่ไหน (หน้าตรวจรูปภาพไม่นับ)
import { routeAdmin } from "@/lib/auth";
import { IMAGE_MAX_BYTES, MediaError, mediaUrl, saveImage } from "@/lib/media";
import { VIDEO_MAX_BYTES, VideoError, saveVideo } from "@/lib/video";

const err = (msg: string, status = 400) => Response.json({ error: msg }, { status });

export async function POST(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  // กันเว็บอื่นยิงฟอร์มมา (คุกกี้ SameSite ช่วยอยู่แล้ว — ตรวจ Origin อีกชั้น)
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return err("ไม่อนุญาต", 403);
  let f: FormData;
  try {
    f = await req.formData();
  } catch {
    return err("อ่านไฟล์ไม่สำเร็จ — ไฟล์อาจใหญ่เกินไป");
  }
  const kind = String(f.get("kind") ?? "");
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return err("ไม่พบไฟล์");
  const max = kind === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (file.size > max) return err(kind === "video" ? "ไฟล์วิดีโอใหญ่เกิน 30 MB" : "ไฟล์รูปใหญ่เกิน 10 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    if (kind === "image") {
      const key = await saveImage(buf, "products");
      return Response.json({ key, url: mediaUrl(key, "sm") });
    }
    if (kind === "poster") {
      const key = await saveImage(buf, "videos", { full: 1280, thumb: 480 });
      return Response.json({ key, url: mediaUrl(key, "sm") });
    }
    if (kind === "video") {
      const v = await saveVideo(buf);
      return Response.json({ key: v.key, url: mediaUrl(v.key), seconds: v.seconds });
    }
  } catch (e) {
    if (e instanceof MediaError || e instanceof VideoError) return err(e.message);
    console.error("product upload", e);
    return err("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  }
  return err("ชนิดไฟล์ไม่ถูกต้อง");
}
