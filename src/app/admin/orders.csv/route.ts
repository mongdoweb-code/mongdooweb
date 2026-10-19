// GET /admin/orders.csv — ส่งออกคำสั่งซื้อตามตัวกรองปัจจุบัน (มี BOM ให้ Excel อ่านภาษาไทยได้)
import { STATUS_LABEL, listOrders, parseFilter } from "@/lib/admin-orders";
import { getCurrentAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

// กัน CSV/formula injection: ค่าที่ขึ้นต้นด้วย = + - @ ใส่ ' นำหน้า
const q = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = { ...parseFilter(sp), page: 1, size: 10_000 };
  const { rows } = await listOrders(f);
  const orders = await prisma.order.findMany({
    where: { orderNo: { in: rows.map((r) => r.orderNo) } },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
  const head = ["เลขที่", "วันที่", "สถานะ", "ชื่อผู้รับ", "เบอร์โทร", "ที่อยู่", "รหัสไปรษณีย์", "รายการ", "วิธีส่ง", "ยอดรวม", "ขนส่ง", "เลขพัสดุ", "หมายเหตุ"];
  const lines = orders.map((o) =>
    [
      o.orderNo,
      o.createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }),
      STATUS_LABEL[o.status],
      o.customerName,
      formatPhone(o.phone),
      [o.addressLine, o.subdistrict, o.district, o.province].join(" "),
      o.postalCode,
      o.items.map((i) => `${i.nameSnapshot} x${i.qty}`).join(" | "),
      o.shippingName,
      (o.totalSatang / 100).toFixed(2),
      o.carrier,
      o.trackingNo,
      o.note,
    ].map(q).join(","),
  );
  await prisma.adminLog.create({ data: { type: "ORDERS_EXPORT", note: `ส่งออก CSV ${orders.length} รายการ`, adminId: admin.id } });
  const name = `orders-${f.tab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + [head.map(q).join(","), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
