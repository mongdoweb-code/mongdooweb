// GET /media/:key — รูปสาธารณะ (สินค้า สไลด์ โลโก้ หมวด ผลงาน บทความ โลโก้ลูกค้า) จาก storage driver
// สลิปการโอน (slips/) ไม่อยู่ในรายการ จึงเปิดผ่านทางนี้ไม่ได้
// รูปรีวิว (reviews/) เปิดได้เมื่อรีวิวนั้นอนุมัติแล้ว — รีวิวที่รอตรวจ/ซ่อน เปิดได้เฉพาะแอดมินที่ล็อกอิน (ไม่แคชสาธารณะ)
// รอบ 3 (U14): รูปย่อ <base>-w{320|640|960|1280}.webp — ยังไม่มีไฟล์ = สร้างจากรูปเต็มแล้วเก็บไว้
//   เบราว์เซอร์ที่ส่ง Accept: image/avif ได้ไฟล์ AVIF (เล็กกว่า WebP ~15–30%) จาก URL เดียวกัน (Vary: Accept)
import { getCurrentAdmin } from "@/lib/auth";
import { AVIF_SUPPORTED, MEDIA_PREFIXES, generateVariant, parseVariant } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png", avif: "image/avif" };

/** รูปรีวิว: key ของรูปเต็ม (ตัด -sm / -wNNN และ .avif) → ดูสถานะรีวิวที่ใช้รูปนั้น */
async function reviewImageVisible(key: string) {
  const full = key.replace(/\.avif$/, ".webp").replace(/-(sm|w\d+)\.webp$/, ".webp");
  const r = await prisma.review.findFirst({ where: { images: { has: full } }, select: { status: true } }).catch(() => null);
  if (r?.status === "APPROVED") return "public";
  return (await getCurrentAdmin().catch(() => null)) ? "private" : null;
}

async function read(key: string) {
  try {
    return await storage().get(key);
  } catch {
    return null;
  }
}

export async function GET(req: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const ext = key.split(".").pop() ?? "";
  if (!MEDIA_PREFIXES.some((p) => key.startsWith(`${p}/`)) || !TYPES[ext]) return new Response("Not found", { status: 404 });
  const access = key.startsWith("reviews/") ? await reviewImageVisible(key) : "public";
  if (!access) return new Response("Not found", { status: 404 });
  const variant = parseVariant(key);
  let served = key;
  let data: Buffer | null = null;
  if (variant && variant.fmt === "webp" && AVIF_SUPPORTED && /image\/avif/.test(req.headers.get("accept") ?? "")) {
    served = key.replace(/\.webp$/, ".avif");
    data = (await read(served)) ?? (await generateVariant(served).catch(() => null));
    if (!data) served = key;
  }
  if (!data) data = await read(key);
  if (!data && variant) data = await generateVariant(key).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[served.split(".").pop()!],
      // ชื่อไฟล์สุ่มใหม่ทุกครั้งที่อัปโหลด จึงแคชได้ถาวร (รูปรีวิว: แคชสั้นเพราะซ่อนทีหลังได้ · ยังไม่อนุมัติ = ห้ามแคชสาธารณะ)
      "Cache-Control": access === "public" ? (key.startsWith("reviews/") ? "public, max-age=3600" : "public, max-age=31536000, immutable") : "private, no-store",
      ...(variant ? { Vary: "Accept" } : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
