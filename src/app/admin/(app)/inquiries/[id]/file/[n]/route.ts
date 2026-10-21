// GET /admin/inquiries/:id/file/:n — รูปแนบของคำขอ (เส้นทางเดียวของรูปแนบ: หน้าคำขอในหลังบ้านใช้เส้นทางนี้)
// เปิดได้เฉพาะแอดมินที่เข้าสู่ระบบ (บัญชีที่ต้องเปลี่ยนรหัสผ่านก่อนถูกปฏิเสธ), อ่านได้เฉพาะไฟล์ใต้ "inquiries/",
// ตรวจชนิดไฟล์จากไบต์จริง และห้ามแคช (รูปหน้างาน/บ้านลูกค้าเป็นข้อมูลส่วนบุคคล)
import { routeAdmin } from "@/lib/auth";
import { INQUIRY_PREFIX, parseAttachments } from "@/lib/inquiries";
import { prisma } from "@/lib/prisma";
import { sniffImage, storage } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/admin/inquiries/[id]/file/[n]">) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const { id, n } = await ctx.params;
  const idx = Number(n);
  if (!/^\d{1,2}$/.test(n) || !Number.isInteger(idx)) return new Response("Not found", { status: 404 });
  const q = await prisma.inquiry.findUnique({ where: { id: id.slice(0, 40) }, select: { attachments: true } });
  const key = q ? parseAttachments(q.attachments)[idx] : undefined;
  if (!key || !key.startsWith(`${INQUIRY_PREFIX}/`) || key.includes("..")) return new Response("Not found", { status: 404 });
  const data = await storage().get(key).catch(() => null);
  const type = data && sniffImage(data);
  if (!data || !type) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": type.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
