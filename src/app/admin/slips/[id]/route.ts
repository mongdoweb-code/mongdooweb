// GET /admin/slips/:id — ภาพสลิป เปิดได้เฉพาะแอดมินที่ล็อกอินอยู่
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/admin/slips/[id]">) {
  if (!(await getCurrentAdmin())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const slip = await prisma.paymentSlip.findUnique({ where: { id: id.slice(0, 40) } });
  const data = slip && (await storage().get(slip.storageKey));
  if (!slip || !data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": slip.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
