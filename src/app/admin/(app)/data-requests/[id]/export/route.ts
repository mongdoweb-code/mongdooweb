// GET /admin/data-requests/:id/export — สำเนาข้อมูลส่วนบุคคลของผู้ขอ (ZIP: data.json + README) — เจ้าของร้านเท่านั้น · บันทึกทุกครั้ง
import { logAdmin } from "@/lib/admin-log";
import { routeAdmin } from "@/lib/auth";
import { fileResponse } from "@/lib/csv";
import { personExportZip } from "@/lib/pdpa";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: RouteContext<"/admin/data-requests/[id]/export">) {
  const admin = await routeAdmin(true);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const r = await prisma.dataRequest.findUnique({ where: { id } });
  if (!r) return new Response("ไม่พบคำขอ", { status: 404 });
  const zip = await personExportZip(r);
  await logAdmin(admin.id, "PDPA", `ส่งออกข้อมูลส่วนบุคคลของ ${r.name} (${(zip.length / 1024).toFixed(0)} KB)`, { entity: `DataRequest:${id}` });
  return fileResponse(new Uint8Array(zip), `pdpa-${r.phone}-${new Date().toISOString().slice(0, 10)}.zip`, "application/zip");
}
