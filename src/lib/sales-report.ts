// ยอดขายสำหรับแดชบอร์ด / รายงาน / สรุปประจำวัน
// นับเฉพาะยอดที่ยืนยันแล้ว:
// - คำสั่งซื้อ (เว็บ + หลังร้าน) สถานะ "ชำระแล้ว" หรือ "จัดส่งแล้ว" ตามวันที่ยืนยันชำระ (paidAt) — ยกเลิก/คืนเงินแล้วไม่นับ
// - ใบเสร็จรับเงินที่ออกจากเอกสารขาย (ไม่ผูกกับคำสั่งซื้อ) ที่ไม่ถูกยกเลิก ตามวันที่ในใบเสร็จ — ใบเสร็จของคำสั่งซื้อไม่นับซ้ำ
import "server-only";
import { addDaysYmd, ymdBkk } from "@/lib/doc-calc";
import { prisma } from "@/lib/prisma";

export type Channel = "WEB" | "ADMIN" | "DOC";
export const CHANNEL_LABEL: Record<Channel, string> = {
  WEB: "หน้าเว็บ",
  ADMIN: "หลังร้าน (โทร/LINE/หน้าร้าน)",
  DOC: "ใบเสร็จจากเอกสารขาย",
};
export const channelOf = (c: string | null | undefined): Channel => (c === "ADMIN" ? "ADMIN" : "WEB");

export type SaleLine = { productId: string | null; sku: string; name: string; categoryId: string | null; categoryName: string; qty: number; amountSatang: number; installment?: boolean };
/** บรรทัด "รับชำระตามใบแจ้งหนี้ … (งวดที่ n)" ของใบเสร็จแบ่งงวด — เป็นเงินรับ ไม่ใช่สินค้า: รวมเป็นกลุ่มเดียว และไม่ขึ้นอันดับสินค้าขายดี */
export const INSTALLMENT_KEY = "installment";
const INSTALLMENT_LABEL = "รับชำระงวดตามใบแจ้งหนี้ (ไม่แยกสินค้า)";
export type Sale = { at: Date; day: string; month: string; channel: Channel; ref: string; totalSatang: number; shippingSatang: number; lines: SaleLine[]; discountSatang?: number };

const NO_CAT = "ไม่ระบุหมวด";

/** ยอดขายในช่วง [from, to) */
export async function salesBetween(from: Date, to: Date): Promise<Sale[]> {
  const [orders, receipts] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: ["PAID", "SHIPPED"] }, paidAt: { gte: from, lt: to } },
      select: {
        orderNo: true, paidAt: true, channel: true, totalSatang: true, shippingSatang: true, discountSatang: true,
        items: { select: { productId: true, nameSnapshot: true, priceSatang: true, qty: true, product: { select: { sku: true, categoryId: true, category: { select: { nameTh: true } } } } } },
      },
    }),
    prisma.salesDocument.findMany({
      where: { type: "RECEIPT", status: { notIn: ["VOID", "DRAFT"] }, docNo: { not: null }, orderId: null, issueDate: { gte: from, lt: to } },
      select: {
        docNo: true, issueDate: true, grandSatang: true, discountSatang: true,
        items: { select: { productId: true, sku: true, name: true, unit: true, qtyMilli: true, priceSatang: true, discountSatang: true, product: { select: { sku: true, isService: true, categoryId: true, category: { select: { nameTh: true } } } } } },
      },
    }),
  ]);
  const out: Sale[] = [];
  for (const o of orders) {
    const day = ymdBkk(o.paidAt!);
    out.push({
      at: o.paidAt!, day, month: day.slice(0, 7), channel: channelOf(o.channel), ref: o.orderNo, totalSatang: o.totalSatang, shippingSatang: o.shippingSatang, discountSatang: o.discountSatang,
      lines: o.items.map((i) => ({
        productId: i.productId, sku: i.product?.sku ?? "", name: i.nameSnapshot, categoryId: i.product?.categoryId ?? null,
        categoryName: i.product?.category.nameTh ?? NO_CAT, qty: i.qty, amountSatang: i.priceSatang * i.qty,
      })),
    });
  }
  for (const d of receipts) {
    const day = ymdBkk(d.issueDate!);
    let ship = 0;
    const lines: SaleLine[] = [];
    for (const i of d.items) {
      const amt = Math.round((i.qtyMilli * i.priceSatang) / 1000) - i.discountSatang;
      if (/^shipping$/i.test(i.sku ?? "")) {
        ship += amt;
        continue;
      }
      if (!i.productId && i.unit === "งวด") {
        lines.push({ productId: null, sku: "", name: INSTALLMENT_LABEL, categoryId: INSTALLMENT_KEY, categoryName: INSTALLMENT_LABEL, qty: i.qtyMilli / 1000, amountSatang: amt, installment: true });
        continue;
      }
      lines.push({
        productId: i.productId, sku: i.product?.sku ?? i.sku ?? "", name: i.name, categoryId: i.product?.categoryId ?? null,
        categoryName: i.product?.category.nameTh ?? NO_CAT, qty: i.qtyMilli / 1000, amountSatang: amt,
      });
    }
    out.push({ at: d.issueDate!, day, month: day.slice(0, 7), channel: "DOC", ref: d.docNo!, totalSatang: d.grandSatang, shippingSatang: ship, lines, discountSatang: d.discountSatang });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export const sumSales = (list: Sale[]) => ({ satang: list.reduce((s, x) => s + x.totalSatang, 0), count: list.length });

// ---------- การจัดกลุ่ม ----------

export type Bucket = { key: string; label: string; count: number; satang: number; qty?: number; sku?: string };

/** ยอดรายวัน/รายเดือน (เติมวันที่ไม่มียอดด้วย 0 ให้กราฟต่อเนื่อง) */
export function byPeriod(list: Sale[], fromYmd: string, toYmd: string, unit: "day" | "month"): Bucket[] {
  const map = new Map<string, Bucket>();
  if (unit === "day") {
    for (let d = fromYmd, guard = 0; d <= toYmd && guard < 800; d = addDaysYmd(d, 1), guard++) map.set(d, { key: d, label: d, count: 0, satang: 0 });
  } else {
    let [y, m] = fromYmd.slice(0, 7).split("-").map(Number);
    const end = toYmd.slice(0, 7);
    for (let guard = 0; guard < 120; guard++) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      if (k > end) break;
      map.set(k, { key: k, label: k, count: 0, satang: 0 });
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }
  for (const s of list) {
    const b = map.get(unit === "day" ? s.day : s.month);
    if (b) { b.count++; b.satang += s.totalSatang; }
  }
  return [...map.values()];
}

export function byProduct(list: Sale[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const s of list)
    for (const l of s.lines) {
      const key = l.installment ? INSTALLMENT_KEY : l.productId ?? `name:${l.name}`;
      const b = map.get(key) ?? { key, label: l.name, sku: l.sku, count: 0, satang: 0, qty: 0 };
      b.count++;
      b.qty = (b.qty ?? 0) + l.qty;
      b.satang += l.amountSatang;
      map.set(key, b);
    }
  return [...map.values()].sort((a, b) => b.satang - a.satang || (b.qty ?? 0) - (a.qty ?? 0));
}

export function byCategory(list: Sale[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const s of list)
    for (const l of s.lines) {
      const key = l.categoryId ?? "none";
      const b = map.get(key) ?? { key, label: l.categoryName, count: 0, satang: 0, qty: 0 };
      b.count++;
      b.qty = (b.qty ?? 0) + l.qty;
      b.satang += l.amountSatang;
      map.set(key, b);
    }
  return [...map.values()].sort((a, b) => b.satang - a.satang);
}

export function byChannel(list: Sale[]): Bucket[] {
  return (Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => {
    const l = list.filter((s) => s.channel === c);
    return { key: c, label: CHANNEL_LABEL[c], count: l.length, satang: l.reduce((a, s) => a + s.totalSatang, 0) };
  });
}

// ---------- ช่วงเวลา (เวลาไทย) ----------

export const todayYmd = () => ymdBkk(new Date());
/** วันจันทร์ของสัปดาห์ที่มีวันที่ ymd */
export function mondayOf(ymd: string) {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = อาทิตย์
  return addDaysYmd(ymd, -((dow + 6) % 7));
}
export const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;
export function prevMonthSameSpan(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(Math.min(d, last))}` };
}

// ---------- ตัวกรองหน้ารายงาน (อยู่ใน URL) ----------

export const PRESETS = { month: "เดือนนี้", lastMonth: "เดือนที่แล้ว", d7: "7 วัน", d30: "30 วัน", year: "ปีนี้", custom: "กำหนดเอง" } as const;
export type Preset = keyof typeof PRESETS;
export const VIEWS = { period: "ยอดตามช่วงเวลา", product: "ตามสินค้า", category: "ตามหมวด", channel: "ตามช่องทาง", list: "รายการขาย" } as const;
export type View = keyof typeof VIEWS;
export type ReportFilter = { preset: Preset; from: string; to: string; unit: "day" | "month"; view: View };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportFilter(sp: Record<string, string | string[] | undefined>): ReportFilter & { bad: boolean } {
  const today = todayYmd();
  const preset: Preset = one(sp.preset) in PRESETS ? (one(sp.preset) as Preset) : ymdRe.test(one(sp.from)) ? "custom" : "month";
  let from = monthStart(today), to = today;
  if (preset === "lastMonth") {
    const p = prevMonthSameSpan(today);
    from = p.from;
    to = addDaysYmd(monthStart(today), -1);
  } else if (preset === "d7") from = addDaysYmd(today, -6);
  else if (preset === "d30") from = addDaysYmd(today, -29);
  else if (preset === "year") from = `${today.slice(0, 4)}-01-01`;
  else if (preset === "custom") {
    from = ymdRe.test(one(sp.from)) ? one(sp.from) : from;
    to = ymdRe.test(one(sp.to)) ? one(sp.to) : to;
  }
  let bad = false;
  if (from > to) { bad = true; [from, to] = [to, from]; }
  // จำกัดช่วงไม่เกิน 3 ปี
  if (from < addDaysYmd(to, -1100)) { bad = true; from = addDaysYmd(to, -1100); }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const unit = one(sp.unit) === "month" || (one(sp.unit) !== "day" && days > 62) ? "month" : "day";
  const view: View = one(sp.view) in VIEWS ? (one(sp.view) as View) : "period";
  return { preset, from, to, unit, view, bad };
}

export function reportQuery(f: ReportFilter, patch: Partial<ReportFilter> = {}) {
  const v = { ...f, ...patch };
  const qs = new URLSearchParams();
  if (v.preset !== "month") qs.set("preset", v.preset);
  if (v.preset === "custom") { qs.set("from", v.from); qs.set("to", v.to); }
  if (v.view !== "period") qs.set("view", v.view);
  if (!("preset" in patch)) qs.set("unit", v.unit); // เปลี่ยนช่วงเวลา → ให้เลือกหน่วยวัน/เดือนอัตโนมัติ
  return `?${qs.toString()}`;
}

// ---------- รายงานภาษีขาย (ใบเสร็จรับเงิน/ใบกำกับภาษีที่คิด VAT) ----------

export type VatRow = { no: number; date: string; docNo: string; buyer: string; taxId: string; branch: string; baseSatang: number; vatSatang: number; totalSatang: number };

/** เดือน "YYYY-MM" (เวลาไทย) — ไม่รวมใบที่ยกเลิก (นับจำนวนไว้แจ้งในรายงาน) */
export async function vatReport(month: string) {
  const from = new Date(`${month}-01T00:00:00+07:00`);
  const [y, m] = month.split("-").map(Number);
  const to = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00+07:00`);
  const base = { type: "RECEIPT" as const, docNo: { not: null }, vatMode: { not: "NONE" as const }, issueDate: { gte: from, lt: to } };
  const [docs, voided] = await Promise.all([
    prisma.salesDocument.findMany({ where: { ...base, status: { notIn: ["VOID", "DRAFT"] } }, orderBy: [{ issueDate: "asc" }, { docNo: "asc" }] }),
    prisma.salesDocument.findMany({ where: { ...base, status: "VOID" }, select: { docNo: true } }),
  ]);
  const rows: VatRow[] = docs.map((d, i) => {
    const c = (d.customerSnapshot && typeof d.customerSnapshot === "object" ? d.customerSnapshot : {}) as { name?: string; taxId?: string; branch?: string; kind?: string };
    const taxId = String(c.taxId ?? "").replace(/\D/g, "");
    return {
      no: i + 1, date: ymdBkk(d.issueDate!), docNo: d.docNo!, buyer: c.name || "ลูกค้าทั่วไป", taxId,
      branch: taxId ? c.branch || (c.kind === "COMPANY" ? "สำนักงานใหญ่" : "") : "",
      baseSatang: d.grandSatang - d.vatSatang, vatSatang: d.vatSatang, totalSatang: d.grandSatang,
    };
  });
  const sum = rows.reduce((a, r) => ({ base: a.base + r.baseSatang, vat: a.vat + r.vatSatang, total: a.total + r.totalSatang }), { base: 0, vat: 0, total: 0 });
  return { rows, sum, voided: voided.map((v) => v.docNo!) };
}

/** ตารางสำหรับส่งออก CSV ตามมุมมองที่เลือก (ตัวเลขเงินเป็นบาท ทศนิยม 2 ตำแหน่ง) */
export function reportCsv(f: ReportFilter, list: Sale[]): unknown[][] {
  const b = (s: number) => (s / 100).toFixed(2);
  switch (f.view) {
    case "product":
      return [["อันดับ", "รหัสสินค้า", "ชื่อสินค้า", "จำนวน", "ยอดขาย (บาท)"], ...byProduct(list).map((r, i) => [i + 1, r.sku ?? "", r.label, r.qty ?? 0, b(r.satang)])];
    case "category":
      return [["หมวด", "จำนวนชิ้น", "ยอดขาย (บาท)"], ...byCategory(list).map((r) => [r.label, r.qty ?? 0, b(r.satang)])];
    case "channel":
      return [["ช่องทาง", "จำนวนรายการ", "ยอดขาย (บาท)"], ...byChannel(list).map((r) => [r.label, r.count, b(r.satang)])];
    case "list":
      return [
        ["วันที่", "เลขที่", "ช่องทาง", "จำนวนชิ้น", "ค่าส่ง (บาท)", "ยอดรวม (บาท)"],
        ...list.map((s) => [s.day, s.ref, CHANNEL_LABEL[s.channel], s.lines.reduce((a, l) => a + l.qty, 0), b(s.shippingSatang), b(s.totalSatang)]),
      ];
    default:
      return [[f.unit === "day" ? "วันที่" : "เดือน", "จำนวนรายการ", "ยอดขาย (บาท)"], ...byPeriod(list, f.from, f.to, f.unit).map((r) => [r.key, r.count, b(r.satang)])];
  }
}

/** เปอร์เซ็นต์เปลี่ยนแปลง (null = ช่วงก่อนเป็น 0) */
export const pctChange = (now: number, prev: number) => (prev ? ((now - prev) / prev) * 100 : null);

// ---------- กำไร (A22 — เจ้าของร้านเท่านั้น) ----------
// รายได้ = ยอดขายต่อบรรทัด (คำสั่งซื้อที่ชำระแล้ว/จัดส่งแล้ว + ใบเสร็จที่ไม่ผูกคำสั่งซื้อ ชุดเดียวกับรายงานยอดขาย)
//          หักส่วนลดท้ายบิล/คูปองตามสัดส่วนของแต่ละบรรทัด · ไม่รวมค่าส่ง
// ต้นทุน = Product.costSatang ณ ตอนดูรายงาน × จำนวน — สินค้าที่ยังไม่มีต้นทุน (หรือรายการที่ไม่ผูกสินค้า) แยกเป็น "ไม่ทราบต้นทุน"
//          และไม่นำมาคิดกำไร (กำไร/อัตรากำไร คิดจากบรรทัดที่ทราบต้นทุนเท่านั้น)

export const PROFIT_VIEWS = { product: "ตามสินค้า", category: "ตามหมวด", month: "ตามเดือน" } as const;
export type ProfitView = keyof typeof PROFIT_VIEWS;
export type ProfitBucket = {
  key: string; label: string; sku?: string; qty: number;
  revenueSatang: number; costSatang: number; profitSatang: number; // เฉพาะบรรทัดที่ทราบต้นทุน
  unknownQty: number; unknownRevenueSatang: number; // บรรทัดที่ไม่ทราบต้นทุน
};

/** ต้นทุนปัจจุบันของสินค้าในรายการขาย (null = ยังไม่ได้ตั้ง) */
export async function costsFor(list: Sale[]) {
  const ids = [...new Set(list.flatMap((s) => s.lines.map((l) => l.productId).filter((x): x is string => !!x)))];
  const rows = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, costSatang: true } }) : [];
  return new Map(rows.map((r) => [r.id, r.costSatang]));
}

/** บรรทัดขายพร้อมรายได้สุทธิหลังเฉลี่ยส่วนลดท้ายบิล */
function netLines(s: Sale) {
  const gross = s.lines.reduce((a, l) => a + l.amountSatang, 0);
  const disc = Math.min(s.discountSatang ?? 0, gross);
  let left = disc;
  return s.lines.map((l, i) => {
    const share = i === s.lines.length - 1 ? left : gross ? Math.round((disc * l.amountSatang) / gross) : 0;
    left -= share;
    return { ...l, net: l.amountSatang - share };
  });
}

export function profitBy(list: Sale[], costs: Map<string, number | null>, view: ProfitView): ProfitBucket[] {
  const map = new Map<string, ProfitBucket>();
  for (const s of list)
    for (const l of netLines(s)) {
      const key = view === "month" ? s.month : view === "category" ? l.categoryId ?? "none" : l.installment ? INSTALLMENT_KEY : l.productId ?? `name:${l.name}`;
      const label = view === "month" ? s.month : view === "category" ? l.categoryName : l.name;
      const b = map.get(key) ?? { key, label, sku: view === "product" ? l.sku : undefined, qty: 0, revenueSatang: 0, costSatang: 0, profitSatang: 0, unknownQty: 0, unknownRevenueSatang: 0 };
      const unit = l.productId ? costs.get(l.productId) : null;
      if (unit == null) {
        b.unknownQty += l.qty;
        b.unknownRevenueSatang += l.net;
      } else {
        const cost = Math.round(unit * l.qty);
        b.qty += l.qty;
        b.revenueSatang += l.net;
        b.costSatang += cost;
        b.profitSatang += l.net - cost;
      }
      map.set(key, b);
    }
  const rows = [...map.values()];
  return view === "month" ? rows.sort((a, b) => a.key.localeCompare(b.key)) : rows.sort((a, b) => b.profitSatang - a.profitSatang || b.unknownRevenueSatang - a.unknownRevenueSatang);
}

export const marginPct = (b: { revenueSatang: number; profitSatang: number }) => (b.revenueSatang ? (b.profitSatang / b.revenueSatang) * 100 : null);

export function profitTotals(rows: ProfitBucket[]) {
  return rows.reduce(
    (a, r) => ({ revenueSatang: a.revenueSatang + r.revenueSatang, costSatang: a.costSatang + r.costSatang, profitSatang: a.profitSatang + r.profitSatang, unknownRevenueSatang: a.unknownRevenueSatang + r.unknownRevenueSatang, unknownQty: a.unknownQty + r.unknownQty }),
    { revenueSatang: 0, costSatang: 0, profitSatang: 0, unknownRevenueSatang: 0, unknownQty: 0 },
  );
}

/** CSV รายงานกำไร (บาท ทศนิยม 2 ตำแหน่ง) */
export function profitCsv(view: ProfitView, rows: ProfitBucket[]): unknown[][] {
  const b = (s: number) => (s / 100).toFixed(2);
  const head = [view === "month" ? "เดือน" : view === "category" ? "หมวด" : "สินค้า", ...(view === "product" ? ["รหัสสินค้า"] : []), "จำนวน (ทราบต้นทุน)", "รายได้ (บาท)", "ต้นทุน (บาท)", "กำไร (บาท)", "อัตรากำไร (%)", "จำนวนที่ไม่ทราบต้นทุน", "รายได้ที่ไม่ทราบต้นทุน (บาท)"];
  return [
    head,
    ...rows.map((r) => {
      const m = marginPct(r);
      return [r.label, ...(view === "product" ? [r.sku ?? ""] : []), r.qty, b(r.revenueSatang), b(r.costSatang), b(r.profitSatang), m == null ? "" : m.toFixed(1), r.unknownQty, b(r.unknownRevenueSatang)];
    }),
  ];
}
