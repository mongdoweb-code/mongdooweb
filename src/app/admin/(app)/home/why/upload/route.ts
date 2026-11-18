// POST /admin/home/why/upload — อัปโหลดรูปส่วน "ทำไมต้องมองดูเว็บ" ทันทีที่เลือก (ก่อนกดบันทึก)
// เก็บที่ why/YYYY/MM/*.webp (+รูปย่อ) · คืน { key, url } — ตัวแก้ไขเก็บ key ไว้ แล้วบันทึกตอนกด "บันทึก"
// ไฟล์ที่อัปโหลดแต่ไม่ได้บันทึก จะไม่ถูกใช้ที่ไหน
import { routeAdmin } from "@/lib/auth";
import { IMAGE_MAX_BYTES, MediaError, mediaUrl, saveImage } from "@/lib/media";

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
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return err("ไม่พบไฟล์");
  if (file.size > IMAGE_MAX_BYTES) return err("ไฟล์รูปใหญ่เกิน 10 MB");
  try {
    // กล่องรูปกว้างไม่เกิน ~560px (×2 จอความละเอียดสูง) แนวตั้ง 4:5 → เก็บเต็ม 1400 · ย่อ 480
    const key = await saveImage(Buffer.from(await file.arrayBuffer()), "why", { full: 1400, thumb: 480 });
    return Response.json({ key, url: mediaUrl(key, "sm") });
  } catch (e) {
    if (e instanceof MediaError) return err(e.message);
    console.error("why upload", e);
    return err("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  }
}
