// ส่วนคำนวณล้วนของรายงานยอดขาย/กำไร (ไม่มี import ฝั่ง server → ทดสอบหน่วยได้) — ใช้ผ่าน src/lib/sales-report.ts
export type Channel = "WEB" | "ADMIN" | "DOC";
export const CHANNEL_LABEL: Record<Channel, string> = {
  WEB: "หน้าเว็บ",
  ADMIN: "หลังร้าน (โทร/LINE/หน้าร้าน)",
  DOC: "ใบเสร็จจากเอกสารขาย",
};
export const channelOf = (c: string | null | undefined): Channel => (c === "ADMIN" ? "ADMIN" : "WEB");

export type SaleLine = {
  productId: string | null; sku: string; name: string; categoryId: string | null; categoryName: string; qty: number; amountSatang: number; installment?: boolean;
  /** ต้นทุนต่อหน่วย ณ วันที่ขาย (บันทึกตอนยืนยันชำระ/ออกใบเสร็จ) — null = รายการเก่า ใช้ต้นทุนปัจจุบันแทน */
  unitCostSatang?: number | null;
};
/** บรรทัด "รับชำระตามใบแจ้งหนี้ … (งวดที่ n)" ของใบเสร็จแบ่งงวด — เป็นเงินรับ ไม่ใช่สินค้า: รวมเป็นกลุ่มเดียว และไม่ขึ้นอันดับสินค้าขายดี */
export const INSTALLMENT_KEY = "installment";
export const INSTALLMENT_LABEL = "รับชำระงวดตามใบแจ้งหนี้ (ไม่แยกสินค้า)";
export type Sale = { at: Date; day: string; month: string; channel: Channel; ref: string; totalSatang: number; shippingSatang: number; lines: SaleLine[]; discountSatang?: number };

export const PROFIT_VIEWS = { product: "ตามสินค้า", category: "ตามหมวด", month: "ตามเดือน" } as const;
export type ProfitView = keyof typeof PROFIT_VIEWS;
export type ProfitBucket = {
  key: string; label: string; sku?: string; qty: number;
  revenueSatang: number; costSatang: number; profitSatang: number; // เฉพาะบรรทัดที่ทราบต้นทุน
  unknownQty: number; unknownRevenueSatang: number; // บรรทัดที่ไม่ทราบต้นทุน
};

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
      const unit = l.installment ? null : l.unitCostSatang ?? (l.productId ? costs.get(l.productId) : null);
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

