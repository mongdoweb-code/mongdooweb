// GET /admin/orders/cod/export?view=open|settled|pending — รายงานกระทบยอด COD (CSV)
import { STATUS_LABEL } from "@/lib/admin-orders";
import { routeAdmin } from "@/lib/auth";
import { csvTime, fileResponse, satangToBaht, toCsv } from "@/lib/csv";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const v = new URL(req.url).searchParams.get("view");
  const view = v === "settled" || v === "pending" || v === "all" ? v : "open";
  const where =
    view === "settled" ? { paymentMethod: "COD" as const, codSettledAt: { not: null } }
    : view === "pending" ? { paymentMethod: "COD" as const, status: { in: ["AWAITING_SLIP" as const, "PENDING_VERIFICATION" as const, "PAID" as const] } }
    : view === "all" ? { paymentMethod: "COD" as const }
    : { paymentMethod: "COD" as const, status: "SHIPPED" as const, codSettledAt: null };
  const rows = await prisma.order.findMany({ where, orderBy: { createdAt: "asc" }, take: 20000 });
  const head = ["เลขที่", "วันที่สั่ง", "ลูกค้า", "เบอร์โทร", "จังหวัด", "ขนส่ง", "เลขพัสดุ", "วันที่จัดส่ง", "ยอดเก็บปลายทาง (บาท)", "ค่าธรรมเนียม COD (บาท)", "สถานะ", "รับเงินจากขนส่งเมื่อ"];
  const body = rows.map((o) => [
    o.orderNo, csvTime(o.createdAt), o.customerName, formatPhone(o.phone), o.province, o.carrier, o.trackingNo, csvTime(o.shippedAt),
    satangToBaht(o.totalSatang), satangToBaht(o.codFeeSatang), STATUS_LABEL[o.status], csvTime(o.codSettledAt),
  ]);
  await prisma.adminLog.create({ data: { type: "ORDERS_EXPORT", note: `ส่งออกรายงาน COD (${view}) ${rows.length} รายการ`, adminId: admin.id } });
  return fileResponse(toCsv(head, body), `cod-${view}-${new Date().toISOString().slice(0, 10)}.csv`);
}
