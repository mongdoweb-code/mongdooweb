// GET /admin/doc-slips/:id — ภาพสลิปที่ลูกค้าแนบผ่านลิงก์ใบแจ้งหนี้ เปิดได้เฉพาะแอดมินที่ล็อกอินอยู่
import { routeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sniffImage, storage } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/admin/doc-slips/[id]">) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const slip = await prisma.docSlip.findUnique({ where: { id: id.slice(0, 40) } });
  const data = slip && (await storage().get(slip.storageKey).catch(() => null));
  const type = data && sniffImage(data);
  if (!slip || !data || !type) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": type.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
