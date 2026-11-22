// POST /api/videos/:id/view — นับยอดเปิดดูคลิป (หน้าวิดีโอ/หน้าสินค้า/หน้าแรก เรียกเมื่อเปิดตัวเล่น)
// กันนับซ้ำ: IP + คลิปเดียวกัน 6 ชม. นับครั้งเดียว (ในหน่วยความจำ — รัน 1 replica) · ไม่นับบอต
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";

const seen = new Map<string, number>();
const WINDOW = 6 * 3600e3;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse|headless/i;

export async function POST(req: Request, ctx: RouteContext<"/api/videos/[id]/view">) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{10,40}$/.test(id) || BOT.test(req.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 });
  const key = `${await clientIp()}:${id}`;
  const now = Date.now();
  if ((seen.get(key) ?? 0) > now - WINDOW) return new Response(null, { status: 204 });
  seen.set(key, now);
  if (seen.size > 50_000) for (const [k, t] of seen) if (t < now - WINDOW) seen.delete(k);
  await prisma.video.updateMany({ where: { id, isActive: true }, data: { views: { increment: 1 } } }).catch(() => {});
  return new Response(null, { status: 204 });
}
