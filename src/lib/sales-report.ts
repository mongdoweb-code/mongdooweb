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

export type SaleLine = { productId: string | null; sku: string; name: string; categoryId: string | null; categoryName: string; qty: number; amountSatang: number };
export type Sale = { at: Date; day: string; month: string; channel: Channel; ref: string; totalSatang: number; shippingSatang: number; lines: SaleLine[] };

const NO_CAT = "ไม่ระบุหมวด";

/** ยอดขายในช่วง [from, to) */
export async function salesBetween(from: Date, to: Date): Promise<Sale[]> {
  const [orders, receipts] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: ["PAID", "SHIPPED"] }, paidAt: { gte: from, lt: to } },
      select: {
        orderNo: true, paidAt: true, channel: true, totalSatang: true, shippingSatang: true,
        items: { select: { productId: true, nameSnapshot: true, priceSatang: true, qty: true, product: { select: { sku: true, categoryId: true, category: { select: { nameTh: true } } } } } },
      },
    }),
    prisma.salesDocument.findMany({
      where: { type: "RECEIPT", status: { notIn: ["VOID", "DRAFT"] }, docNo: { not: null }, orderId: null, issueDate: { gte: from, lt: to } },
      select: {
        docNo: true, issueDate: true, grandSatang: true,
        items: { select: { productId: true, sku: true, name: true, qtyMilli: true, priceSatang: true, discountSatang: true, product: { select: { sku: true, isService: true, categoryId: true, category: { select: { nameTh: true } } } } } },
      },
    }),
  ]);
  const out: Sale[] = [];
  for (const o of orders) {
    const day = ymdBkk(o.paidAt!);
    out.push({
      at: o.paidAt!, day, month: day.slice(0, 7), channel: channelOf(o.channel), ref: o.orderNo, totalSatang: o.totalSatang, shippingSatang: o.shippingSatang,
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
      lines.push({
        productId: i.productId, sku: i.product?.sku ?? i.sku ?? "", name: i.name, categoryId: i.product?.categoryId ?? null,
        categoryName: i.product?.category.nameTh ?? NO_CAT, qty: i.qtyMilli / 1000, amountSatang: amt,
      });
    }
    out.push({ at: d.issueDate!, day, month: day.slice(0, 7), channel: "DOC", ref: d.docNo!, totalSatang: d.grandSatang, shippingSatang: ship, lines });
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
      const key = l.productId ?? `name:${l.name}`;
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

/** เปอร์เซ็นต์เปลี่ยนแปลง (null = ช่วงก่อนเป็น 0) */
export const pctChange = (now: number, prev: number) => (prev ? ((now - prev) / prev) * 100 : null);
