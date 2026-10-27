// GET /admin/stock-alerts/export?status=open|done|all — ส่งออกรายชื่อรอสินค้าเข้าเป็น CSV (ติดต่อลูกค้าทีละคน/บรอดแคสต์)
import { logAdmin } from "@/lib/admin-log";
import { routeAdmin } from "@/lib/auth";
import { csvResponse, csvTime } from "@/lib/csv";
import { ymdBkk } from "@/lib/doc-calc";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const status = new URL(req.url).searchParams.get("status") ?? "open";
  const rows = await prisma.stockAlert.findMany({
    where: status === "all" ? {} : status === "done" ? { notifiedAt: { not: null } } : { notifiedAt: null },
    orderBy: [{ product: { name: "asc" } }, { createdAt: "asc" }],
    include: { product: { select: { sku: true, name: true, stock: true, trackStock: true, inStock: true } } },
  });
  await logAdmin(admin.id, "STOCK_ALERT", `ส่งออกรายชื่อรอสินค้าเข้า CSV ${rows.length} รายการ`);
  return csvResponse(`stock-alerts-${ymdBkk(new Date())}.csv`, [
    ["SKU", "สินค้า", "มีของตอนนี้", "ชื่อ", "เบอร์โทร", "LINE ID", "อีเมล", "วันที่ฝาก", "แจ้งแล้วเมื่อ"],
    ...rows.map((r) => [
      r.product.sku,
      r.product.name,
      (r.product.trackStock ? r.product.stock > 0 : r.product.inStock) ? "มี" : "หมด",
      r.name ?? "",
      r.phone ?? "",
      r.lineId ?? "",
      r.email ?? "",
      csvTime(r.createdAt),
      csvTime(r.notifiedAt),
    ]),
  ]);
}
