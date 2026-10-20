// GET /api/inquiries/:id/attachments/:n — รูปแนบของคำขอ (อาจมีรูปบ้าน/หน้างานลูกค้า) เปิดได้เฉพาะแอดมินที่เข้าสู่ระบบ
import { getCurrentAdmin } from "@/lib/auth";
import { INQUIRY_PREFIX } from "@/lib/inquiries";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/inquiries/[id]/attachments/[n]">) {
  if (!(await getCurrentAdmin())) return new Response("Unauthorized", { status: 401 });
  const { id, n } = await ctx.params;
  const inq = await prisma.inquiry.findUnique({ where: { id: id.slice(0, 40) }, select: { attachments: true } });
  const list = Array.isArray(inq?.attachments) ? (inq.attachments as unknown[]) : [];
  const key = list[Number(n)];
  if (typeof key !== "string" || !key.startsWith(`${INQUIRY_PREFIX}/`)) return new Response("Not found", { status: 404 });
  const data = await storage().get(key).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
