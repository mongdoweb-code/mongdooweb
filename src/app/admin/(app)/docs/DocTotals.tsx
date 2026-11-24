// ยอดรวมตามตัวกรองของหน้ารายการเอกสารขาย → SumView (แสดงด้วย SumCard / SumRows ใน _components/SumTotals)
// ยอดเปลี่ยนตามแท็บสถานะ · สถานะงาน · คำค้น · ช่วงวันที่ (ทุกหน้า) · ไม่นับใบที่ยกเลิก ยกเว้นแท็บ "ยกเลิก"
import { money } from "@/lib/doc-calc";
import type { DocTypeT } from "@/lib/doc-calc";
import type { DocTotals } from "@/lib/doc-list";
import type { Change } from "@/lib/date-ranges";
import type { SumTone, SumView } from "../../_components/SumTotals";

const TYPE_TONE: Record<DocTypeT, SumTone> = { QUOTATION: "blue", INVOICE: "violet", RECEIPT: "green", CREDIT_NOTE: "red", DELIVERY: "teal" };
const AMOUNT_LABEL: Record<DocTypeT, string> = {
  QUOTATION: "มูลค่าใบเสนอราคารวม",
  INVOICE: "ยอดใบแจ้งหนี้รวม",
  RECEIPT: "ยอดรับเงินรวม",
  CREDIT_NOTE: "ยอดลดหนี้ / คืนเงินรวม",
  DELIVERY: "มูลค่าสินค้าที่ส่งรวม",
};
const n = (x: number) => x.toLocaleString("th-TH");
const qty = (milli: number) => (milli / 1000).toLocaleString("th-TH", { maximumFractionDigits: 3 });

export function sumView(type: DocTypeT, t: DocTotals, chips: string[], work: string, searching = false, cmp: Change | null = null): SumView {
  const tone: SumTone = t.voidTab ? "gray" : type === "CREDIT_NOTE" ? "red" : work === "done" ? "green" : work === "todo" ? "orange" : TYPE_TONE[type];
  const neg = type === "CREDIT_NOTE" && !t.voidTab && t.grand > 0 ? "−" : "";
  const stats: [string, string][] = [["จำนวน", `${n(t.count)} ฉบับ`]];
  if (type === "INVOICE" && !t.voidTab) stats.push(["ชำระแล้ว", `฿${money(t.paid)}`], ["ค้างชำระ", `฿${money(Math.max(0, t.grand - t.paid))}`]);
  else if (type === "DELIVERY") stats.push(["จำนวนสินค้า", `${qty(t.qtyMilli)} หน่วย`]);
  else stats.push(["เฉลี่ยต่อฉบับ", t.count ? `฿${money(Math.round(t.grand / t.count))}` : "—"]);
  if (t.vat > 0 && type !== "INVOICE") stats.push(["ภาษีมูลค่าเพิ่ม", `฿${money(t.vat)}`]);
  return {
    tone,
    chips,
    rowChips: searching ? [...chips.slice(0, -1), "ผลการค้นหา"] : chips,
    label: t.voidTab ? "ยอดของใบที่ยกเลิก" : AMOUNT_LABEL[type],
    amount: `${neg}฿${money(t.grand)}`,
    stats,
    note: t.voidTab ? "ไม่นับเป็นยอดขาย" : t.voidSkipped ? `ไม่รวมใบที่ยกเลิก ${n(t.voidSkipped)} ฉบับ` : "รวมทุกหน้าตามตัวกรอง",
    cmp: t.voidTab ? null : cmp,
    invertCmp: type === "CREDIT_NOTE",
  };
}
