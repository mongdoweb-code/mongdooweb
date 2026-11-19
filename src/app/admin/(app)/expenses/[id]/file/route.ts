// GET /admin/expenses/:id/file — หลักฐานค่าใช้จ่าย (ไฟล์ส่วนตัว: เฉพาะแอดมินที่เข้าสู่ระบบ · ห้ามแคช · ตรวจชนิดจากไบต์จริง)
import { routeAdmin } from "@/lib/auth";
import { EXPENSE_FILE_RE } from "@/lib/expense-rules";
import { prisma } from "@/lib/prisma";
import { sniffImage, storage } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/admin/expenses/[id]/file">) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const e = await prisma.expense.findUnique({ where: { id: id.slice(0, 40) }, select: { fileKey: true } });
  const key = e?.fileKey;
  if (!key || !EXPENSE_FILE_RE.test(key)) return new Response("Not found", { status: 404 });
  const data = await storage().get(key).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });
  const pdf = key.endsWith(".pdf") && data.subarray(0, 5).toString("latin1") === "%PDF-";
  const img = !pdf && sniffImage(data);
  if (!pdf && !img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": pdf ? "application/pdf" : img ? img.mime : "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
