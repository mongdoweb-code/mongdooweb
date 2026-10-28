"use server";
// อัปโหลดรูปจากตัวแก้ไขข้อความ (แทรกในคำอธิบายสินค้า) → ย่อเป็น WebP เก็บใน storage แล้วคืนลิงก์ /media/...
import { requireAdmin } from "@/lib/auth";
import { MediaError, mediaUrl, saveImage } from "@/lib/media";

export async function uploadEditorImage(f: FormData): Promise<{ url?: string; error?: string }> {
  await requireAdmin();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "ไม่พบไฟล์รูป" };
  try {
    const key = await saveImage(Buffer.from(await file.arrayBuffer()), "products");
    return { url: mediaUrl(key)! };
  } catch (e) {
    return { error: e instanceof MediaError ? e.message : "อัปโหลดรูปไม่สำเร็จ" };
  }
}
