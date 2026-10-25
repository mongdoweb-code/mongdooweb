// GET /admin/claims/:id/photo/:n — รูปที่ลูกค้าแนบกับเรื่องเคลม (เฉพาะแอดมิน, เฉพาะไฟล์ใต้ "claims/", ห้ามแคช)
import { routeAdmin } from "@/lib/auth";
import { CLAIM_PREFIX } from "@/lib/claims";
import { prisma } from "@/lib/prisma";
import { sniffImage, storage } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/admin/claims/[id]/photo/[n]">) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const { id, n } = await ctx.params;
  if (!/^\d{1,2}$/.test(n)) return new Response("Not found", { status: 404 });
  const c = await prisma.claim.findUnique({ where: { id: id.slice(0, 40) }, select: { images: true } });
  const key = c?.images[Number(n)];
  if (!key || !key.startsWith(`${CLAIM_PREFIX}/`) || key.includes("..")) return new Response("Not found", { status: 404 });
  const data = await storage().get(key).catch(() => null);
  const type = data && sniffImage(data);
  if (!data || !type) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": type.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
