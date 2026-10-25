"use server";
// เก็บเงินปลายทาง (A17): ร้านโทรยืนยันแล้วกด "ยืนยัน COD" → พร้อมจัดส่ง (ตัดสต็อกเหมือนอนุมัติสลิป)
// กระทบยอด: เมื่อขนส่งโอนเงิน COD คืน → ทำเครื่องหมาย "รับเงินแล้ว" (codSettledAt) ทีละรายการหรือหลายรายการ
import { redirect } from "next/navigation";
import { after } from "next/server";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { sendOrderEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { alertLowStock, moveStock } from "@/lib/stock";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
/** กลับหน้าเดิม — รับเฉพาะ query string ?a=b กัน redirect ไปเว็บอื่น */
function back(f: FormData, path = "/admin", patch: Record<string, string> = {}) {
  const raw = str(f, "ret", 500);
  const qs = new URLSearchParams(/^\?[\w=&%.+\-]*$/.test(raw) ? raw.slice(1) : "");
  for (const k of ["mode", "err", "done", "settled"]) qs.delete(k);
  for (const [k, v] of Object.entries(patch)) qs.set(k, v);
  const s = qs.toString();
  return `${path}${s ? `?${s}` : ""}`;
}

export async function confirmCodOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const note = str(f, "note", 200);
  const moves = await prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { orderNo }, select: { id: true } });
    if (!o) return null;
    const r = await tx.order.updateMany({ where: { id: o.id, status: "PENDING_VERIFICATION", paymentMethod: "COD" }, data: { status: "PAID", paidAt: new Date() } });
    if (r.count !== 1) return null;
    await tx.orderEvent.create({ data: { orderId: o.id, type: "COD_CONFIRMED", note: `ยืนยันคำสั่งซื้อเก็บเงินปลายทาง${note ? ` — ${note}` : ""}`, adminId: admin.id } });
    const items = await tx.orderItem.findMany({ where: { orderId: o.id, productId: { not: null } }, select: { productId: true, qty: true } });
    return moveStock(tx, items.map((i) => ({ productId: i.productId!, delta: -i.qty })), { reason: "SALE", ref: orderNo, adminId: admin.id, note: "ตัดสต็อกเมื่อยืนยันคำสั่งซื้อ COD" });
  });
  if (moves) {
    if (moves.length) refreshStorefront();
    after(async () => {
      await alertLowStock(moves, orderNo);
      await sendOrderEmail(orderNo, "PAID");
    });
    await logAdmin(admin.id, "ORDER", `ยืนยันคำสั่งซื้อ COD ${orderNo}${note ? ` (${note})` : ""}`);
  }
  // ไปคำสั่งซื้อ COD ที่รอยืนยันถัดไป
  const next = await prisma.order.findFirst({ where: { status: "PENDING_VERIFICATION", paymentMethod: "COD", orderNo: { not: orderNo } }, orderBy: { createdAt: "asc" }, select: { orderNo: true } });
  redirect(back(f, "/admin", { open: next?.orderNo ?? orderNo }));
}

/** ทำเครื่องหมายว่าขนส่งโอนเงิน COD คืนแล้ว (หลายรายการพร้อมกันได้) — เฉพาะที่จัดส่งแล้วและยังไม่กระทบยอด */
export async function settleCod(f: FormData) {
  const admin = await requireAdmin();
  const nos = [...new Set(f.getAll("pick").map(String).filter((x) => /^[\w-]{3,40}$/.test(x)))].slice(0, 500);
  const ref = str(f, "ref", 100);
  const orders = await prisma.order.findMany({ where: { orderNo: { in: nos }, paymentMethod: "COD", status: "SHIPPED", codSettledAt: null }, select: { id: true, orderNo: true, totalSatang: true } });
  let done = 0;
  for (const o of orders) {
    const ok = await prisma.$transaction(async (tx) => {
      const r = await tx.order.updateMany({ where: { id: o.id, codSettledAt: null }, data: { codSettledAt: new Date() } });
      if (r.count !== 1) return false;
      await tx.orderEvent.create({ data: { orderId: o.id, type: "COD_SETTLED", note: `ขนส่งโอนเงิน COD คืนแล้ว${ref ? ` (อ้างอิง ${ref})` : ""}`, adminId: admin.id } });
      return true;
    });
    if (ok) done++;
  }
  if (done) await logAdmin(admin.id, "ORDER", `กระทบยอด COD รับเงินแล้ว ${done} รายการ${ref ? ` (อ้างอิง ${ref})` : ""}: ${orders.map((o) => o.orderNo).join(", ")}`.slice(0, 1000));
  redirect(str(f, "from") === "drawer" ? back(f) : back(f, "/admin/orders/cod", { settled: String(done) }));
}

/** ยกเลิกเครื่องหมาย "รับเงินแล้ว" (กดผิด) — เจ้าของร้าน/แอดมิน */
export async function unsettleCod(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const o = await prisma.order.findUnique({ where: { orderNo }, select: { id: true, codSettledAt: true } });
  if (o?.codSettledAt) {
    await prisma.$transaction([
      prisma.order.update({ where: { id: o.id }, data: { codSettledAt: null } }),
      prisma.orderEvent.create({ data: { orderId: o.id, type: "NOTE", note: "ยกเลิกเครื่องหมายรับเงิน COD แล้ว", adminId: admin.id } }),
    ]);
    await logAdmin(admin.id, "ORDER", `ยกเลิกเครื่องหมายรับเงิน COD ${orderNo}`);
  }
  redirect(back(f, "/admin/orders/cod"));
}
