// GET /media/:key — รูปสาธารณะ (สินค้า สไลด์ โลโก้ หมวด) จาก storage driver
// สลิปการโอน (slips/) ไม่อยู่ในรายการ จึงเปิดผ่านทางนี้ไม่ได้
import { MEDIA_PREFIXES } from "@/lib/media";
import { storage } from "@/lib/storage";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

export async function GET(_req: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const ext = key.split(".").pop() ?? "";
  if (!MEDIA_PREFIXES.some((p) => key.startsWith(`${p}/`)) || !TYPES[ext]) return new Response("Not found", { status: 404 });
  let data: Buffer | null = null;
  try {
    data = await storage().get(key);
  } catch {
    data = null;
  }
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[ext],
      // ชื่อไฟล์สุ่มใหม่ทุกครั้งที่อัปโหลด จึงแคชได้ถาวร
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
