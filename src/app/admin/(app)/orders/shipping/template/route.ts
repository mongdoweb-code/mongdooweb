// GET /admin/orders/shipping/template — CSV คำสั่งซื้อที่รอจัดส่ง (เติมขนส่ง/เลขพัสดุแล้วอัปโหลดกลับ)
import { getCurrentAdmin } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { ymdBkk } from "@/lib/doc-calc";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const orders = await prisma.order.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "asc" }, select: { orderNo: true, customerName: true, phone: true, province: true } });
  return csvResponse(`awaiting-shipment-${ymdBkk(new Date())}.csv`, [
    ["orderNo", "carrier", "trackingNo", "ชื่อผู้รับ (ไม่ต้องแก้)", "เบอร์โทร", "จังหวัด"],
    ...orders.map((o) => [o.orderNo, "", "", o.customerName, formatPhone(o.phone), o.province]),
  ]);
}
