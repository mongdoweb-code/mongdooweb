// คำสั่งซื้อจากหน้าชำระเงิน: คำนวณยอดใหม่ฝั่ง server เสมอ (เงินเป็นสตางค์) ไม่เชื่อยอดจากเบราว์เซอร์
import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sniffImage, storage } from "@/lib/storage";

export const SLIP_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_QTY = 999;

export type ShippingOption = { id: "std" | "express"; name: string; desc: string; satang: number };

/** ค่าตั้งร้านที่หน้าชำระเงินใช้ (บัญชี, PromptPay, ค่าส่ง, ส่งฟรี) */
export async function getCheckoutConfig() {
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" } });
  if (!s) throw new Error("ยังไม่ได้ตั้งค่าร้าน (รัน npm run db:seed)");
  const shipping: ShippingOption[] = [
    { id: "std", name: "ส่งธรรมดา", desc: "ได้รับภายใน 2–3 วันทำการ", satang: s.shippingStdSatang },
    { id: "express", name: "ส่งด่วน", desc: "ได้รับภายใน 1–2 วันทำการ", satang: s.shippingExpSatang },
  ];
  return {
    bank: { name: s.bankName, account: s.bankAccount, holder: s.bankHolder },
    promptpay: s.promptpayId && /\d{9,}/.test(s.promptpayId.replace(/\D/g, "")) ? s.promptpayId : null,
    promptpayName: s.promptpayName,
    shipping,
    freeShipMinSatang: s.freeShipMinSatang,
    checkWithin: s.slipCheckWithin,
    line: s.lineOaUrl && /^https?:\/\/\S+$/i.test(s.lineOaUrl) ? s.lineOaUrl : null,
  };
}

// ---------- ตรวจข้อมูลจากฟอร์ม ----------

export type AddressInput = {
  name: string; phone: string; email: string; addr: string; sub: string; dist: string; prov: string; zip: string; note: string;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const phoneDigits = (s: string) => s.replace(/\D/g, "");
/** 0801112222 → 080-111-2222 */
export const formatPhone = (s: string) => {
  const d = phoneDigits(s);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : s;
};

/** กฎเดียวกับฟอร์มในต้นแบบ — คืนชื่อช่องที่ไม่ผ่าน */
export function validateAddress(raw: Record<string, unknown>): { ok: true; value: AddressInput } | { ok: false; fields: string[] } {
  const v: AddressInput = {
    name: text(raw.name, 120), phone: text(raw.phone, 20), email: text(raw.email, 160), addr: text(raw.addr, 300),
    sub: text(raw.sub, 120), dist: text(raw.dist, 120), prov: text(raw.prov, 120), zip: text(raw.zip, 5), note: text(raw.note, 500),
  };
  const bad: string[] = [];
  if (v.name.length < 2) bad.push("name");
  if (!/^0\d{9}$/.test(phoneDigits(v.phone))) bad.push("phone");
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) bad.push("email");
  if (v.addr.length < 3) bad.push("addr");
  if (v.sub.length < 2) bad.push("sub");
  if (v.dist.length < 2) bad.push("dist");
  if (v.prov.length < 2) bad.push("prov");
  if (!/^\d{5}$/.test(v.zip)) bad.push("zip");
  return bad.length ? { ok: false, fields: bad } : { ok: true, value: v };
}

export class OrderError extends Error {
  constructor(message: string, readonly status = 400, readonly fields?: string[]) {
    super(message);
  }
}

// ---------- เลขที่คำสั่งซื้อ: MDW-YYMMDD-NNNN (วันที่ตามเวลาไทย, เลขสุ่ม 4 หลัก) ----------

function makeOrderNo(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "2-digit", month: "2-digit", day: "2-digit" })
    .format(now)
    .replace(/-/g, "");
  return `MDW-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ---------- สร้าง/แก้คำสั่งซื้อ (ขั้นที่ 1 → 2 ของหน้าชำระเงิน) ----------

export type OrderSummary = {
  orderNo: string;
  subtotalSatang: number;
  shippingSatang: number;
  totalSatang: number;
  shippingName: string;
};

export async function saveCheckoutOrder(input: {
  items: unknown;
  shipping: unknown;
  address: Record<string, unknown>;
  orderNo?: unknown;
}): Promise<OrderSummary> {
  const addr = validateAddress(input.address);
  if (!addr.ok) throw new OrderError("กรุณากรอกข้อมูลให้ครบถ้วน", 400, addr.fields);

  // ตะกร้า: { slug: qty } → ดึงราคาปัจจุบันจากฐานข้อมูล
  const raw = input.items && typeof input.items === "object" && !Array.isArray(input.items) ? (input.items as Record<string, unknown>) : {};
  const wanted = Object.entries(raw)
    .map(([slug, q]) => [slug, Math.min(Math.floor(Number(q)), MAX_QTY)] as const)
    .filter(([slug, q]) => typeof slug === "string" && slug.length <= 120 && q > 0)
    .slice(0, 50);
  if (!wanted.length) throw new OrderError("ตะกร้าว่าง กรุณาเลือกสินค้าก่อน");
  const products = await prisma.product.findMany({
    where: { slug: { in: wanted.map(([s]) => s) }, isActive: true, isService: false, category: { isActive: true } },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const missing = wanted.filter(([s]) => !bySlug.has(s));
  if (missing.length) throw new OrderError("สินค้าบางรายการในตะกร้าไม่มีจำหน่ายแล้ว กรุณากลับไปแก้ตะกร้า", 409);
  const items = wanted.map(([slug, qty]) => {
    const p = bySlug.get(slug)!;
    return { productId: p.id, nameSnapshot: p.name, priceSatang: p.priceSatang, qty };
  });

  const cfg = await getCheckoutConfig();
  const ship = cfg.shipping.find((s) => s.id === input.shipping) ?? cfg.shipping[0];
  const subtotalSatang = items.reduce((s, i) => s + i.priceSatang * i.qty, 0);
  const free = ship.id === "std" && cfg.freeShipMinSatang != null && cfg.freeShipMinSatang > 0 && subtotalSatang >= cfg.freeShipMinSatang;
  const shippingSatang = free ? 0 : ship.satang;
  const totalSatang = subtotalSatang + shippingSatang;

  const a = addr.value;
  const data = {
    // เก็บเบอร์เป็นตัวเลขล้วน (ค้นหาได้ทั้งแบบมี/ไม่มีขีด) แล้วจัดรูปแบบตอนแสดงผล
    customerName: a.name, phone: phoneDigits(a.phone), email: a.email || null, addressLine: a.addr, subdistrict: a.sub,
    district: a.dist, province: a.prov, postalCode: a.zip, note: a.note || null,
    subtotalSatang, shippingMethod: ship.id, shippingName: ship.name, shippingSatang, totalSatang,
  };
  const summary = (orderNo: string): OrderSummary => ({ orderNo, subtotalSatang, shippingSatang, totalSatang, shippingName: ship.name });

  // ลูกค้าย้อนกลับไปแก้ข้อมูล: แก้คำสั่งซื้อเดิมได้เฉพาะตอนยังไม่แนบสลิป และเบอร์โทรเดิมต้องตรง
  if (typeof input.orderNo === "string" && input.orderNo) {
    const old = await prisma.order.findUnique({ where: { orderNo: input.orderNo } });
    if (old && old.status === "AWAITING_SLIP" && phoneDigits(old.phone) === phoneDigits(a.phone)) {
      await prisma.$transaction([
        prisma.orderItem.deleteMany({ where: { orderId: old.id } }),
        prisma.order.update({ where: { id: old.id }, data: { ...data, items: { create: items } } }),
      ]);
      return summary(old.orderNo);
    }
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const orderNo = makeOrderNo();
    try {
      await prisma.order.create({
        data: { ...data, orderNo, status: "AWAITING_SLIP", items: { create: items }, events: { create: { type: "CREATED", note: "สั่งซื้อจากหน้าเว็บ" } } },
      });
      return summary(orderNo);
    } catch (e) {
      // เลขที่ซ้ำ (สุ่มชน) → สุ่มใหม่
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new OrderError("สร้างเลขที่คำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่", 503);
}

// ---------- แนบสลิป (ขั้นที่ 3 หรือแนบใหม่จากหน้าติดตามคำสั่งซื้อ) ----------

export async function attachSlip(input: {
  orderNo: string;
  phone: string;
  file: File | null;
  paidAt: string;
  amount: string;
}) {
  const order = await prisma.order.findUnique({ where: { orderNo: input.orderNo.trim().toUpperCase() } });
  // ข้อความเดียวกันทั้งไม่พบเลขที่/เบอร์ไม่ตรง — ไม่บอกใบ้ว่าเลขที่มีอยู่จริง
  if (!order || phoneDigits(order.phone) !== phoneDigits(input.phone)) throw new OrderError("ไม่พบคำสั่งซื้อ ตรวจเลขที่และเบอร์โทรอีกครั้ง", 404);
  if (order.status !== "AWAITING_SLIP" && order.status !== "REJECTED")
    throw new OrderError("คำสั่งซื้อนี้แนบสลิปแล้ว หากต้องการแก้ไขกรุณาติดต่อร้านทาง LINE", 409);

  const f = input.file;
  if (!f || typeof f === "string" || f.size === 0) throw new OrderError("กรุณาแนบสลิปการโอน", 400, ["slip"]);
  if (f.size > SLIP_MAX_BYTES) throw new OrderError("ไฟล์ใหญ่เกิน 5 MB กรุณาเลือกไฟล์ใหม่", 400, ["slip"]);
  const buf = Buffer.from(await f.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw new OrderError("รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP", 400, ["slip"]);

  // วัน-เวลาโอนที่ลูกค้ากรอกเป็นเวลาไทย (YYYY-MM-DDTHH:mm)
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(input.paidAt);
  const transferredAt = m ? new Date(`${m[1]}T${m[2]}:00+07:00`) : null;
  if (!transferredAt || isNaN(transferredAt.getTime()) || transferredAt.getTime() > Date.now() + 10 * 60e3)
    throw new OrderError("กรุณาระบุวันและเวลาที่โอนให้ถูกต้อง", 400, ["paidAt"]);
  const amount = Number(String(input.amount).replace(/[,\s฿]/g, ""));
  if (!(amount > 0) || amount > 10_000_000) throw new OrderError("กรุณากรอกยอดที่โอน", 400, ["paidAmt"]);

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const now = new Date();
  const key = `slips/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${order.orderNo.toLowerCase()}-${sha256.slice(0, 16)}-${Date.now()}.${kind.ext}`;
  await storage().put(key, buf);

  // สลิปซ้ำ: ไม่บล็อก แต่ติดธงให้แอดมินตัดสินในหน้าตรวจสลิป
  await prisma.$transaction([
    prisma.paymentSlip.create({
      data: { orderId: order.id, storageKey: key, mimeType: kind.mime, sizeBytes: buf.length, sha256, declaredAmountSatang: Math.round(amount * 100), transferredAt },
    }),
    prisma.order.update({ where: { id: order.id }, data: { status: "PENDING_VERIFICATION", rejectReason: null } }),
    prisma.orderEvent.create({
      data: { orderId: order.id, type: "SLIP_UPLOADED", note: order.status === "REJECTED" ? "ลูกค้าแนบสลิปใหม่" : "ลูกค้าแนบสลิป" },
    }),
  ]);
  return { orderNo: order.orderNo, totalSatang: order.totalSatang };
}
