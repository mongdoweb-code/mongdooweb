// GET /admin/backups/:id/download — ดาวน์โหลดไฟล์สำรองข้อมูล (เจ้าของร้านเท่านั้น · บันทึกทุกครั้ง)
import { logAdmin } from "@/lib/admin-log";
import { routeAdmin } from "@/lib/auth";
import { fileResponse } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/admin/backups/[id]/download">) {
  const admin = await routeAdmin(true);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const run = await prisma.backupRun.findUnique({ where: { id } });
  if (!run?.key || run.status !== "OK") return new Response("ไม่พบไฟล์สำรอง", { status: 404 });
  const data = await storage().get(run.key);
  if (!data) return new Response("ไม่พบไฟล์ในที่เก็บไฟล์", { status: 404 });
  await logAdmin(admin.id, "BACKUP", `ดาวน์โหลดไฟล์สำรอง ${run.key}`);
  return fileResponse(new Uint8Array(data), `mongdoweb-${run.key.replace(/^backups\//, "")}`, "application/zip");
}
