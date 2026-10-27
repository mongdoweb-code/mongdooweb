"use server";
// ค้นหาคำสั่งซื้อด้วย "เลขที่คำสั่งซื้อ + เบอร์โทร" (ยังไม่มีระบบสมาชิก)
// ต้องตรงทั้งสองค่าจึงแสดงผล และจำกัดจำนวนครั้งต่อ IP กันการสุ่มเดาเลขที่
import { after } from "next/server";
import { carrierTrackUrl } from "@/lib/carriers";
import { claimsOfOrder } from "@/lib/claims";
import { notifyCustomerCancel } from "@/lib/order-notify";
import { CUSTOMER_CANCEL_REASONS, OrderError, canCustomerCancel, cancelByCustomer, orderPrintUrl, slipTotals } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { orderReceiptLinks } from "@/lib/public-docs";
import { clientIp, overLimit } from "@/lib/rate-limit";

export type TrackedOrder = {
  orderNo: string;
  status: string;
  createdAt: string;
  items: { name: string; qty: number; lineBaht: number }[];
  shippingName: string;
  shippingBaht: number;
  totalBaht: number;
  carrier: string | null;
  trackingNo: string | null;
  trackUrl: string | null;
  shippedAt: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  taxInvoice: boolean;
  receipts: { docNo: string; issueDate: string | null; amountBaht: number; url: string }[];
  events: { type: string; at: string }[];
  // รอบ 3
  subtotalBaht: number;
  discountBaht: number;
  couponCode: string | null;
  codFeeBaht: number;
  remoteFeeBaht: number;
  paymentMethod: "TRANSFER" | "COD";
  pickup: boolean;
  printUrl: string | null;
  canCancel: boolean;
  canClaim: boolean;
  slips: { count: number; sumBaht: number };
  claims: Awaited<ReturnType<typeof claimsOfOrder>>;
};
export type TrackState = { error?: string; order?: TrackedOrder; orderNo?: string; phone?: string };

const digits = (s: string) => s.replace(/\D/g, "");

export async function trackOrder(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const orderNo = String(formData.get("orderNo") ?? "").trim().toUpperCase().slice(0, 40);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 20);
  if (!orderNo || digits(phone).length < 9) {
    return { error: "กรอกเลขที่คำสั่งซื้อ และเบอร์โทรที่ใช้สั่งซื้อให้ครบ", orderNo, phone };
  }

  if (overLimit(`track:${await clientIp()}`, 10, 10 * 60e3)) {
    return { error: "ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ หรือติดต่อร้านทาง LINE", orderNo, phone };
  }

  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      items: { orderBy: { id: "asc" } },
      slips: { select: { declaredAmountSatang: true, status: true } },
      events: { orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true } },
    },
  });
  // ข้อความเดียวกันทั้งกรณีไม่พบเลขที่และเบอร์ไม่ตรง — ไม่บอกใบ้ว่าเลขที่มีอยู่จริง
  if (!order || digits(order.phone) !== digits(phone)) {
    return { error: "ไม่พบคำสั่งซื้อ ตรวจเลขที่คำสั่งซื้อและเบอร์โทรอีกครั้ง", orderNo, phone };
  }

  return {
    orderNo,
    phone,
    order: {
      orderNo: order.orderNo,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((i) => ({ name: i.nameSnapshot, qty: i.qty, lineBaht: (i.priceSatang * i.qty) / 100 })),
      shippingName: order.shippingName,
      shippingBaht: order.shippingSatang / 100,
      totalBaht: order.totalSatang / 100,
      carrier: order.carrier,
      trackingNo: order.trackingNo,
      trackUrl: carrierTrackUrl(order.carrier, order.trackingNo),
      shippedAt: order.shippedAt?.toISOString() ?? null,
      cancelReason: order.status === "CANCELLED" ? order.cancelReason : null,
      taxInvoice: !!order.taxInvoice,
      // ใบเสร็จที่ร้านออกแล้ว → ลิงก์ลับสำหรับดู/พิมพ์ (สร้างโทเคนเมื่อเปิดครั้งแรก)
      receipts: (await orderReceiptLinks(order.id)).map((r) => ({ docNo: r.docNo, issueDate: r.issueDate, amountBaht: r.grandSatang / 100, url: r.url })),
      rejectReason: order.status === "REJECTED" ? order.rejectReason : null,
      events: order.events.filter((e) => e.type !== "NOTE").map((e) => ({ type: e.type, at: e.createdAt.toISOString() })),
      subtotalBaht: order.subtotalSatang / 100,
      discountBaht: order.discountSatang / 100,
      couponCode: order.couponCode,
      codFeeBaht: order.codFeeSatang / 100,
      remoteFeeBaht: order.remoteFeeSatang / 100,
      paymentMethod: order.paymentMethod,
      pickup: order.shippingMethod === "pickup",
      printUrl: orderPrintUrl(order.orderNo, order.publicToken),
      canCancel: canCustomerCancel(order),
      canClaim: order.status === "PAID" || order.status === "SHIPPED",
      slips: (({ count, sumSatang }) => ({ count, sumBaht: sumSatang / 100 }))(slipTotals(order.slips)),
      claims: await claimsOfOrder(order.id),
    },
  };
}

// ---------- ลูกค้ายกเลิกคำสั่งซื้อเอง (U18) — ยืนยันด้วยเลขที่ + เบอร์โทรอีกครั้งที่ server ----------

export type CancelState = { error?: string; ok?: string };
export async function cancelMyOrder(_prev: CancelState, formData: FormData): Promise<CancelState> {
  if (overLimit(`track-cancel:${await clientIp()}`, 10, 10 * 60e3)) return { error: "ทำรายการบ่อยเกินไป กรุณารอสักครู่ หรือติดต่อร้านทาง LINE" };
  const reason = String(formData.get("reason") ?? "");
  if (!CUSTOMER_CANCEL_REASONS.includes(reason)) return { error: "กรุณาเลือกเหตุผลที่ยกเลิก" };
  try {
    const r = await cancelByCustomer({
      orderNo: String(formData.get("orderNo") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      reason,
      note: String(formData.get("note") ?? "").slice(0, 200),
    });
    after(() => notifyCustomerCancel(r));
    return { ok: `ยกเลิกคำสั่งซื้อ ${r.orderNo} แล้ว` };
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    throw e;
  }
}
