// แจ้งเตือนร้านทาง LINE สำหรับงานรอบ 3 (COD ใหม่, ลูกค้ายกเลิกเอง, ยืนยันใบเสนอราคา, สลิปใบแจ้งหนี้, เคลม)
// เรียกใน after() เท่านั้น — ส่งไม่สำเร็จไม่กระทบงานหลัก (บันทึกไว้ในบันทึกการใช้งาน)
import "server-only";
import { logAdmin } from "@/lib/admin-log";
import { formatPhone } from "@/lib/format";
import { notifyShop, siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";

const baht = (satang: number) => "฿" + (satang / 100).toLocaleString("en-US", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** ส่งข้อความแบบไม่โยน error */
export async function notifySafe(what: string, build: () => Promise<string | null> | string | null) {
  try {
    const text = await build();
    if (text) await notifyShop(text);
  } catch (e) {
    await logAdmin(null, "LINE", `แจ้งเตือน ${what} ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
  }
}

/** คำสั่งซื้อเก็บเงินปลายทางใหม่ รอร้านโทรยืนยัน */
export const notifyCodOrder = (orderNo: string) =>
  notifySafe(`COD ${orderNo}`, async () => {
    const o = await prisma.order.findUnique({ where: { orderNo }, include: { items: { select: { qty: true } } } });
    if (!o) return null;
    const queue = await prisma.order.count({ where: { status: "PENDING_VERIFICATION", paymentMethod: "COD" } });
    return [
      "🚚 คำสั่งซื้อเก็บเงินปลายทาง (COD) รอยืนยัน",
      `คำสั่งซื้อ ${o.orderNo}`,
      `ลูกค้า: ${o.customerName} · ${formatPhone(o.phone)} · ${o.province}`,
      `ยอดเก็บปลายทาง ${baht(o.totalSatang)} (${o.items.reduce((n, i) => n + i.qty, 0)} ชิ้น · ค่าธรรมเนียม COD ${baht(o.codFeeSatang)})`,
      `คิวรอยืนยัน COD ทั้งหมด ${queue} รายการ`,
      "",
      `เปิดยืนยัน: ${siteUrl()}/admin?tab=COD&open=${encodeURIComponent(o.orderNo)}`,
    ].join("\n");
  });

/** ลูกค้ายกเลิกคำสั่งซื้อเอง */
export const notifyCustomerCancel = (r: { orderNo: string; customerName: string; totalSatang: number; reason: string }) =>
  notifySafe(`ยกเลิก ${r.orderNo}`, () =>
    [`❌ ลูกค้ายกเลิกคำสั่งซื้อเอง`, `คำสั่งซื้อ ${r.orderNo} · ${r.customerName}`, `ยอด ${baht(r.totalSatang)}`, r.reason, "", `ดู: ${siteUrl()}/admin?tab=ALL&open=${encodeURIComponent(r.orderNo)}`].join("\n"),
  );
