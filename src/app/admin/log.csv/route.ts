// GET /admin/log.csv — ส่งออกบันทึกการใช้งานตามตัวกรองของหน้า /admin/log (เจ้าของร้านเท่านั้น, สูงสุด 50,000 แถว)
import { routeAdmin } from "@/lib/auth";
import { fileResponse, csvTime, toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { ALL_LOG_TYPES, ORDER_EVENT, adminLogWhere, orderEventWhere, parseLogFilter } from "../(app)/log/types";

const MAX = 50_000;

export async function GET(req: Request) {
  const admin = await routeAdmin(true);
  if (admin instanceof Response) return admin;
  const f = parseLogFilter(Object.fromEntries(new URL(req.url).searchParams));
  let rows: unknown[][];
  if (f.tab === "orders") {
    const ev = await prisma.orderEvent.findMany({ where: orderEventWhere(f), orderBy: { createdAt: "desc" }, take: MAX, include: { admin: { select: { username: true } }, order: { select: { orderNo: true } } } });
    rows = ev.map((e) => [csvTime(e.createdAt), e.type, ORDER_EVENT[e.type] ?? e.type, `${e.order.orderNo}${e.note ? ` · ${e.note}` : ""}`, e.admin?.username ?? "ลูกค้า/ระบบ"]);
  } else {
    const logs = await prisma.adminLog.findMany({ where: adminLogWhere(f), orderBy: { createdAt: "desc" }, take: MAX, include: { admin: { select: { username: true } } } });
    rows = logs.map((l) => [csvTime(l.createdAt), l.type, ALL_LOG_TYPES[l.type] ?? l.type, l.note ?? "", l.admin?.username ?? ""]);
  }
  await prisma.adminLog.create({
    data: { type: "LOG_EXPORT", note: `ส่งออกบันทึกการใช้งาน ${rows.length} รายการ (หมวด ${f.tab}${f.from || f.to ? `, ${f.from || "…"} ถึง ${f.to || "…"}` : ""})`, adminId: admin.id },
  });
  return fileResponse(toCsv(["เวลา (กรุงเทพฯ)", "รหัสชนิด", "รายการ", "รายละเอียด", "ผู้ใช้"], rows), `admin-log-${new Date().toISOString().slice(0, 10)}.csv`);
}
