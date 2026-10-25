// GET /admin/coupons/export.csv[?id=] — รายงานการใช้คูปอง (ทุกคูปอง หรือคูปองเดียว)
import { STATUS_LABEL } from "@/lib/admin-orders";
import { routeAdmin } from "@/lib/auth";
import { csvTime, fileResponse, satangToBaht, toCsv } from "@/lib/csv";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const id = (new URL(req.url).searchParams.get("id") ?? "").slice(0, 40);
  const rows = await prisma.couponRedemption.findMany({
    where: id ? { couponId: id } : {},
    orderBy: { createdAt: "asc" },
    take: 20000,
    include: { coupon: { select: { code: true } }, order: { select: { orderNo: true, customerName: true, status: true, subtotalSatang: true, totalSatang: true } } },
  });
  const head = ["คูปอง", "เลขที่คำสั่งซื้อ", "ลูกค้า", "เบอร์โทร", "ยอดสินค้า (บาท)", "ส่วนลด (บาท)", "ยอดชำระ (บาท)", "สถานะ", "เวลาใช้"];
  const body = rows.map((r) => [
    r.coupon.code, r.order.orderNo, r.order.customerName, formatPhone(r.phone), satangToBaht(r.order.subtotalSatang), satangToBaht(r.discountSatang),
    satangToBaht(r.order.totalSatang), STATUS_LABEL[r.order.status], csvTime(r.createdAt),
  ]);
  await prisma.adminLog.create({ data: { type: "COUPON", note: `ส่งออกรายงานการใช้คูปอง ${rows.length} รายการ`, adminId: admin.id } });
  return fileResponse(toCsv(head, body), `coupons-${new Date().toISOString().slice(0, 10)}.csv`);
}
