"use server";
// ค้นหาคำสั่งซื้อด้วย "เลขที่คำสั่งซื้อ + เบอร์โทร" (ยังไม่มีระบบสมาชิก)
// ต้องตรงทั้งสองค่าจึงแสดงผล และจำกัดจำนวนครั้งต่อ IP กันการสุ่มเดาเลขที่
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

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
  rejectReason: string | null;
  events: { type: string; at: string }[];
};
export type TrackState = { error?: string; order?: TrackedOrder; orderNo?: string; phone?: string };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 10;
// TODO: ตอนมีหลายเครื่อง/serverless ให้ย้ายตัวนับไปเก็บใน DB หรือ Redis
const tries = new Map<string, { n: number; since: number }>();

function throttled(key: string) {
  const now = Date.now();
  const t = tries.get(key);
  if (!t || now - t.since > WINDOW_MS) {
    tries.set(key, { n: 1, since: now });
    return false;
  }
  t.n += 1;
  return t.n > MAX_TRIES;
}

const digits = (s: string) => s.replace(/\D/g, "");

export async function trackOrder(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const orderNo = String(formData.get("orderNo") ?? "").trim().toUpperCase().slice(0, 40);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 20);
  if (!orderNo || digits(phone).length < 9) {
    return { error: "กรอกเลขที่คำสั่งซื้อ และเบอร์โทรที่ใช้สั่งซื้อให้ครบ", orderNo, phone };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  if (throttled(ip)) {
    return { error: "ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ หรือติดต่อร้านทาง LINE", orderNo, phone };
  }

  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      items: { orderBy: { id: "asc" } },
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
      rejectReason: order.status === "REJECTED" ? order.rejectReason : null,
      events: order.events.filter((e) => e.type !== "NOTE").map((e) => ({ type: e.type, at: e.createdAt.toISOString() })),
    },
  };
}
