// GET /admin/export.zip — สำรองข้อมูลทั้งหมด (คำสั่งซื้อ ลูกค้า เอกสารขาย สินค้า ฯลฯ) เป็น ZIP ของ CSV
// เจ้าของร้านเท่านั้น และบันทึกทุกครั้งใน AdminLog
import { routeAdmin } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { buildDataExport } from "@/lib/data-export";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await routeAdmin(true);
  if (admin instanceof Response) return admin;
  const { zip, summary } = await buildDataExport(`${admin.displayName} (${admin.username})`);
  await prisma.adminLog.create({ data: { type: "DATA_EXPORT", note: `ดาวน์โหลดสำรองข้อมูลทั้งหมด (${summary} ตาราง, ${(zip.length / 1024).toFixed(0)} KB)`, adminId: admin.id } });
  const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return csvResponse(zip, `mongdoweb-backup-${stamp}.zip`, "application/zip");
}
