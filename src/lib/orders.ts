// คำสั่งซื้อจากหน้าชำระเงิน: คำนวณยอดใหม่ฝั่ง server เสมอ (เงินเป็นสตางค์) ไม่เชื่อยอดจากเบราว์เซอร์
import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidThaiTaxId, phoneDigits } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { bankLabel, freeShipFrom, getSettings, parseBankAccounts, parseShippingTiers, shippingFee, shippingOptions } from "@/lib/settings";
import { PROVINCE_ZIP, isThaiPhone, normalizeProvince, zipMatchesProvince } from "@/lib/thai-address";
import { sniffImage, storage } from "@/lib/storage";

export const SLIP_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_QTY = 999;

/** ค่าตั้งร้านที่หน้าชำระเงินใช้ (บัญชี, PromptPay, ค่าส่งตามยอด) */
export async function getCheckoutConfig() {
  const s = await getSettings();
  return {
    banks: parseBankAccounts(s.bankAccounts).map((b) => ({ ...b, bankName: bankLabel(b.bank) })),
    promptpay: s.promptpayId && /\d{9,}/.test(s.promptpayId.replace(/\D/g, "")) ? s.promptpayId : null,
    promptpayName: s.promptpayName,
    shipping: shippingOptions(s),
    tiers: parseShippingTiers(s.shippingTiers),
    expressExtraSatang: s.expressEnabled ? s.expressExtraSatang : 0,
    checkWithin: s.slipCheckWithin,
    line: s.lineOaUrl && /^https?:\/\/\S+$/i.test(s.lineOaUrl) ? s.lineOaUrl : null,
    provinces: PROVINCE_ZIP,
  };
}

// ---------- ตรวจตะกร้ากับฐานข้อมูล (POST /api/cart/validate) ----------

export type CartLine = {
  id: string; // slug
  name: string;
  price: number; // บาท (ราคาปัจจุบัน)
  qty: number; // จำนวนหลังปรับ (0 = ต้องนำออก)
  wanted: number; // จำนวนที่ลูกค้าใส่มา
  maxQty: number | null; // นับสต็อก = จำนวนคงเหลือ
  img?: string;
  color: string;
  acc?: boolean;
  kit?: boolean;
  /** ok | price (ราคาเปลี่ยน) | qty (สต็อกไม่พอ ลดจำนวนให้) | out (ของหมด) | ask (ต้องสอบถามราคา) | gone (ปิดขาย/ไม่พบ) */
  status: "ok" | "price" | "qty" | "out" | "ask" | "gone";
  oldPrice?: number;
};

const SLUG_RE = /^[\w\u0E00-\u0E7F%.-]{1,120}$/;

/** ราคา/สต็อกปัจจุบันของสินค้าในตะกร้า + ค่าส่งโดยประมาณตามขั้นค่าส่งจริง (ส่งธรรมดา) */
export async function validateCart(items: unknown, seenPrices: unknown) {
  const raw = items && typeof items === "object" && !Array.isArray(items) ? (items as Record<string, unknown>) : {};
  const seen = seenPrices && typeof seenPrices === "object" && !Array.isArray(seenPrices) ? (seenPrices as Record<string, unknown>) : {};
  const wanted = Object.entries(raw)
    .map(([slug, q]) => [slug, Math.min(Math.max(0, Math.floor(Number(q) || 0)), MAX_QTY)] as const)
    .filter(([slug, q]) => SLUG_RE.test(slug) && q > 0)
    .slice(0, 50);
  const products = wanted.length
    ? await prisma.product.findMany({
        where: { slug: { in: wanted.map(([s]) => s) } },
        include: { category: { select: { isActive: true } } },
      })
    : [];
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const lines: CartLine[] = wanted.map(([slug, qty]) => {
    const p = bySlug.get(slug);
    if (!p || !p.isActive || p.isService || !p.category.isActive)
      return { id: slug, name: p?.name ?? "", price: 0, qty: 0, wanted: qty, maxQty: 0, color: "any", status: "gone" };
    const price = p.priceSatang / 100;
    const img = mediaUrl(p.images[0], "sm") ?? undefined;
    const base = {
      id: slug, name: p.name, price, wanted: qty, maxQty: p.trackStock ? Math.max(0, p.stock) : null, color: p.lightColor.toLowerCase(),
      ...(img ? { img } : {}), ...(p.isAccessory ? { acc: true } : {}), ...(p.includesPsu ? { kit: true } : {}),
    };
    if (p.priceSatang <= 0) return { ...base, qty: 0, status: "ask" };
    if (p.trackStock ? p.stock <= 0 : !p.inStock) return { ...base, qty: 0, status: "out" };
    if (p.trackStock && p.stock < qty) return { ...base, qty: p.stock, status: "qty" };
    const old = Number(seen[slug]);
    if (Number.isFinite(old) && old > 0 && Math.round(old * 100) !== p.priceSatang) return { ...base, qty, status: "price", oldPrice: old };
    return { ...base, qty, status: "ok" };
  });
  const s = await getSettings();
  const subtotalSatang = lines.reduce((sum, l) => sum + Math.round(l.price * 100) * l.qty, 0);
  const tiers = parseShippingTiers(s.shippingTiers);
  const free = freeShipFrom(tiers);
  return {
    lines,
    subtotal: subtotalSatang / 100,
    shipping: subtotalSatang > 0 ? shippingFee(s, "std", subtotalSatang) / 100 : 0,
    freeShipFrom: free != null ? free / 100 : null,
    tiers: tiers.map((t) => ({ min: t.minSatang / 100, fee: t.feeSatang / 100 })),
  };
}

// ---------- ตรวจข้อมูลจากฟอร์ม ----------

export type AddressInput = {
  name: string; phone: string; email: string; addr: string; sub: string; dist: string; prov: string; zip: string; note: string;
};

/** ขอใบกำกับภาษี/ใบเสร็จในนามบริษัทหรือบุคคล — เก็บใน Order.taxInvoice */
export type TaxInvoiceRequest = { kind: "COMPANY" | "PERSON"; name: string; taxId: string; branch: string; address: string };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
export { formatPhone, phoneDigits } from "@/lib/format";

/** ข้อความผิดของแต่ละช่อง (ภาษาไทย) — หน้าชำระเงินแสดงใต้ช่องนั้น */
export const FIELD_MESSAGES: Record<string, string> = {
  name: "กรุณากรอกชื่อ-นามสกุลผู้รับ",
  phone: "เบอร์โทรไม่ถูกต้อง — มือถือ 10 หลัก (เช่น 081-234-5678) หรือเบอร์บ้าน 9 หลัก (เช่น 02-123-4567)",
  email: "รูปแบบอีเมลไม่ถูกต้อง",
  addr: "กรุณากรอกบ้านเลขที่ และถนน/ซอย",
  sub: "กรุณากรอกแขวง/ตำบล",
  dist: "กรุณากรอกเขต/อำเภอ",
  prov: "กรุณาเลือกจังหวัดจากรายการ",
  zip: "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก",
  zipProv: "รหัสไปรษณีย์ไม่ตรงกับจังหวัดที่เลือก",
  tiName: "กรุณากรอกชื่อบริษัท หรือชื่อ-นามสกุลสำหรับออกใบกำกับภาษี",
  tiTaxId: "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (13 หลัก)",
  tiBranch: "กรุณาระบุสาขา เช่น สำนักงานใหญ่ หรือรหัสสาขา 5 หลัก",
  tiAddr: "กรุณากรอกที่อยู่สำหรับออกใบกำกับภาษี",
};

type Invalid = { ok: false; fields: string[]; messages: Record<string, string> };

/** ตรวจที่อยู่จัดส่ง — คืนชื่อช่องที่ไม่ผ่าน พร้อมข้อความภาษาไทย */
export function validateAddress(raw: Record<string, unknown>): { ok: true; value: AddressInput } | Invalid {
  const v: AddressInput = {
    name: text(raw.name, 120), phone: text(raw.phone, 20), email: text(raw.email, 160), addr: text(raw.addr, 300),
    sub: text(raw.sub, 120), dist: text(raw.dist, 120), prov: text(raw.prov, 120), zip: text(raw.zip, 5),
    note: typeof raw.note === "string" ? raw.note.trim().slice(0, 500) : "",
  };
  const messages: Record<string, string> = {};
  const bad = (f: string, key = f) => (messages[f] = FIELD_MESSAGES[key]);
  if (v.name.length < 2) bad("name");
  if (!isThaiPhone(phoneDigits(v.phone))) bad("phone");
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) bad("email");
  if (v.addr.length < 3) bad("addr");
  if (v.sub.length < 2) bad("sub");
  if (v.dist.length < 2) bad("dist");
  const prov = normalizeProvince(v.prov);
  if (!prov) bad("prov");
  else v.prov = prov;
  if (!/^\d{5}$/.test(v.zip)) bad("zip");
  else if (prov && !zipMatchesProvince(v.zip, prov)) bad("zip", "zipProv");
  const fields = Object.keys(messages);
  return fields.length ? { ok: false, fields, messages } : { ok: true, value: v };
}

/** ตรวจคำขอใบกำกับภาษี — null = ไม่ขอ */
export function validateTaxInvoice(raw: unknown): { ok: true; value: TaxInvoiceRequest | null } | Invalid {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: true, value: null };
  const r = raw as Record<string, unknown>;
  const kind = r.kind === "PERSON" ? "PERSON" : "COMPANY";
  const branchRaw = text(r.branch, 60);
  const v: TaxInvoiceRequest = {
    kind,
    name: text(r.name, 160),
    taxId: phoneDigits(text(r.taxId, 20)),
    // บุคคลธรรมดาไม่มีสาขา · บริษัท: "สำนักงานใหญ่" หรือ "สาขาที่ 00001"
    branch: kind === "PERSON" ? "" : /^\d{1,5}$/.test(branchRaw) ? `สาขาที่ ${branchRaw.padStart(5, "0")}` : branchRaw || "สำนักงานใหญ่",
    address: typeof r.address === "string" ? r.address.trim().replace(/\s+/g, " ").slice(0, 400) : "",
  };
  const messages: Record<string, string> = {};
  if (v.name.length < 2) messages.tiName = FIELD_MESSAGES.tiName;
  if (!isValidThaiTaxId(v.taxId)) messages.tiTaxId = FIELD_MESSAGES.tiTaxId;
  if (kind === "COMPANY" && v.branch.length < 3) messages.tiBranch = FIELD_MESSAGES.tiBranch;
  if (v.address.length < 10) messages.tiAddr = FIELD_MESSAGES.tiAddr;
  const fields = Object.keys(messages);
  return fields.length ? { ok: false, fields, messages } : { ok: true, value: v };
}

/** อ่าน Order.taxInvoice กลับเป็นข้อมูลที่ใช้ได้ (หลังบ้าน/ออกใบเสร็จ) — null = ลูกค้าไม่ได้ขอ */
export function parseTaxInvoice(v: unknown): TaxInvoiceRequest | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  if (!s("name") || !s("taxId")) return null;
  return { kind: r.kind === "PERSON" ? "PERSON" : "COMPANY", name: s("name"), taxId: s("taxId"), branch: s("branch"), address: s("address") };
}

export class OrderError extends Error {
  constructor(message: string, readonly status = 400, readonly fields?: string[], readonly messages?: Record<string, string>) {
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
  taxInvoice?: unknown;
  orderNo?: unknown;
}): Promise<OrderSummary> {
  const addr = validateAddress(input.address);
  const ti = validateTaxInvoice(input.taxInvoice);
  if (!addr.ok || !ti.ok) {
    const fields = [...(addr.ok ? [] : addr.fields), ...(ti.ok ? [] : ti.fields)];
    const messages = { ...(addr.ok ? {} : addr.messages), ...(ti.ok ? {} : ti.messages) };
    throw new OrderError(messages[fields[0]] ?? "กรุณากรอกข้อมูลให้ครบถ้วน", 400, fields, messages);
  }

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
  for (const [slug, qty] of wanted) {
    const p = bySlug.get(slug)!;
    if (p.priceSatang <= 0) throw new OrderError(`"${p.name}" ต้องสอบถามราคาก่อนสั่งซื้อ กรุณาติดต่อร้านทาง LINE`, 409);
    if (p.trackStock ? p.stock < qty : !p.inStock)
      throw new OrderError(p.trackStock && p.stock > 0 ? `"${p.name}" เหลือเพียง ${p.stock} ชิ้น กรุณาแก้จำนวนในตะกร้า` : `"${p.name}" สินค้าหมด กรุณานำออกจากตะกร้า`, 409);
  }
  const items = wanted.map(([slug, qty]) => {
    const p = bySlug.get(slug)!;
    return { productId: p.id, nameSnapshot: p.name, priceSatang: p.priceSatang, qty };
  });

  const settings = await getSettings();
  const opts = shippingOptions(settings);
  const ship = opts.find((s) => s.id === input.shipping) ?? opts[0];
  const subtotalSatang = items.reduce((s, i) => s + i.priceSatang * i.qty, 0);
  const shippingSatang = shippingFee(settings, ship.id, subtotalSatang);
  const totalSatang = subtotalSatang + shippingSatang;

  const a = addr.value;
  const data = {
    // เก็บเบอร์เป็นตัวเลขล้วน (ค้นหาได้ทั้งแบบมี/ไม่มีขีด) แล้วจัดรูปแบบตอนแสดงผล
    customerName: a.name, phone: phoneDigits(a.phone), email: a.email || null, addressLine: a.addr, subdistrict: a.sub,
    district: a.dist, province: a.prov, postalCode: a.zip, note: a.note || null,
    subtotalSatang, shippingMethod: ship.id, shippingName: ship.name, shippingSatang, totalSatang,
    taxInvoice: ti.value ?? Prisma.DbNull,
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
