// GET /admin/inquiries/:id/file/:n — รูปแนบของคำขอ (เปิดได้เฉพาะแอดมิน, ตรวจชนิดไฟล์จากไบต์จริง)
import { routeAdmin } from "@/lib/auth";
import { parseAttachments } from "@/lib/inquiries";
import { prisma } from "@/lib/prisma";
import { sniffImage, storage } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/admin/inquiries/[id]/file/[n]">) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const { id, n } = await ctx.params;
  const q = await prisma.inquiry.findUnique({ where: { id: id.slice(0, 40) }, select: { attachments: true } });
  const key = q ? parseAttachments(q.attachments)[Number(n)] : undefined;
  let data: Buffer | null = null;
  try {
    data = key ? await storage().get(key) : null;
  } catch {
    data = null;
  }
  const type = data && sniffImage(data);
  if (!data || !type) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": type.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
