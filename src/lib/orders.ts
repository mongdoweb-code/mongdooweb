// คำสั่งซื้อจากหน้าชำระเงิน: คำนวณยอดใหม่ฝั่ง server เสมอ (เงินเป็นสตางค์) ไม่เชื่อยอดจากเบราว์เซอร์
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma, type OrderStatus } from "../../generated/prisma/client";
import { CouponError, previewCoupon, redeemCouponTx, releaseCouponTx } from "@/lib/coupons";
import { prisma } from "@/lib/prisma";
import { isValidThaiTaxId, phoneDigits } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { unitPriceSatang } from "@/lib/pricing";
import { PICKUP_NAME, bankLabel, freeShipFrom, getSettings, parseBankAccounts, parseShippingTiers, shipConfig, shippingFee, shippingOptions } from "@/lib/settings";
import { codAllowed, orderTotal, quoteShipping, type ShipMethod } from "@/lib/shipping";
import { CUSTOMER_CANCEL_REASONS } from "@/lib/order-labels";
import { moveStock } from "@/lib/stock";
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
    // รอบ 3: เก็บเงินปลายทาง · รับที่ร้าน (ยอดจริงรวมค่าส่งห่างไกล/ตามน้ำหนัก คำนวณที่ /api/orders/preview)
    cod: s.codEnabled ? { feeSatang: s.codFeeSatang, maxSatang: s.codMaxSatang } : null,
    pickupNote: s.pickupEnabled ? s.pickupNote?.trim() || null : null,
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
    const price = unitPriceSatang(p, qty) / 100;
    const img = mediaUrl(p.images[0], "sm") ?? undefined;
    const base = {
      id: slug, name: p.name, price, wanted: qty, maxQty: p.trackStock ? Math.max(0, p.stock) : null, color: p.lightColor.toLowerCase(),
      ...(img ? { img } : {}), ...(p.isAccessory ? { acc: true } : {}), ...(p.includesPsu ? { kit: true } : {}),
    };
    if (p.priceSatang <= 0) return { ...base, qty: 0, status: "ask" };
    if (p.trackStock ? p.stock <= 0 : !p.inStock) return { ...base, qty: 0, status: "out" };
    if (p.trackStock && p.stock < qty) return { ...base, qty: p.stock, status: "qty" };
    const old = Number(seen[slug]);
    if (Number.isFinite(old) && old > 0 && Math.round(old * 100) !== unitPriceSatang(p, qty)) return { ...base, qty, status: "price", oldPrice: old };
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
// รอบ 3: คูปอง (U2) · ค่าส่งพื้นที่ห่างไกล/ตามน้ำหนัก (U21) · รับที่ร้าน (U22) · เก็บเงินปลายทาง (U20)

export type PaymentChoice = "TRANSFER" | "COD";

export type OrderSummary = {
  orderNo: string;
  subtotalSatang: number;
  discountSatang: number;
  couponCode: string | null;
  shippingSatang: number;
  remoteFeeSatang: number;
  codFeeSatang: number;
  totalSatang: number;
  shippingName: string;
  shippingMethod: ShipMethod;
  paymentMethod: PaymentChoice;
  printUrl: string | null;
};

/** ลิงก์ลับสำหรับเปิด/พิมพ์ใบสั่งซื้อ (U24) */
export const orderPrintUrl = (orderNo: string, token: string | null) => (token ? `/track/order/${encodeURIComponent(orderNo)}?t=${encodeURIComponent(token)}` : null);
export const newPublicToken = () => randomBytes(32).toString("base64url");

type PricedItem = { productId: string; nameSnapshot: string; priceSatang: number; qty: number; categoryId: string; weightGram: number };

/** ตะกร้า { slug: qty } → ราคาปัจจุบันจากฐานข้อมูล (โยน OrderError เมื่อสั่งไม่ได้) */
async function priceItems(rawItems: unknown) {
  const raw = rawItems && typeof rawItems === "object" && !Array.isArray(rawItems) ? (rawItems as Record<string, unknown>) : {};
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
  const items: PricedItem[] = wanted.map(([slug, qty]) => {
    const p = bySlug.get(slug)!;
    return { productId: p.id, nameSnapshot: p.name, priceSatang: unitPriceSatang(p, qty), qty, categoryId: p.categoryId, weightGram: Math.max(0, p.weightGram ?? 0) };
  });
  return {
    items,
    subtotalSatang: items.reduce((s, i) => s + i.priceSatang * i.qty, 0),
    totalGram: items.reduce((s, i) => s + i.weightGram * i.qty, 0),
    couponLines: items.map((i) => ({ categoryId: i.categoryId, lineSatang: i.priceSatang * i.qty })),
  };
}

export type CheckoutQuote = {
  subtotalSatang: number;
  discountSatang: number;
  couponCode: string | null;
  couponError: string | null;
  shippingMethod: ShipMethod;
  shippingName: string;
  shippingSatang: number;
  baseShipSatang: number;
  weightFeeSatang: number;
  remoteFeeSatang: number;
  totalGram: number;
  paymentMethod: PaymentChoice;
  codFeeSatang: number;
  codError: string | null;
  totalSatang: number;
};

/**
 * คำนวณยอดทั้งหมดจากฐานข้อมูล (ไม่เชื่อตัวเลขจากเบราว์เซอร์) — ใช้ทั้งแสดงผลในหน้าชำระเงินและตอนบันทึก
 * คูปอง/COD ที่ใช้ไม่ได้: แสดงผลจะคืนข้อความผิด (ไม่คิดส่วนลด/ไม่ใช้ COD) — ตอนบันทึกจะโยน OrderError
 */
async function computeCheckout(input: { items: unknown; shipping: unknown; zip?: unknown; payment?: unknown; coupon?: unknown; phone?: unknown; orderId?: string | null }) {
  const priced = await priceItems(input.items);
  const settings = await getSettings();
  const cfg = shipConfig(settings);
  const opts = shippingOptions(settings);
  const opt = opts.find((s) => s.id === input.shipping) ?? opts[0];
  const zip = typeof input.zip === "string" && /^\d{5}$/.test(input.zip.trim()) ? input.zip.trim() : undefined;
  const ship = quoteShipping(cfg, { method: opt.id, subtotalSatang: priced.subtotalSatang, totalGram: priced.totalGram, zip });
  const shipName = opts.find((o) => o.id === ship.method)?.name ?? opt.name;
  const phone = typeof input.phone === "string" ? phoneDigits(input.phone).slice(0, 12) : "";

  let discountSatang = 0, couponCode: string | null = null, couponError: string | null = null;
  const codeRaw = typeof input.coupon === "string" ? input.coupon.trim() : "";
  if (codeRaw) {
    try {
      const c = await previewCoupon(codeRaw, priced.couponLines, phone, input.orderId ?? null);
      discountSatang = c.discountSatang;
      couponCode = c.code;
    } catch (e) {
      if (!(e instanceof CouponError)) throw e;
      couponError = e.message;
    }
  }
  const before = orderTotal({ subtotalSatang: priced.subtotalSatang, discountSatang, shippingSatang: ship.shippingSatang, codFeeSatang: 0 });
  let paymentMethod: PaymentChoice = "TRANSFER", codFeeSatang = 0, codError: string | null = null;
  if (input.payment === "COD") {
    const c = codAllowed(cfg, ship.method, before);
    if (c.ok) {
      paymentMethod = "COD";
      codFeeSatang = c.feeSatang;
    } else codError = c.message;
  }
  const quote: CheckoutQuote = {
    subtotalSatang: priced.subtotalSatang, discountSatang, couponCode, couponError,
    shippingMethod: ship.method, shippingName: shipName, shippingSatang: ship.shippingSatang, baseShipSatang: ship.baseSatang,
    weightFeeSatang: ship.weightSatang, remoteFeeSatang: ship.remoteSatang, totalGram: priced.totalGram,
    paymentMethod, codFeeSatang, codError, totalSatang: before + codFeeSatang,
  };
  return { priced, quote };
}

/** ยอดสำหรับแสดงในหน้าชำระเงิน (POST /api/orders/preview) */
export async function previewCheckout(input: { items: unknown; shipping: unknown; zip?: unknown; payment?: unknown; coupon?: unknown; phone?: unknown; orderNo?: unknown }) {
  const old = typeof input.orderNo === "string" && input.orderNo ? await prisma.order.findUnique({ where: { orderNo: input.orderNo.slice(0, 40) }, select: { id: true, phone: true } }) : null;
  const sameOwner = !!old && typeof input.phone === "string" && phoneDigits(old.phone) === phoneDigits(input.phone);
  return (await computeCheckout({ ...input, orderId: sameOwner ? old.id : null })).quote;
}

const PICKUP_FIELDS = ["name", "phone", "email"];
/** รับที่ร้าน: บังคับเฉพาะชื่อ เบอร์ (และอีเมลถ้ากรอก) — ไม่ต้องกรอกที่อยู่ */
function validatePickup(raw: Record<string, unknown>): { ok: true; value: AddressInput } | Invalid {
  const v = validateAddress({ ...raw, addr: PICKUP_NAME, sub: "--", dist: "--", prov: "กรุงเทพมหานคร", zip: "10100" });
  if (!v.ok) {
    const fields = v.fields.filter((f) => PICKUP_FIELDS.includes(f));
    if (fields.length) return { ok: false, fields, messages: Object.fromEntries(fields.map((f) => [f, v.messages[f]])) };
  }
  return {
    ok: true,
    value: {
      name: text(raw.name, 120), phone: text(raw.phone, 20), email: text(raw.email, 160), addr: PICKUP_NAME, sub: "", dist: "", prov: "", zip: "",
      note: typeof raw.note === "string" ? raw.note.trim().slice(0, 500) : "",
    },
  };
}

export async function saveCheckoutOrder(input: {
  items: unknown;
  shipping: unknown;
  address: Record<string, unknown>;
  taxInvoice?: unknown;
  orderNo?: unknown;
  coupon?: unknown;
  payment?: unknown;
}): Promise<OrderSummary> {
  const settings = await getSettings();
  const pickup = input.shipping === "pickup" && settings.pickupEnabled;
  const addr = pickup ? validatePickup(input.address) : validateAddress(input.address);
  const ti = validateTaxInvoice(input.taxInvoice);
  if (!addr.ok || !ti.ok) {
    const fields = [...(addr.ok ? [] : addr.fields), ...(ti.ok ? [] : ti.fields)];
    const messages = { ...(addr.ok ? {} : addr.messages), ...(ti.ok ? {} : ti.messages) };
    throw new OrderError(messages[fields[0]] ?? "กรุณากรอกข้อมูลให้ครบถ้วน", 400, fields, messages);
  }
  const a = addr.value;

  // ลูกค้าย้อนกลับไปแก้ข้อมูล: แก้คำสั่งซื้อเดิมได้เฉพาะตอนยังไม่แนบสลิป และเบอร์โทรเดิมต้องตรง
  const old =
    typeof input.orderNo === "string" && input.orderNo
      ? await prisma.order.findUnique({ where: { orderNo: input.orderNo.slice(0, 40) } })
      : null;
  const editing = old && old.status === "AWAITING_SLIP" && phoneDigits(old.phone) === phoneDigits(a.phone) ? old : null;

  const { priced, quote } = await computeCheckout({
    items: input.items, shipping: input.shipping, zip: a.zip, payment: input.payment, coupon: input.coupon, phone: a.phone, orderId: editing?.id ?? null,
  });
  if (quote.couponError) throw new OrderError(quote.couponError, 409, ["coupon"], { coupon: quote.couponError });
  if (input.payment === "COD" && quote.codError) throw new OrderError(quote.codError, 409, ["payment"], { payment: quote.codError });

  const items = priced.items.map(({ productId, nameSnapshot, priceSatang, qty }) => ({ productId, nameSnapshot, priceSatang, qty }));
  const data = {
    // เก็บเบอร์เป็นตัวเลขล้วน (ค้นหาได้ทั้งแบบมี/ไม่มีขีด) แล้วจัดรูปแบบตอนแสดงผล
    customerName: a.name, phone: phoneDigits(a.phone), email: a.email || null, addressLine: a.addr, subdistrict: a.sub,
    district: a.dist, province: a.prov, postalCode: a.zip, note: a.note || null,
    subtotalSatang: quote.subtotalSatang, shippingMethod: quote.shippingMethod, shippingName: quote.shippingName, shippingSatang: quote.shippingSatang,
    remoteFeeSatang: quote.remoteFeeSatang, paymentMethod: quote.paymentMethod, codFeeSatang: quote.codFeeSatang,
    couponCode: quote.couponCode, discountSatang: quote.discountSatang, totalSatang: quote.totalSatang,
    taxInvoice: ti.value ?? Prisma.DbNull,
  };
  const phone = phoneDigits(a.phone);

  /** ใช้คูปองใน transaction เดียวกับคำสั่งซื้อ — ส่วนลดเปลี่ยน (แอดมินแก้คูปองระหว่างนั้น) = คำนวณยอดใหม่ */
  const applyCoupon = async (tx: Prisma.TransactionClient, orderId: string) => {
    if (!quote.couponCode) {
      await releaseCouponTx(tx, orderId);
      return quote;
    }
    try {
      const r = await redeemCouponTx(tx, { code: quote.couponCode, orderId, phone, lines: priced.couponLines });
      if (r.discountSatang === quote.discountSatang) return quote;
      const fixed = { ...quote, discountSatang: r.discountSatang };
      fixed.totalSatang = orderTotal({ subtotalSatang: fixed.subtotalSatang, discountSatang: fixed.discountSatang, shippingSatang: fixed.shippingSatang, codFeeSatang: fixed.codFeeSatang });
      await tx.order.update({ where: { id: orderId }, data: { discountSatang: fixed.discountSatang, totalSatang: fixed.totalSatang } });
      return fixed;
    } catch (e) {
      if (e instanceof CouponError) throw new OrderError(e.message, 409, ["coupon"], { coupon: e.message });
      throw e;
    }
  };
  const summary = (orderNo: string, q: CheckoutQuote, token: string | null): OrderSummary => ({
    orderNo, subtotalSatang: q.subtotalSatang, discountSatang: q.discountSatang, couponCode: q.couponCode, shippingSatang: q.shippingSatang,
    remoteFeeSatang: q.remoteFeeSatang, codFeeSatang: q.codFeeSatang, totalSatang: q.totalSatang, shippingName: q.shippingName,
    shippingMethod: q.shippingMethod, paymentMethod: q.paymentMethod, printUrl: orderPrintUrl(orderNo, token),
  });

  if (editing) {
    const token = editing.publicToken ?? newPublicToken();
    const q = await prisma.$transaction(async (tx) => {
      // ตรวจสถานะซ้ำใน transaction (กันลูกค้าแนบสลิปไปแล้วในอีกแท็บ)
      const r = await tx.order.updateMany({ where: { id: editing.id, status: "AWAITING_SLIP" }, data: { ...data, publicToken: token } });
      if (r.count !== 1) throw new OrderError("คำสั่งซื้อนี้แนบสลิปแล้ว แก้ไขไม่ได้ — หากต้องการเปลี่ยนแปลงกรุณาติดต่อร้าน", 409);
      await tx.orderItem.deleteMany({ where: { orderId: editing.id } });
      await tx.orderItem.createMany({ data: items.map((i) => ({ ...i, orderId: editing.id })) });
      return applyCoupon(tx, editing.id);
    });
    return summary(editing.orderNo, q, token);
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const orderNo = makeOrderNo();
    const token = newPublicToken();
    try {
      const q = await prisma.$transaction(async (tx) => {
        const o = await tx.order.create({
          data: {
            ...data, orderNo, publicToken: token, status: "AWAITING_SLIP", items: { create: items },
            events: {
              create: {
                type: "CREATED",
                note: `สั่งซื้อจากหน้าเว็บ${quote.paymentMethod === "COD" ? " · เก็บเงินปลายทาง" : ""}${quote.shippingMethod === "pickup" ? " · รับที่ร้าน" : ""}${quote.couponCode ? ` · คูปอง ${quote.couponCode}` : ""}`,
              },
            },
          },
        });
        return applyCoupon(tx, o.id);
      });
      return summary(orderNo, q, token);
    } catch (e) {
      // เลขที่ซ้ำ (สุ่มชน) → สุ่มใหม่
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new OrderError("สร้างเลขที่คำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่", 503);
}

/** ตรวจเลขที่ + เบอร์ (ข้อความเดียวกันทุกกรณี ไม่บอกใบ้ว่าเลขที่มีจริง) */
async function ownOrder(orderNoRaw: string, phoneRaw: string) {
  const order = await prisma.order.findUnique({ where: { orderNo: orderNoRaw.trim().toUpperCase().slice(0, 40) } });
  if (!order || phoneDigits(order.phone) !== phoneDigits(phoneRaw)) throw new OrderError("ไม่พบคำสั่งซื้อ ตรวจเลขที่และเบอร์โทรอีกครั้ง", 404);
  return order;
}

/**
 * ลูกค้ายืนยันคำสั่งซื้อจากขั้นชำระเงิน (POST /api/orders/:orderNo/confirm)
 * - COD: ส่งเข้าคิว "รอยืนยัน COD" (สถานะ PENDING_VERIFICATION + paymentMethod COD) → ร้านโทรยืนยันแล้วกดยืนยันในหลังบ้าน
 * - โอนทีหลัง: ไม่เปลี่ยนสถานะ (ส่งอีเมลยืนยันคำสั่งซื้อพร้อมลิงก์แนบสลิป)
 */
export async function confirmCheckout(input: { orderNo: string; phone: string; mode: string }) {
  const order = await ownOrder(input.orderNo, input.phone);
  if (input.mode === "cod") {
    if (order.paymentMethod !== "COD") throw new OrderError("คำสั่งซื้อนี้เลือกชำระด้วยการโอนเงิน", 409);
    if (order.status === "PENDING_VERIFICATION") return { orderNo: order.orderNo, status: order.status, changed: false };
    const r = await prisma.$transaction(async (tx) => {
      const u = await tx.order.updateMany({ where: { id: order.id, status: "AWAITING_SLIP", paymentMethod: "COD" }, data: { status: "PENDING_VERIFICATION" } });
      if (u.count !== 1) return false;
      await tx.orderEvent.create({ data: { orderId: order.id, type: "SLIP_UPLOADED", note: "ลูกค้ายืนยันสั่งซื้อแบบเก็บเงินปลายทาง — รอร้านยืนยัน COD" } });
      return true;
    });
    if (!r) throw new OrderError("คำสั่งซื้อนี้ยืนยันไม่ได้ในสถานะปัจจุบัน กรุณาติดต่อร้าน", 409);
    return { orderNo: order.orderNo, status: "PENDING_VERIFICATION", changed: true };
  }
  if (order.paymentMethod === "COD") throw new OrderError("คำสั่งซื้อนี้เป็นแบบเก็บเงินปลายทาง", 409);
  return { orderNo: order.orderNo, status: order.status, changed: false };
}

/** สถานะที่ลูกค้ายกเลิกเองได้ (ยังไม่ชำระ/ยังไม่ผ่านการตรวจ) — COD ที่ร้านยังไม่ยืนยันก็ยกเลิกเองได้ */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ["AWAITING_SLIP", "REJECTED"];
export const canCustomerCancel = (o: { status: OrderStatus; paymentMethod: string }) =>
  CUSTOMER_CANCELLABLE.includes(o.status) || (o.paymentMethod === "COD" && o.status === "PENDING_VERIFICATION");
export { CUSTOMER_CANCEL_REASONS } from "@/lib/order-labels";

/** ลูกค้ายกเลิกคำสั่งซื้อเอง (U18) — คืนสต็อกถ้าเคยตัด, คืนสิทธิ์คูปอง, บันทึก CUSTOMER_CANCELLED */
export async function cancelByCustomer(input: { orderNo: string; phone: string; reason: string; note?: string }) {
  const order = await ownOrder(input.orderNo, input.phone);
  if (!canCustomerCancel(order))
    throw new OrderError(order.status === "CANCELLED" ? "คำสั่งซื้อนี้ถูกยกเลิกแล้ว" : "คำสั่งซื้อนี้อยู่ระหว่างตรวจสอบหรือชำระแล้ว ยกเลิกเองไม่ได้ — กรุณาติดต่อร้านทาง LINE", 409);
  const reason = CUSTOMER_CANCEL_REASONS.includes(input.reason) ? input.reason : CUSTOMER_CANCEL_REASONS.at(-1)!;
  const why = `ลูกค้ายกเลิกเอง — ${reason}${input.note?.trim() ? `: ${input.note.trim().slice(0, 200)}` : ""}`;
  const result = await prisma.$transaction(async (tx) => {
    const from: OrderStatus[] = order.paymentMethod === "COD" ? [...CUSTOMER_CANCELLABLE, "PENDING_VERIFICATION"] : CUSTOMER_CANCELLABLE;
    const r = await tx.order.updateMany({ where: { id: order.id, status: { in: from } }, data: { status: "CANCELLED", cancelReason: why } });
    if (r.count !== 1) return null;
    // ปกติยังไม่ตัดสต็อก (ตัดตอนยืนยันชำระ) — ถ้ามีประวัติตัดไว้ให้คืนตามที่ตัดจริง
    const moves = await moveStock(tx, await soldLines(tx, order.orderNo), { reason: "CANCEL", ref: order.orderNo, note: "ลูกค้ายกเลิกคำสั่งซื้อเอง" });
    const coupon = await releaseCouponTx(tx, order.id);
    await tx.orderEvent.create({ data: { orderId: order.id, type: "CUSTOMER_CANCELLED", note: why + (coupon ? ` · คืนสิทธิ์คูปอง ${coupon}` : "") } });
    return { moves };
  });
  if (!result) throw new OrderError("ยกเลิกไม่สำเร็จ สถานะคำสั่งซื้อเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่", 409);
  return { orderNo: order.orderNo, totalSatang: order.totalSatang, customerName: order.customerName, reason: why, restocked: result.moves.length > 0 };
}

/** สต็อกที่ตัดไปแล้วจริงของคำสั่งซื้อ (SALE + CANCEL สุทธิ) → จำนวนที่ต้องคืน */
async function soldLines(tx: Prisma.TransactionClient, orderNo: string) {
  const moves = await tx.stockMovement.groupBy({ by: ["productId"], where: { ref: orderNo, reason: { in: ["SALE", "CANCEL"] } }, _sum: { change: true } });
  return moves.map((m) => ({ productId: m.productId, delta: -(m._sum.change ?? 0) })).filter((l) => l.delta > 0);
}

// ---------- แนบสลิป (ขั้นที่ 3, แนบใหม่ หรือแนบเพิ่มจากหน้าติดตามคำสั่งซื้อ) ----------

export const MAX_SLIPS = 10;

export async function attachSlip(input: {
  orderNo: string;
  phone: string;
  file: File | null;
  paidAt: string;
  amount: string;
}) {
  const order = await ownOrder(input.orderNo, input.phone);
  if (order.paymentMethod === "COD") throw new OrderError("คำสั่งซื้อนี้เป็นแบบเก็บเงินปลายทาง ไม่ต้องแนบสลิป", 409);
  // U19: แนบสลิปเพิ่มได้ระหว่างรอตรวจ (โอนหลายครั้ง/โอนขาด) — หลังร้านยืนยันแล้วแนบไม่ได้
  if (order.status !== "AWAITING_SLIP" && order.status !== "REJECTED" && order.status !== "PENDING_VERIFICATION")
    throw new OrderError("คำสั่งซื้อนี้ร้านยืนยันแล้ว แนบสลิปเพิ่มไม่ได้ หากต้องการแก้ไขกรุณาติดต่อร้านทาง LINE", 409);
  const count = await prisma.paymentSlip.count({ where: { orderId: order.id } });
  if (count >= MAX_SLIPS) throw new OrderError(`แนบสลิปได้ไม่เกิน ${MAX_SLIPS} ครั้งต่อคำสั่งซื้อ กรุณาติดต่อร้านทาง LINE`, 409, ["slip"]);

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
  // ส่งซ้ำไฟล์เดิมกับคำสั่งซื้อเดิม (เช่น เน็ตหลุดหลังเซิร์ฟเวอร์รับไปแล้ว แล้วเบราว์เซอร์ลองใหม่) = ถือว่าสำเร็จ ไม่สร้างสลิปซ้ำ
  const same = await prisma.paymentSlip.findFirst({
    where: { orderId: order.id, sha256, status: { not: "REJECTED" } },
    select: { id: true },
  });
  if (same) return { orderNo: order.orderNo, totalSatang: order.totalSatang, slipCount: count, extra: false, repeated: true };
  const now = new Date();
  const key = `slips/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${order.orderNo.toLowerCase()}-${sha256.slice(0, 16)}-${Date.now()}.${kind.ext}`;
  await storage().put(key, buf);

  const extra = order.status === "PENDING_VERIFICATION";
  // สลิปซ้ำ: ไม่บล็อก แต่ติดธงให้แอดมินตัดสินในหน้าตรวจสลิป
  const ok = await prisma.$transaction(async (tx) => {
    const r = await tx.order.updateMany({
      where: { id: order.id, status: order.status, paymentMethod: "TRANSFER" },
      data: { status: "PENDING_VERIFICATION", rejectReason: null },
    });
    if (r.count !== 1) return false;
    await tx.paymentSlip.create({
      data: { orderId: order.id, storageKey: key, mimeType: kind.mime, sizeBytes: buf.length, sha256, declaredAmountSatang: Math.round(amount * 100), transferredAt },
    });
    await tx.orderEvent.create({
      data: { orderId: order.id, type: "SLIP_UPLOADED", note: extra ? `ลูกค้าแนบสลิปเพิ่ม (สลิปที่ ${count + 1})` : order.status === "REJECTED" ? "ลูกค้าแนบสลิปใหม่" : "ลูกค้าแนบสลิป" },
    });
    return true;
  });
  if (!ok) {
    await storage().delete(key).catch(() => {});
    throw new OrderError("สถานะคำสั่งซื้อเปลี่ยนระหว่างแนบสลิป กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง", 409);
  }
  return { orderNo: order.orderNo, totalSatang: order.totalSatang, slipCount: count + 1, extra };
}

/** ยอดรวมของสลิปที่ยังไม่ถูกปฏิเสธ (แสดงในหน้าติดตาม/หลังบ้าน) */
export function slipTotals(slips: { declaredAmountSatang: number; status: string }[]) {
  const live = slips.filter((s) => s.status !== "REJECTED");
  return { count: live.length, sumSatang: live.reduce((s, x) => s + x.declaredAmountSatang, 0), allCount: slips.length };
}
