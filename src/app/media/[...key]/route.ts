// GET /media/:key — รูปสาธารณะ (สินค้า สไลด์ โลโก้ หมวด ผลงาน บทความ โลโก้ลูกค้า) จาก storage driver
// สลิปการโอน (slips/) ไม่อยู่ในรายการ จึงเปิดผ่านทางนี้ไม่ได้
// รูปรีวิว (reviews/) เปิดได้เมื่อรีวิวนั้นอนุมัติแล้ว — รีวิวที่รอตรวจ/ซ่อน เปิดได้เฉพาะแอดมินที่ล็อกอิน (ไม่แคชสาธารณะ)
import { getCurrentAdmin } from "@/lib/auth";
import { MEDIA_PREFIXES } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

async function reviewImageVisible(key: string) {
  const full = key.replace(/-sm\.webp$/, ".webp");
  const r = await prisma.review.findFirst({ where: { images: { has: full } }, select: { status: true } }).catch(() => null);
  if (r?.status === "APPROVED") return "public";
  return (await getCurrentAdmin().catch(() => null)) ? "private" : null;
}

export async function GET(_req: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const ext = key.split(".").pop() ?? "";
  if (!MEDIA_PREFIXES.some((p) => key.startsWith(`${p}/`)) || !TYPES[ext]) return new Response("Not found", { status: 404 });
  const access = key.startsWith("reviews/") ? await reviewImageVisible(key) : "public";
  if (!access) return new Response("Not found", { status: 404 });
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
      // ชื่อไฟล์สุ่มใหม่ทุกครั้งที่อัปโหลด จึงแคชได้ถาวร (รูปรีวิวที่ยังไม่อนุมัติ = ห้ามแคชสาธารณะ)
      "Cache-Control": access === "public" ? (key.startsWith("reviews/") ? "public, max-age=3600" : "public, max-age=31536000, immutable") : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
