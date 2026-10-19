"use server";
// การดำเนินการกับคำสั่งซื้อในหลังบ้าน — ทุก action ตรวจ session และตรวจสถานะปัจจุบันก่อนเปลี่ยน
// (updateMany + where status = สถานะที่คาดไว้ กันแอดมินสองคนกดพร้อมกัน)
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { CARRIERS, REJECT_REASONS, nextPending } from "@/lib/admin-orders";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "../../../../generated/prisma/client";

const str = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

/** query string กลับไปหน้าเดิม — รับเฉพาะรูปแบบ ?a=b&c=d กัน redirect ไปเว็บอื่น */
function backTo(f: FormData, patch: Record<string, string | null> = {}) {
  const raw = str(f, "ret", 500);
  const qs = new URLSearchParams(/^\?[\w=&%.+\-]*$/.test(raw) ? raw.slice(1) : "");
  qs.delete("mode");
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) qs.delete(k);
    else qs.set(k, v);
  }
  const s = qs.toString();
  return `/admin${s ? `?${s}` : ""}`;
}

async function transition(orderNo: string, from: OrderStatus[], data: Parameters<typeof prisma.order.updateMany>[0]["data"]) {
  const r = await prisma.order.updateMany({ where: { orderNo, status: { in: from } }, data });
  return r.count === 1;
}

async function orderId(orderNo: string) {
  return (await prisma.order.findUniqueOrThrow({ where: { orderNo }, select: { id: true } })).id;
}

export async function approveOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  if (await transition(orderNo, ["PENDING_VERIFICATION"], { status: "PAID", paidAt: new Date(), rejectReason: null })) {
    const id = await orderId(orderNo);
    const slip = await prisma.paymentSlip.findFirst({ where: { orderId: id }, orderBy: { uploadedAt: "desc" } });
    await prisma.$transaction([
      ...(slip ? [prisma.paymentSlip.update({ where: { id: slip.id }, data: { status: "ACCEPTED" } })] : []),
      prisma.orderEvent.create({ data: { orderId: id, type: "APPROVED", note: "ยืนยันการชำระเงิน", adminId: admin.id } }),
    ]);
  }
  // ไปคำสั่งซื้อที่รอตรวจถัดไปอัตโนมัติ (ลดคลิกตอนเคลียร์คิว)
  const next = await nextPending(orderNo);
  redirect(backTo(f, { open: next ?? orderNo, done: next ? null : "1" }));
}

export async function rejectOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const reason = REJECT_REASONS.includes(str(f, "reason", 100)) ? str(f, "reason", 100) : REJECT_REASONS.at(-1)!;
  const extra = str(f, "note", 300);
  const full = reason + (extra ? ` — ${extra}` : "");
  if (await transition(orderNo, ["PENDING_VERIFICATION"], { status: "REJECTED", rejectReason: full })) {
    const id = await orderId(orderNo);
    const slip = await prisma.paymentSlip.findFirst({ where: { orderId: id }, orderBy: { uploadedAt: "desc" } });
    await prisma.$transaction([
      ...(slip ? [prisma.paymentSlip.update({ where: { id: slip.id }, data: { status: "REJECTED" } })] : []),
      prisma.orderEvent.create({ data: { orderId: id, type: "REJECTED", note: full, adminId: admin.id } }),
    ]);
  }
  const next = await nextPending(orderNo);
  redirect(backTo(f, { open: next ?? orderNo, done: next ? null : "1" }));
}

export async function reopenOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const id = await orderId(orderNo);
  const slip = await prisma.paymentSlip.findFirst({ where: { orderId: id }, orderBy: { uploadedAt: "desc" } });
  if (slip && (await transition(orderNo, ["REJECTED"], { status: "PENDING_VERIFICATION", rejectReason: null }))) {
    await prisma.$transaction([
      prisma.paymentSlip.update({ where: { id: slip.id }, data: { status: "PENDING" } }),
      prisma.orderEvent.create({ data: { orderId: id, type: "REOPENED", note: "กลับมาตรวจสลิปอีกครั้ง", adminId: admin.id } }),
    ]);
  }
  redirect(backTo(f, { open: orderNo }));
}

export async function shipOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const carrier = CARRIERS.includes(str(f, "carrier", 60)) ? str(f, "carrier", 60) : CARRIERS[0];
  const trackingNo = str(f, "trackingNo", 40).toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{6,40}$/.test(trackingNo)) redirect(backTo(f, { open: orderNo, err: "tracking" }));
  if (await transition(orderNo, ["PAID"], { status: "SHIPPED", carrier, trackingNo, shippedAt: new Date() })) {
    await prisma.orderEvent.create({
      data: { orderId: await orderId(orderNo), type: "SHIPPED", note: `${carrier} · ${trackingNo}`, adminId: admin.id },
    });
  }
  redirect(backTo(f, { open: orderNo, err: null }));
}

export async function cancelOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  if (await transition(orderNo, ["AWAITING_SLIP", "REJECTED"], { status: "CANCELLED" })) {
    await prisma.orderEvent.create({
      data: { orderId: await orderId(orderNo), type: "CANCELLED", note: str(f, "note", 300) || "ยกเลิกคำสั่งซื้อ", adminId: admin.id },
    });
  }
  redirect(backTo(f, { open: orderNo }));
}

/** โน้ตภายใน — ลูกค้าไม่เห็น (หน้าติดตามคำสั่งซื้อไม่แสดง event ชนิด NOTE) */
export async function addOrderNote(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const text = str(f, "text", 500);
  if (text) await prisma.orderEvent.create({ data: { orderId: await orderId(orderNo), type: "NOTE", note: text, adminId: admin.id } });
  redirect(backTo(f, { open: orderNo }));
}
