// คูปองส่วนลด (U2/A2) ฝั่งฐานข้อมูล — ตรวจ + ใช้คูปองใน transaction เดียวกับการบันทึกคำสั่งซื้อ
// กันใช้เกินจำนวนเมื่อมีคนกดพร้อมกัน: ล็อกแถวคูปอง (SELECT … FOR UPDATE) แล้วเพิ่ม usedCount แบบมีเงื่อนไข
// ลูกค้าย้อนกลับไปแก้คำสั่งซื้อเดิม = คืนสิทธิ์ของรอบก่อนแล้วคิดใหม่ · ยกเลิกก่อนชำระ = คืนสิทธิ์ (releaseCouponTx)
import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { couponMessage, evaluateCoupon, normCouponCode, type CouponLine, type CouponReason, type CouponRule } from "@/lib/coupon-calc";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

export class CouponError extends Error {
  constructor(readonly reason: CouponReason, message: string) {
    super(message);
  }
}

type CouponRow = CouponRule & { id: string; usageLimit: number | null; perPhoneLimit: number | null; usedCount: number };

const fail = (reason: CouponReason, c?: CouponRule): never => {
  throw new CouponError(reason, couponMessage(reason, c));
};

/** ตรวจจำนวนครั้ง (รวม/ต่อเบอร์) — ไม่นับการใช้ของคำสั่งซื้อนี้เอง (กรณีแก้คำสั่งซื้อเดิม) */
async function checkUsage(db: Tx | typeof prisma, c: CouponRow, phone: string, orderId: string | null) {
  const mine = orderId ? await db.couponRedemption.findUnique({ where: { orderId }, select: { couponId: true } }) : null;
  const usedByOthers = c.usedCount - (mine?.couponId === c.id ? 1 : 0);
  if (c.usageLimit != null && usedByOthers >= c.usageLimit) fail("used", c);
  if (c.perPhoneLimit != null && phone) {
    const n = await db.couponRedemption.count({ where: { couponId: c.id, phone, ...(orderId ? { orderId: { not: orderId } } : {}) } });
    if (n >= c.perPhoneLimit) fail("phoneUsed", c);
  }
}

/** ตรวจคูปองแบบไม่จอง (ใช้แสดงผลในหน้าชำระเงิน) — โยน CouponError เมื่อใช้ไม่ได้ */
export async function previewCoupon(codeRaw: unknown, lines: CouponLine[], phone: string, orderId: string | null = null) {
  const code = normCouponCode(codeRaw);
  if (!code) fail("format");
  const c = (await prisma.coupon.findUnique({ where: { code } })) as CouponRow | null;
  if (!c) return fail("notFound");
  const r = evaluateCoupon(c, lines);
  if (!r.ok) return fail(r.reason, c);
  await checkUsage(prisma, c, phone, orderId);
  return { code, discountSatang: r.discountSatang, eligibleSatang: r.eligibleSatang };
}

/** คืนสิทธิ์คูปองของคำสั่งซื้อ (แก้คำสั่งซื้อ/ยกเลิกก่อนชำระ) — คืนโค้ดที่คืนสิทธิ์ หรือ null */
export async function releaseCouponTx(tx: Tx, orderId: string) {
  const r = await tx.couponRedemption.findUnique({ where: { orderId }, include: { coupon: { select: { code: true } } } });
  if (!r) return null;
  await tx.$queryRaw`SELECT 1 FROM "Coupon" WHERE "id" = ${r.couponId} FOR UPDATE`;
  await tx.couponRedemption.delete({ where: { id: r.id } });
  await tx.coupon.updateMany({ where: { id: r.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
  return r.coupon.code;
}

/**
 * ใช้คูปองกับคำสั่งซื้อ (เรียกใน transaction ของการบันทึกคำสั่งซื้อ หลังสร้าง/แก้ Order แล้ว)
 * คืนส่วนลด (สตางค์) — โยน CouponError เมื่อใช้ไม่ได้ (transaction ทั้งก้อนย้อนกลับ)
 */
export async function redeemCouponTx(tx: Tx, input: { code: string; orderId: string; phone: string; lines: CouponLine[] }) {
  const code = normCouponCode(input.code);
  if (!code) fail("format");
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Coupon" WHERE "code" = ${code} FOR UPDATE`;
  if (!locked.length) fail("notFound");
  const c = (await tx.coupon.findUniqueOrThrow({ where: { id: locked[0].id } })) as CouponRow;
  const r = evaluateCoupon(c, input.lines);
  if (!r.ok) return fail(r.reason, c);
  // คืนสิทธิ์รอบก่อนของคำสั่งซื้อนี้ (ถ้ามี) แล้วตรวจจำนวนครั้งใหม่
  await releaseCouponTx(tx, input.orderId);
  const fresh = (await tx.coupon.findUniqueOrThrow({ where: { id: c.id } })) as CouponRow;
  await checkUsage(tx, fresh, input.phone, input.orderId);
  // เพิ่มจำนวนครั้งแบบมีเงื่อนไข (กันเกินแม้ล็อกหลุด)
  const bumped = await tx.coupon.updateMany({
    where: { id: c.id, ...(c.usageLimit != null ? { usedCount: { lt: c.usageLimit } } : {}) },
    data: { usedCount: { increment: 1 } },
  });
  if (bumped.count !== 1) fail("used", c);
  await tx.couponRedemption.create({ data: { couponId: c.id, orderId: input.orderId, phone: input.phone, discountSatang: r.discountSatang } });
  return { code, discountSatang: r.discountSatang };
}

// ---------- หลังบ้าน: รายงานการใช้ ----------

export async function couponUsage(couponId: string) {
  const rows = await prisma.couponRedemption.findMany({
    where: { couponId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { order: { select: { orderNo: true, status: true, customerName: true, totalSatang: true, subtotalSatang: true, createdAt: true } } },
  });
  return {
    rows,
    orders: rows.length,
    discountSatang: rows.reduce((s, r) => s + r.discountSatang, 0),
    salesSatang: rows.filter((r) => r.order.status === "PAID" || r.order.status === "SHIPPED").reduce((s, r) => s + r.order.totalSatang, 0),
  };
}
