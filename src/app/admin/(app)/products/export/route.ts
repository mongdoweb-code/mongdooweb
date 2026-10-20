// GET /admin/products/export — ส่งออกสินค้าทั้งหมดเป็น CSV (ใช้เป็นแม่แบบแก้ราคา/สต็อกแล้วนำเข้ากลับ)
import { logAdmin } from "@/lib/admin-log";
import { getCurrentAdmin } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { ymdBkk } from "@/lib/doc-calc";
import { exportRows } from "@/lib/product-csv";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const rows = await exportRows();
  await logAdmin(admin.id, "ORDERS_EXPORT", `ส่งออกสินค้า CSV ${rows.length - 1} รายการ`);
  return csvResponse(`products-${ymdBkk(new Date())}.csv`, rows);
}
