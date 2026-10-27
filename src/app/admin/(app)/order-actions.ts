"use server";
// การดำเนินการกับคำสั่งซื้อในหลังบ้าน — ทุก action ตรวจ session และตรวจสถานะปัจจุบันก่อนเปลี่ยน
// (updateMany + where status = สถานะที่คาดไว้ ภายใน transaction กันแอดมินสองคนกดพร้อมกัน)
// ทุกการเปลี่ยนแปลงบันทึก OrderEvent (ลูกค้า/ประวัติ) + AdminLog (บันทึกการใช้งาน) · สต็อกเปลี่ยนผ่าน src/lib/stock.ts เท่านั้น
import { redirect } from "next/navigation";
import { after } from "next/server";
import { diffOf, logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import {
  ADMIN_SOURCES, CANCEL_REASONS, CANCELLABLE, CARRIERS, EDITABLE, REFUND_REASONS, REFUNDABLE, REJECT_REASONS, TRACKING_RE,
  checkShipRows, makeOrderNo, nextPending, normTracking, restockLines, type ShipRow,
} from "@/lib/admin-orders";
import { parseCsv } from "@/lib/csv";
import { releaseCouponTx } from "@/lib/coupons";
import { customerFromOrder } from "@/lib/docs";
import { sendOrderEmail } from "@/lib/email";
import { bahtText, phoneDigits } from "@/lib/format";
import { validateAddress, validateTaxInvoice } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { getSettings, shippingFee } from "@/lib/settings";
import { alertLowStock, moveStock, type StockResult } from "@/lib/stock";
import { Prisma, type OrderStatus } from "../../../../generated/prisma/client";

type Tx = Prisma.TransactionClient;
const str = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

/** query string กลับไปหน้าเดิม — รับเฉพาะรูปแบบ ?a=b&c=d กัน redirect ไปเว็บอื่น */
function backTo(f: FormData, patch: Record<string, string | null> = {}) {
  const raw = str(f, "ret", 500);
  const qs = new URLSearchParams(/^\?[\w=&%.+\-]*$/.test(raw) ? raw.slice(1) : "");
  for (const k of ["mode", "err", "done", "refunded", "created", "edited"]) qs.delete(k);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) qs.delete(k);
    else qs.set(k, v);
  }
  const s = qs.toString();
  return `/admin${s ? `?${s}` : ""}`;
}

/** เปลี่ยนสถานะแบบมีเงื่อนไข (คืน id ของคำสั่งซื้อเมื่อสำเร็จ) */
async function transition(tx: Tx, orderNo: string, from: OrderStatus[], data: Prisma.OrderUpdateManyMutationInput) {
  const o = await tx.order.findUnique({ where: { orderNo }, select: { id: true } });
  if (!o) return null;
  const r = await tx.order.updateMany({ where: { id: o.id, status: { in: from } }, data });
  return r.count === 1 ? o.id : null;
}

/**
 * ยืนยันการรับเงิน: เปลี่ยนเป็น "ชำระแล้ว" + ตัดสต็อก (บันทึก StockMovement) ใน transaction เดียว
 * ใช้ทั้งอนุมัติสลิป, บันทึกรับชำระเอง และคำสั่งซื้อที่แอดมินสร้างแบบชำระแล้ว
 */
async function confirmPaid(tx: Tx, orderNo: string, from: OrderStatus[], adminId: string, note: string): Promise<StockResult[] | null> {
  const id = await transition(tx, orderNo, from, { status: "PAID", paidAt: new Date(), rejectReason: null });
  if (!id) return null;
  // รอบ 3: ลูกค้าแนบได้หลายสลิป → อนุมัติทุกสลิปที่รอตรวจ
  await tx.paymentSlip.updateMany({ where: { orderId: id, status: "PENDING" }, data: { status: "ACCEPTED" } });
  await tx.orderEvent.create({ data: { orderId: id, type: "APPROVED", note, adminId } });
  const items = await tx.orderItem.findMany({ where: { orderId: id, productId: { not: null } }, select: { productId: true, qty: true } });
  return moveStock(tx, items.map((i) => ({ productId: i.productId!, delta: -i.qty })), { reason: "SALE", ref: orderNo, adminId, note: "ตัดสต็อกเมื่อยืนยันการชำระเงิน" });
}

/** หลังตัดสต็อก: ล้างแคชหน้าร้าน + แจ้ง LINE สินค้าใกล้หมด (หลังตอบผู้ใช้แล้ว) */
function afterStock(moves: StockResult[], orderNo: string) {
  if (moves.length) refreshStorefront();
  after(() => alertLowStock(moves, orderNo));
}

// ---------------------------------------------------------------------------
// ตรวจสลิป
// ---------------------------------------------------------------------------

export async function approveOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const moves = await prisma.$transaction((tx) => confirmPaid(tx, orderNo, ["PENDING_VERIFICATION"], admin.id, "ยืนยันการชำระเงิน"));
  if (moves) {
    afterStock(moves, orderNo);
    after(() => sendOrderEmail(orderNo, "PAID"));
    await logAdmin(admin.id, "ORDER", `อนุมัติการชำระเงิน ${orderNo}`);
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
  const ok = await prisma.$transaction(async (tx) => {
    const id = await transition(tx, orderNo, ["PENDING_VERIFICATION"], { status: "REJECTED", rejectReason: full });
    if (!id) return false;
    await tx.paymentSlip.updateMany({ where: { orderId: id, status: "PENDING" }, data: { status: "REJECTED" } });
    await tx.orderEvent.create({ data: { orderId: id, type: "REJECTED", note: full, adminId: admin.id } });
    return true;
  });
  if (ok) await logAdmin(admin.id, "ORDER", `ปฏิเสธสลิป ${orderNo}: ${full}`);
  const next = await nextPending(orderNo);
  redirect(backTo(f, { open: next ?? orderNo, done: next ? null : "1" }));
}

export async function reopenOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const ok = await prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { orderNo }, select: { id: true } });
    const slip = o && (await tx.paymentSlip.findFirst({ where: { orderId: o.id }, orderBy: { uploadedAt: "desc" } }));
    if (!o || !slip) return false;
    const id = await transition(tx, orderNo, ["REJECTED"], { status: "PENDING_VERIFICATION", rejectReason: null });
    if (!id) return false;
    await tx.paymentSlip.update({ where: { id: slip.id }, data: { status: "PENDING" } });
    await tx.orderEvent.create({ data: { orderId: id, type: "REOPENED", note: "กลับมาตรวจสลิปอีกครั้ง", adminId: admin.id } });
    return true;
  });
  if (ok) await logAdmin(admin.id, "ORDER", `กลับมาตรวจสลิป ${orderNo} อีกครั้ง`);
  redirect(backTo(f, { open: orderNo }));
}

/** บันทึกรับชำระเอง (ลูกค้าโอน/จ่ายเงินสดโดยไม่แนบสลิปผ่านเว็บ) — ตัดสต็อกเหมือนอนุมัติ */
export async function markPaid(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const method = ["โอนเงินผ่านธนาคาร", "QR PromptPay", "เงินสด", "อื่นๆ"].includes(str(f, "method", 40)) ? str(f, "method", 40) : "อื่นๆ";
  const note = str(f, "note", 200);
  if (!note) redirect(backTo(f, { open: orderNo, mode: "pay", err: "paynote" }));
  const text = `บันทึกรับชำระโดยแอดมิน (${method}) — ${note}`;
  const moves = await prisma.$transaction((tx) => confirmPaid(tx, orderNo, ["AWAITING_SLIP", "REJECTED"], admin.id, text));
  if (moves) {
    afterStock(moves, orderNo);
    after(() => sendOrderEmail(orderNo, "PAID"));
    await logAdmin(admin.id, "ORDER", `${orderNo}: ${text}`);
  }
  redirect(backTo(f, { open: orderNo }));
}

// ---------------------------------------------------------------------------
// จัดส่ง
// ---------------------------------------------------------------------------

async function ship(tx: Tx, orderNo: string, carrier: string, trackingNo: string, adminId: string) {
  const id = await transition(tx, orderNo, ["PAID"], { status: "SHIPPED", carrier, trackingNo, shippedAt: new Date() });
  if (id) await tx.orderEvent.create({ data: { orderId: id, type: "SHIPPED", note: `${carrier} · ${trackingNo}`, adminId } });
  return !!id;
}

export async function shipOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const carrier = CARRIERS.includes(str(f, "carrier", 60)) ? str(f, "carrier", 60) : CARRIERS[0];
  const trackingNo = normTracking(str(f, "trackingNo", 40));
  if (!TRACKING_RE.test(trackingNo)) redirect(backTo(f, { open: orderNo, err: "tracking" }));
  if (await prisma.$transaction((tx) => ship(tx, orderNo, carrier, trackingNo, admin.id))) {
    after(() => sendOrderEmail(orderNo, "SHIPPED"));
    await logAdmin(admin.id, "ORDER", `จัดส่ง ${orderNo} (${carrier} · ${trackingNo})`);
  }
  redirect(backTo(f, { open: orderNo }));
}

export type ShipCsvState = { error?: string; rows?: ShipRow[]; csv?: string; ok?: string };

async function readCsvInput(f: FormData) {
  const file = f.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 1024 * 1024) return { text: "", error: "ไฟล์ใหญ่เกิน 1 MB" };
    return { text: await file.text() };
  }
  return { text: str(f, "csv", 500_000) };
}

/** ขั้นที่ 1: อัปโหลด CSV เลขพัสดุ → ตรวจทุกแถวก่อนบันทึก */
export async function previewShipCsv(_prev: ShipCsvState, f: FormData): Promise<ShipCsvState> {
  await requireAdmin();
  const { text, error } = await readCsvInput(f);
  if (error) return { error };
  const { rows, error: perr } = parseCsv(text);
  if (perr) return { error: perr };
  if (!rows.length) return { error: "ไม่พบข้อมูลในไฟล์ — แถวแรกต้องเป็นหัวคอลัมน์ orderNo,carrier,trackingNo" };
  if (rows.length > 500) return { error: "นำเข้าได้ครั้งละไม่เกิน 500 แถว" };
  return { rows: await checkShipRows(rows), csv: text };
}

/** ขั้นที่ 2: ยืนยัน — ตรวจซ้ำอีกครั้ง แล้วบันทึกเฉพาะแถวที่ถูกต้อง (แต่ละรายการมีเงื่อนไขสถานะ "รอจัดส่ง") */
export async function applyShipCsv(_prev: ShipCsvState, f: FormData): Promise<ShipCsvState> {
  const admin = await requireAdmin();
  const text = str(f, "csv", 500_000);
  const { rows, error } = parseCsv(text);
  if (error || !rows.length) return { error: error ?? "ไม่พบข้อมูล" };
  const checked = await checkShipRows(rows);
  let done = 0;
  const shipped: string[] = [];
  for (const r of checked.filter((x) => !x.error)) {
    if (await prisma.$transaction((tx) => ship(tx, r.orderNo, r.carrier, r.trackingNo, admin.id))) {
      done++;
      shipped.push(r.orderNo);
    }
  }
  if (done) {
    after(async () => {
      for (const no of shipped) await sendOrderEmail(no, "SHIPPED");
    });
    await logAdmin(admin.id, "ORDER", `บันทึกเลขพัสดุจาก CSV ${done} รายการ: ${shipped.join(", ")}`);
  }
  const skipped = checked.length - done;
  return { ok: `บันทึกเลขพัสดุแล้ว ${done} รายการ${skipped ? ` · ข้าม ${skipped} แถวที่ไม่ผ่านการตรวจ` : ""}`, rows: checked, csv: text };
}

// ---------------------------------------------------------------------------
// ยกเลิก / คืนเงิน
// ---------------------------------------------------------------------------

function reasonOf(f: FormData, list: string[]) {
  const r = str(f, "reason", 100);
  const reason = list.includes(r) ? r : list.at(-1)!;
  const extra = str(f, "note", 300);
  return reason + (extra ? ` — ${extra}` : "");
}

/** ยกเลิกคำสั่งซื้อที่ยังไม่ได้รับเงิน (ไม่มีสต็อกต้องคืน) */
export async function cancelOrder(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const why = reasonOf(f, CANCEL_REASONS);
  const ok = await prisma.$transaction(async (tx) => {
    const id = await transition(tx, orderNo, CANCELLABLE, { status: "CANCELLED", cancelReason: why });
    if (!id) return false;
    // ยังไม่ได้รับเงิน → คืนสิทธิ์คูปองให้ลูกค้า
    const coupon = await releaseCouponTx(tx, id);
    await tx.orderEvent.create({ data: { orderId: id, type: "CANCELLED", note: `ยกเลิกคำสั่งซื้อ — ${why}${coupon ? ` · คืนสิทธิ์คูปอง ${coupon}` : ""}`, adminId: admin.id } });
    return true;
  });
  if (ok) await logAdmin(admin.id, "ORDER", `ยกเลิกคำสั่งซื้อ ${orderNo}: ${why}`);
  redirect(backTo(f, { open: orderNo }));
}

/**
 * ยกเลิกคำสั่งซื้อที่ชำระแล้ว/จัดส่งแล้ว + คืนเงิน (เจ้าของร้านเท่านั้น)
 * คืนสต็อกตามที่ตัดไปจริง (ติ๊กออกได้ เช่น ของเสียหาย/ไม่ได้คืน) · ใบเสร็จที่เกี่ยวข้องต้องยกเลิกเองในเอกสารขาย (ระบบแจ้งเตือนให้)
 */
export async function refundOrder(f: FormData) {
  const admin = await requireOwner();
  const orderNo = str(f, "orderNo", 40);
  const why = reasonOf(f, REFUND_REASONS);
  const restock = f.get("restock") === "on";
  const o = await prisma.order.findUnique({ where: { orderNo }, select: { totalSatang: true } });
  if (!o) redirect("/admin");
  const amt = Number(str(f, "amount", 20).replace(/[,\s฿]/g, ""));
  const amountSatang = Math.round(amt * 100);
  if (!(amountSatang >= 0 && amountSatang <= o.totalSatang)) redirect(backTo(f, { open: orderNo, mode: "refund", err: "amount" }));
  const ref = str(f, "ref", 100);
  const result = await prisma.$transaction(async (tx) => {
    const id = await transition(tx, orderNo, REFUNDABLE, { status: "CANCELLED", cancelReason: why });
    if (!id) return null;
    const moves = restock
      ? await moveStock(tx, await restockLines(tx, id, orderNo), { reason: "CANCEL", ref: orderNo, adminId: admin.id, note: `คืนสต็อกจากการยกเลิก — ${why}` })
      : [];
    const refundNote = `คืนเงิน ${bahtText(amountSatang)}${ref ? ` (อ้างอิง ${ref})` : ""} — ${why}`;
    await tx.orderEvent.create({ data: { orderId: id, type: "REFUNDED", note: refundNote, adminId: admin.id } });
    await tx.orderEvent.create({
      data: { orderId: id, type: "CANCELLED", note: `ยกเลิกคำสั่งซื้อหลังชำระเงิน${restock ? ` · คืนสต็อก ${moves.reduce((n, m) => n + m.change, 0)} ชิ้น` : " · ไม่คืนสต็อก"}`, adminId: admin.id },
    });
    return { moves, refundNote };
  });
  if (result) {
    if (result.moves.length) refreshStorefront();
    await logAdmin(admin.id, "ORDER", `ยกเลิก+คืนเงิน ${orderNo}: ${result.refundNote}`);
  }
  redirect(backTo(f, { open: orderNo, refunded: result ? "1" : null }));
}

// ---------------------------------------------------------------------------
// แก้ไขก่อนจัดส่ง / โน้ต
// ---------------------------------------------------------------------------

export type OrderFormState = { error?: string; fields?: string[] };

type TaxIn = { want?: boolean; kind?: string; name?: string; taxId?: string; branch?: string; address?: string };
const TAX_FIELD: Record<string, string> = { tiName: "tax.name", tiTaxId: "tax.taxId", tiBranch: "tax.branch", tiAddr: "tax.address" };
/** ตรวจข้อมูลใบกำกับภาษีด้วยกติกาเดียวกับหน้าชำระเงิน (validateTaxInvoice) — null = ไม่ขอ */
function checkTax(t: TaxIn | undefined): { value: Prisma.InputJsonValue | null; bad: string[]; messages: string[] } {
  if (!t?.want) return { value: null, bad: [], messages: [] };
  const v = validateTaxInvoice({ ...t, kind: t.kind === "PERSON" ? "PERSON" : "COMPANY" });
  if (!v.ok) return { value: null, bad: v.fields.map((k) => TAX_FIELD[k] ?? k), messages: Object.values(v.messages) };
  return { value: v.value as Prisma.InputJsonValue | null, bad: [], messages: [] };
}

const PICKUP_ADDR = "รับสินค้าที่ร้าน";
/**
 * ตรวจผู้รับด้วยกติกาเดียวกับหน้าชำระเงิน (validateAddress: เบอร์ไทย, 77 จังหวัด, รหัสไปรษณีย์ตรงจังหวัด)
 * รับที่ร้าน: บังคับเฉพาะชื่อ/เบอร์/อีเมล — ที่อยู่ไม่บังคับ แต่ถ้ากรอกจังหวัด/รหัสไปรษณีย์มาต้องถูกต้อง
 */
function checkRecipient(raw: Record<string, unknown>, pickup: boolean) {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const filled = { ...raw };
  if (pickup) {
    if (!s("addr")) filled.addr = PICKUP_ADDR;
    if (!s("sub")) filled.sub = "--";
    if (!s("dist")) filled.dist = "--";
  }
  const v = validateAddress(filled);
  if (v.ok) {
    const value = pickup ? { ...v.value, sub: s("sub") ? v.value.sub : "", dist: s("dist") ? v.value.dist : "" } : v.value;
    return { ok: true as const, value, fields: [] as string[], messages: [] as string[] };
  }
  const skip = pickup ? new Set([...(s("prov") ? [] : ["prov"]), ...(s("zip") ? [] : ["zip"])]) : new Set<string>();
  const fields = v.fields.filter((k) => !skip.has(k));
  if (fields.length) return { ok: false as const, fields, messages: fields.map((k) => v.messages[k]) };
  // รับที่ร้านโดยไม่กรอกจังหวัด/รหัสไปรษณีย์: ใช้ค่าที่ผ่านการตรวจช่องอื่นแล้ว
  const text = (k: string, max: number) => s(k).replace(/\s+/g, " ").slice(0, max);
  return {
    ok: true as const,
    fields: [] as string[],
    messages: [] as string[],
    value: {
      name: text("name", 120), phone: text("phone", 20), email: text("email", 160), addr: text("addr", 300) || PICKUP_ADDR,
      sub: text("sub", 120), dist: text("dist", 120), prov: text("prov", 120), zip: text("zip", 5), note: s("note").slice(0, 500),
    },
  };
}

/** ข้อความผิดภาษาไทยของทุกช่อง (ไม่ซ้ำ) */
const errorText = (msgs: string[]) => (msgs.length ? `กรุณาแก้ไข: ${[...new Set(msgs)].join(" · ")}` : "กรุณาตรวจช่องที่มีกรอบสีแดง");

const FIELD_TH: Record<string, string> = {
  customerName: "ชื่อผู้รับ", phone: "เบอร์โทร", email: "อีเมล", addressLine: "ที่อยู่", subdistrict: "ตำบล/แขวง", district: "อำเภอ/เขต",
  province: "จังหวัด", postalCode: "รหัสไปรษณีย์", note: "หมายเหตุ",
};

export async function editOrder(_prev: OrderFormState, f: FormData): Promise<OrderFormState> {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  let payload: Record<string, unknown> & { tax?: TaxIn };
  try {
    payload = JSON.parse(str(f, "data", 20_000));
  } catch {
    return { error: "ข้อมูลไม่ถูกต้อง" };
  }
  const cur = await prisma.order.findUnique({ where: { orderNo }, select: { shippingMethod: true } });
  const v = checkRecipient(payload, cur?.shippingMethod === "pickup");
  const tax = checkTax(payload.tax);
  const bad = [...v.fields, ...tax.bad];
  if (!v.ok || bad.length) return { error: errorText([...v.messages, ...tax.messages]), fields: bad };
  const a = v.value;
  const data = {
    customerName: a.name, phone: phoneDigits(a.phone), email: a.email || null, addressLine: a.addr, subdistrict: a.sub, district: a.dist,
    province: a.prov, postalCode: a.zip, note: a.note || null,
  };
  const res = await prisma.$transaction(async (tx) => {
    const old = await tx.order.findUnique({ where: { orderNo } });
    if (!old) return { error: "ไม่พบคำสั่งซื้อ" };
    if (!EDITABLE.includes(old.status)) return { error: "คำสั่งซื้อนี้จัดส่งหรือยกเลิกแล้ว แก้ไขไม่ได้" };
    const diff = (Object.keys(data) as (keyof typeof data)[])
      .filter((k) => (old[k] ?? "") !== (data[k] ?? ""))
      .map((k) => `${FIELD_TH[k]}: ${old[k] || "—"} → ${data[k] || "—"}`);
    const taxChanged = JSON.stringify(old.taxInvoice ?? null) !== JSON.stringify(tax.value);
    if (taxChanged) diff.push(tax.value ? "แก้ข้อมูลใบกำกับภาษี" : "ลบข้อมูลใบกำกับภาษี");
    if (!diff.length) return { same: true };
    const r = await tx.order.updateMany({
      where: { id: old.id, status: { in: EDITABLE } },
      data: { ...data, taxInvoice: tax.value ?? Prisma.DbNull },
    });
    if (r.count !== 1) return { error: "คำสั่งซื้อนี้จัดส่งหรือยกเลิกแล้ว แก้ไขไม่ได้" };
    const note = `แก้ไขข้อมูล — ${diff.join(" · ")}`.slice(0, 1000);
    await tx.orderEvent.create({ data: { orderId: old.id, type: "EDITED", note, adminId: admin.id } });
    return { note, diff: diffOf(old, { ...data, taxInvoice: tax.value }) };
  });
  if ("error" in res) return { error: res.error };
  if ("note" in res && res.note) await logAdmin(admin.id, "ORDER", `${orderNo}: ${res.note}`, { entity: `Order:${orderNo}`, diff: res.diff });
  redirect(backTo(f, { open: orderNo, edited: "note" in res ? "1" : null }));
}

/** โน้ตภายใน — ลูกค้าไม่เห็น (หน้าติดตามคำสั่งซื้อไม่แสดง event ชนิด NOTE) */
export async function addOrderNote(f: FormData) {
  const admin = await requireAdmin();
  const orderNo = str(f, "orderNo", 40);
  const text = str(f, "text", 500);
  const o = await prisma.order.findUnique({ where: { orderNo }, select: { id: true } });
  if (text && o) await prisma.orderEvent.create({ data: { orderId: o.id, type: "NOTE", note: text, adminId: admin.id } });
  redirect(backTo(f, { open: orderNo }));
}

// ---------------------------------------------------------------------------
// สร้างคำสั่งซื้อจากหลังร้าน (ลูกค้าสั่งทางโทร/LINE/หน้าร้าน)
// ---------------------------------------------------------------------------

export type ManualPayload = {
  customerId?: string; name: string; phone: string; email?: string; addr: string; sub: string; dist: string; prov: string; zip: string; note?: string;
  source: string; items: { productId: string; qty: number | string; price: string }[];
  shipping: "std" | "express" | "custom" | "pickup"; shippingFee?: string;
  paid: boolean; payMethod?: string; payNote?: string; tax?: TaxIn;
};

const toSatang = (s: unknown) => {
  const n = Number(String(s ?? "").replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) : NaN;
};

export async function createManualOrder(_prev: OrderFormState, f: FormData): Promise<OrderFormState> {
  const admin = await requireAdmin();
  let p: ManualPayload;
  try {
    p = JSON.parse(str(f, "data", 50_000));
  } catch {
    return { error: "ข้อมูลไม่ถูกต้อง" };
  }
  const pickup = p.shipping === "pickup";
  // รับที่ร้าน: ไม่บังคับที่อยู่
  const v = checkRecipient(p as unknown as Record<string, unknown>, pickup);
  const bad: string[] = [...v.fields];
  const tax = checkTax(p.tax);
  bad.push(...tax.bad);

  // รายการสินค้า: ราคาตั้งเองได้ (ราคาตกลงทางโทร) แต่ตรวจที่ server ทุกช่อง
  const lines = (Array.isArray(p.items) ? p.items : []).slice(0, 60);
  if (!lines.length) return { error: "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ", fields: [...bad, "items"] };
  const products = await prisma.product.findMany({ where: { id: { in: lines.map((l) => String(l.productId)) }, isService: false } });
  const byId = new Map(products.map((x) => [x.id, x]));
  const items: { productId: string; nameSnapshot: string; priceSatang: number; qty: number }[] = [];
  const merged = new Map<string, { qty: number; price: number }>();
  for (const [i, l] of lines.entries()) {
    const prod = byId.get(String(l.productId));
    const qty = Math.floor(Number(l.qty));
    const price = toSatang(l.price);
    if (!prod) return { error: `รายการที่ ${i + 1}: ไม่พบสินค้า`, fields: [...bad, `item.${i}`] };
    if (!(qty >= 1 && qty <= 999)) return { error: `"${prod.name}": จำนวนต้องเป็น 1–999`, fields: [...bad, `item.${i}`] };
    if (Number.isNaN(price) || price <= 0) return { error: `"${prod.name}": กรุณาใส่ราคาต่อหน่วยมากกว่า 0`, fields: [...bad, `item.${i}`] };
    const m = merged.get(prod.id);
    if (m && m.price !== price) return { error: `"${prod.name}" อยู่ในรายการซ้ำด้วยราคาต่างกัน`, fields: [...bad, `item.${i}`] };
    merged.set(prod.id, { qty: (m?.qty ?? 0) + qty, price });
  }
  for (const [id, m] of merged) {
    const prod = byId.get(id)!;
    if (prod.trackStock && prod.stock < m.qty)
      return { error: `"${prod.name}" สต็อกไม่พอ (เหลือ ${prod.stock} ชิ้น) — รับของเข้าที่หน้าสต็อกก่อน หรือแก้จำนวน`, fields: bad };
    items.push({ productId: id, nameSnapshot: prod.name, priceSatang: m.price, qty: m.qty });
  }
  if (bad.length || !v.ok) return { error: errorText([...v.messages, ...tax.messages]), fields: bad };

  const s = await getSettings();
  const subtotalSatang = items.reduce((a, i) => a + i.priceSatang * i.qty, 0);
  let shippingSatang = 0;
  let shippingName = "รับสินค้าที่ร้าน";
  let shippingMethod: string = p.shipping;
  if (p.shipping === "custom") {
    shippingSatang = toSatang(p.shippingFee);
    if (Number.isNaN(shippingSatang)) return { error: "ค่าส่งไม่ถูกต้อง", fields: ["shippingFee"] };
    shippingName = "ค่าส่ง (กำหนดเอง)";
  } else if (!pickup) {
    shippingMethod = p.shipping === "express" && s.expressEnabled ? "express" : "std";
    shippingSatang = shippingFee(s, shippingMethod, subtotalSatang);
    shippingName = shippingMethod === "express" ? "ส่งด่วน" : "ส่งธรรมดา";
  }
  const source = ADMIN_SOURCES.includes(p.source) ? p.source : "อื่นๆ";
  const payMethod = ["โอนเงินผ่านธนาคาร", "QR PromptPay", "เงินสด", "อื่นๆ"].includes(String(p.payMethod)) ? String(p.payMethod) : "โอนเงินผ่านธนาคาร";
  const a = v.value;
  const data = {
    customerName: a.name, phone: phoneDigits(a.phone), email: a.email || null, addressLine: a.addr, subdistrict: a.sub, district: a.dist,
    province: a.prov, postalCode: a.zip, note: a.note || null,
    subtotalSatang, shippingMethod, shippingName, shippingSatang, totalSatang: subtotalSatang + shippingSatang,
    channel: "ADMIN", taxInvoice: tax.value ?? Prisma.DbNull,
  };

  let orderNo = "";
  let moves: StockResult[] = [];
  for (let attempt = 0; attempt < 10 && !orderNo; attempt++) {
    const no = makeOrderNo();
    try {
      moves = await prisma.$transaction(async (tx) => {
        const o = await tx.order.create({
          data: {
            ...data, orderNo: no, status: "AWAITING_SLIP", items: { create: items },
            events: { create: { type: "CREATED", note: `สร้างโดยแอดมิน · ลูกค้าสั่งทาง${source}`, adminId: admin.id } },
          },
        });
        // ผูกกับลูกค้า (เลือกไว้ หรือจับคู่ด้วยเบอร์โทร / สร้างใหม่)
        const chosen = p.customerId ? await tx.customer.findUnique({ where: { id: String(p.customerId) } }) : null;
        const c = chosen ?? (await customerFromOrder(tx, { ...o, customerId: null }));
        await tx.order.update({ where: { id: o.id }, data: { customerId: c.id } });
        if (!p.paid) return [];
        return (await confirmPaid(tx, no, ["AWAITING_SLIP"], admin.id, `ชำระแล้ว (${payMethod})${p.payNote ? ` — ${String(p.payNote).slice(0, 200)}` : ""}`)) ?? [];
      });
      orderNo = no;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  if (!orderNo) return { error: "สร้างเลขที่คำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่" };
  afterStock(moves, orderNo);
  await logAdmin(admin.id, "ORDER", `สร้างคำสั่งซื้อ ${orderNo} (ทาง${source}) ยอด ${bahtText(data.totalSatang)}${p.paid ? " · ชำระแล้ว" : " · รอชำระ"}`);
  redirect(`/admin?tab=ALL&open=${encodeURIComponent(orderNo)}&created=1`);
}

/** ค้นหาลูกค้าเดิม (ช่องเลือกลูกค้าในหน้าสร้างคำสั่งซื้อ) */
export async function findCustomers(q: string) {
  await requireAdmin();
  const t = String(q ?? "").trim().slice(0, 60);
  if (t.length < 2) return [];
  const digits = phoneDigits(t);
  const list = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: t, mode: "insensitive" } },
        { code: t },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }, { taxId: { contains: digits } }] : []),
      ],
    },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });
  return list.map((c) => ({
    id: c.id, code: c.code, name: c.name, phone: c.phone ?? "", email: c.email ?? "", addr: c.addressLine ?? "", sub: c.subdistrict ?? "",
    dist: c.district ?? "", prov: c.province ?? "", zip: c.postalCode ?? "", kind: c.kind, taxId: c.taxId ?? "", branch: c.branch ?? "",
  }));
}
