// ยืนยันการรับเงินของคำสั่งซื้อ — จุดเดียวที่เปลี่ยนคำสั่งซื้อเป็น "ชำระแล้ว"
// ใช้ร่วมกัน: อนุมัติสลิป, บันทึกรับชำระเอง, คำสั่งซื้อหลังร้านแบบชำระแล้ว, ยืนยัน COD,
// และใบแจ้งหนี้ที่ออกจากคำสั่งซื้อเมื่อรับชำระครบ (src/lib/doc-payments.ts)
// ภายใน transaction เดียว: สถานะ PAID + paidAt · อนุมัติสลิปที่รอตรวจ · OrderEvent · ผูกลูกค้า · บันทึกต้นทุนต่อชิ้น ณ วันขาย · ตัดสต็อก (SALE)
// คูปองที่ใช้ยังคงอยู่ (ไม่คืนสิทธิ์) · อีเมล/LINE/ล้างแคชหน้าร้าน ทำหลังตอบผู้ใช้ด้วย afterOrderPaid()
import "server-only";
import { after } from "next/server";
import type { OrderEventType, OrderStatus, Prisma } from "../../generated/prisma/client";
import { refreshStorefront } from "@/lib/admin-log";
import { sendOrderEmail } from "@/lib/email";
import { linkOrderCustomer } from "@/lib/order-customer";
import { alertLowStock, moveStock, type StockResult } from "@/lib/stock";

type Tx = Prisma.TransactionClient;

/** สถานะที่ยังไม่ได้รับเงิน → ยืนยันชำระได้ */
export const UNPAID_STATUSES: OrderStatus[] = ["AWAITING_SLIP", "PENDING_VERIFICATION", "REJECTED"];

export type ConfirmInput = {
  /** ระบุอย่างใดอย่างหนึ่ง */
  orderId?: string;
  orderNo?: string;
  from: OrderStatus[];
  adminId: string | null;
  note: string;
  event?: OrderEventType; // ค่าเริ่มต้น APPROVED
  stockNote?: string;
  /** เงื่อนไขเพิ่ม เช่น paymentMethod: "COD" */
  where?: Prisma.OrderWhereInput;
};
export type ConfirmResult = { orderId: string; orderNo: string; moves: StockResult[] };

export async function confirmOrderPaidTx(tx: Tx, input: ConfirmInput): Promise<ConfirmResult | null> {
  const o = input.orderId
    ? await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true, orderNo: true } })
    : input.orderNo
      ? await tx.order.findUnique({ where: { orderNo: input.orderNo }, select: { id: true, orderNo: true } })
      : null;
  if (!o) return null;
  const r = await tx.order.updateMany({
    where: { ...(input.where ?? {}), id: o.id, status: { in: input.from } },
    data: { status: "PAID", paidAt: new Date(), rejectReason: null },
  });
  if (r.count !== 1) return null;
  // ลูกค้าแนบได้หลายสลิป → อนุมัติทุกสลิปที่รอตรวจ
  await tx.paymentSlip.updateMany({ where: { orderId: o.id, status: "PENDING" }, data: { status: "ACCEPTED" } });
  await tx.orderEvent.create({ data: { orderId: o.id, type: input.event ?? "APPROVED", note: input.note.slice(0, 1000), adminId: input.adminId } });
  // ลูกค้า: ผูกกับรายชื่อลูกค้า (กลุ่มลูกค้า/ยอดซื้อรวม/บรอดแคสต์)
  await linkOrderCustomer(tx, o.id);
  // ต้นทุนต่อชิ้น ณ วันที่ขาย (รายงานกำไรย้อนหลังไม่เปลี่ยนตามต้นทุนใหม่) — ไม่ทับค่าที่บันทึกไว้แล้ว
  await tx.$executeRaw`
    UPDATE "OrderItem" AS oi SET "costSatang" = p."costSatang"
    FROM "Product" AS p
    WHERE oi."orderId" = ${o.id} AND oi."productId" = p."id" AND oi."costSatang" IS NULL AND p."costSatang" IS NOT NULL`;
  const items = await tx.orderItem.findMany({ where: { orderId: o.id, productId: { not: null } }, select: { productId: true, qty: true } });
  const moves = await moveStock(tx, items.map((i) => ({ productId: i.productId!, delta: -i.qty })), {
    reason: "SALE", ref: o.orderNo, adminId: input.adminId, note: input.stockNote ?? "ตัดสต็อกเมื่อยืนยันการชำระเงิน",
  });
  return { orderId: o.id, orderNo: o.orderNo, moves };
}

/**
 * หลัง transaction สำเร็จ (เรียกใน server action / route handler): ล้างแคชหน้าร้านเมื่อสต็อกเปลี่ยน
 * + แจ้ง LINE สินค้าใกล้หมด + อีเมลยืนยันการชำระ (หลังตอบผู้ใช้แล้ว ไม่กระทบงานหลัก)
 */
export function afterOrderPaid(r: ConfirmResult | null | undefined, opts: { email?: boolean } = {}) {
  if (!r) return;
  if (r.moves.length) refreshStorefront();
  after(async () => {
    await alertLowStock(r.moves, r.orderNo);
    if (opts.email !== false) await sendOrderEmail(r.orderNo, "PAID");
  });
}
