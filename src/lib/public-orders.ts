// ใบสั่งซื้อฝั่งลูกค้า (U24): /track/order/:orderNo?t=<publicToken> — โทเคนสุ่ม 32 ไบต์ สร้างตอนสั่งซื้อ
// โทเคนไม่ตรง/ไม่มี = 404 (ไม่บอกว่าคำสั่งซื้อมีจริง) · เทียบแบบเวลาคงที่
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export async function getPublicOrder(orderNo: string, token: string | undefined) {
  if (!token || !TOKEN_RE.test(token) || orderNo.length > 40) return null;
  const o = await prisma.order.findUnique({
    where: { orderNo: orderNo.toUpperCase() },
    include: { items: { orderBy: { id: "asc" }, include: { product: { select: { sku: true, unit: true } } } } },
  });
  if (!o?.publicToken) return null;
  const a = Buffer.from(o.publicToken), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return o;
}
