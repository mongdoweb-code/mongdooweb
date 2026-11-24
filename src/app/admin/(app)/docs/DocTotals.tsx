// ยอดรวมตามตัวกรองของหน้ารายการเอกสารขาย — การ์ดสีเด่นมุมขวาบน + แถวรวมท้ายตาราง (ใต้คอลัมน์ยอดรวม)
// ยอดเปลี่ยนตามแท็บสถานะ · สถานะงาน · คำค้น · ช่วงวันที่ (ทุกหน้า) · ไม่นับใบที่ยกเลิก ยกเว้นแท็บ "ยกเลิก"
import { money } from "@/lib/doc-calc";
import type { DocTypeT } from "@/lib/doc-calc";
import type { DocTotals } from "@/lib/doc-list";

export type SumTone = "blue" | "violet" | "green" | "teal" | "orange" | "red" | "gray";
export type SumView = {
  tone: SumTone;
  /** ป้ายตัวกรองที่ใช้อยู่ เช่น ["รอตอบรับ", "ต้องดำเนินการ"] (ว่าง = ทั้งหมด) */
  chips: string[];
  /** ป้ายในแถวท้ายตาราง: คำค้นแสดงเป็น "ผลการค้นหา" (แถวตารางจะได้ไม่มีเลขที่เอกสารซ้ำกับแถวข้อมูล) */
  rowChips: string[];
  label: string;
  amount: string;
  /** ตัวเลขประกอบ [ป้าย, ค่า] */
  stats: [string, string][];
  note: string;
};

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

export function sumView(type: DocTypeT, t: DocTotals, chips: string[], work: string, searching = false): SumView {
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
  };
}

const SIGMA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 5H6l6 7-6 7h12" /></svg>
);

/** การ์ดมุมขวาบน (อยู่ในแถว KPI) */
export function SumCard({ v }: { v: SumView }) {
  return (
    <section className={`kpi dsum dsum-${v.tone}`} aria-label={`ยอดรวม ${v.chips.join(" · ") || "ทั้งหมด"}`} data-doc-sum>
      <div className="dsum-top">
        <span className="dsum-ic">{SIGMA}</span>
        <span className="dsum-h">ยอดรวม</span>
        <span className="dsum-chips">{(v.chips.length ? v.chips : ["ทั้งหมด"]).map((c) => <i key={c}>{c}</i>)}</span>
      </div>
      <small className="dsum-lbl">{v.label}</small>
      <b className="num dsum-amt">{v.amount}</b>
      <dl className="dsum-stats">
        {v.stats.map(([k, x]) => (
          <div key={k}><dt>{k}</dt><dd className="num">{x}</dd></div>
        ))}
      </dl>
      <small className="dsum-note">{v.note}</small>
    </section>
  );
}

/** แถวรวมท้ายตาราง: รวมหน้านี้ (ถ้ามีหลายหน้า) + ยอดรวมตามตัวกรอง — 6 คอลัมน์เหมือนหัวตาราง */
export function SumRows({ v, page }: { v: SumView; page: { count: number; grand: number; neg: boolean } | null }) {
  return (
    <tfoot className="dsum-foot">
      {page && (
        <tr className="dsum-page">
          <td colSpan={3}>รวมหน้านี้ <span className="sub-inline">· {n(page.count)} ฉบับ (ไม่รวมใบที่ยกเลิก)</span></td>
          <td className="r num">{page.neg && page.grand > 0 ? "−" : ""}{money(page.grand)}</td>
          <td colSpan={2} />
        </tr>
      )}
      <tr className={`dsum-row dsum-${v.tone}`} data-doc-sum-row>
        <td colSpan={3}>
          <span className="dsum-row-h">
            <span className="dsum-ic">{SIGMA}</span>
            <b>ยอดรวม</b>
            <span className="dsum-chips">{(v.rowChips.length ? v.rowChips : ["ทั้งหมด"]).map((c) => <i key={c}>{c}</i>)}</span>
          </span>
          <span className="dsum-row-sub">{v.label} · {v.note}</span>
        </td>
        <td className="r num dsum-row-amt">{v.amount}</td>
        <td colSpan={2} className="dsum-row-stats">
          {v.stats.map(([k, x]) => (
            <span key={k}><small>{k}</small><b className="num">{x}</b></span>
          ))}
        </td>
      </tr>
    </tfoot>
  );
}
