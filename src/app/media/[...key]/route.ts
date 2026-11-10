// GET /media/:key — รูปสาธารณะ (สินค้า สไลด์ โลโก้ หมวด ผลงาน บทความ โลโก้ลูกค้า) จาก storage driver
// สลิปการโอน (slips/) ไม่อยู่ในรายการ จึงเปิดผ่านทางนี้ไม่ได้
// วิดีโอสินค้า (videos/*.mp4) ส่งแบบ HTTP Range (206) · รูปรีวิว (reviews/) เปิดได้เมื่อรีวิวนั้นอนุมัติแล้ว — รีวิวที่รอตรวจ/ซ่อน เปิดได้เฉพาะแอดมินที่ล็อกอิน (ไม่แคชสาธารณะ)
// รอบ 3 (U14): รูปย่อ <base>-w{320|640|960|1280}.webp — ยังไม่มีไฟล์ = สร้างจากรูปเต็มแล้วเก็บไว้
//   เบราว์เซอร์ที่ส่ง Accept: image/avif ได้ไฟล์ AVIF (เล็กกว่า WebP ~15–30%) จาก URL เดียวกัน (Vary: Accept)
import { getCurrentAdmin } from "@/lib/auth";
import { AVIF_SUPPORTED, MEDIA_PREFIXES, generateVariant, parseVariant } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png", avif: "image/avif", mp4: "video/mp4" };
const FOREVER = "public, max-age=31536000, immutable";

/** วิดีโอสินค้า (videos/*.mp4): ส่งทีละช่วงตาม Range — เบราว์เซอร์กรอ/เริ่มเล่นได้โดยไม่ต้องโหลดทั้งไฟล์ (Safari ต้องมี) */
async function video(req: Request, key: string) {
  const size = await storage().size(key).catch(() => null);
  if (size == null) return new Response("Not found", { status: 404 });
  const base = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": FOREVER, "X-Content-Type-Options": "nosniff" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!m || (!m[1] && !m[2])) {
    const all = await storage().get(key).catch(() => null);
    if (!all) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(all), { headers: { ...base, "Content-Length": String(all.length) } });
  }
  // bytes=a-b · bytes=a- · bytes=-n (n ไบต์สุดท้าย) — ส่งครั้งละไม่เกิน 2 MB
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  let end = m[1] ? (m[2] ? Number(m[2]) : size - 1) : size - 1;
  end = Math.min(end, size - 1, start + 2 * 1024 * 1024 - 1);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  start = Math.max(0, start);
  const part = await storage().getRange(key, start, end).catch(() => null);
  if (!part) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(part), {
    status: 206,
    headers: { ...base, "Content-Range": `bytes ${start}-${start + part.length - 1}/${size}`, "Content-Length": String(part.length) },
  });
}

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
  if (ext === "mp4") return key.startsWith("videos/") ? video(req, key) : new Response("Not found", { status: 404 });
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
