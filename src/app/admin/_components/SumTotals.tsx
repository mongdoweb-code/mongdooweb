// ยอดรวมตามตัวกรอง (ใช้ร่วมกัน: หน้ารายการเอกสารขาย + หน้าคำสั่งซื้อ)
// การ์ดสีเด่นมุมขวาบน (อยู่ในแถว KPI) · แถวรวมท้ายตาราง (ยอดเงินอยู่ใต้คอลัมน์ยอดรวม) · ปุ่มช่วงเวลาด่วน · ลูกศรเทียบช่วงก่อนหน้า
import Link from "next/link";
import { QUICK_RANGES, changeText, type Change, type QuickKey } from "@/lib/date-ranges";
import "./sum-totals.css";

export type SumTone = "blue" | "violet" | "green" | "teal" | "orange" | "red" | "gray";
export type SumView = {
  tone: SumTone;
  /** ป้ายตัวกรองที่ใช้อยู่ เช่น ["รอตอบรับ", "ต้องดำเนินการ"] (ว่าง = ทั้งหมด) */
  chips: string[];
  /** ป้ายในแถวท้ายตาราง: คำค้นแสดงเป็น "ผลการค้นหา" (แถวตารางจะได้ไม่มีเลขที่ซ้ำกับแถวข้อมูล) */
  rowChips: string[];
  label: string;
  amount: string;
  /** ตัวเลขประกอบ [ป้าย, ค่า] */
  stats: [string, string][];
  note: string;
  /** เทียบช่วงก่อนหน้า (มีเมื่อเลือกช่วงวันที่ครบทั้งเริ่มและสิ้นสุด) */
  cmp?: Change | null;
  /** ยอดเงินติดลบ = ยอดลดลงเป็นเรื่องดี (ใบลดหนี้) → สลับสีลูกศร */
  invertCmp?: boolean;
};

const SIGMA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 5H6l6 7-6 7h12" /></svg>
);
const Chips = ({ list }: { list: string[] }) => <span className="dsum-chips">{(list.length ? list : ["ทั้งหมด"]).map((c) => <i key={c}>{c}</i>)}</span>;

function Cmp({ c, invert, cls }: { c: Change; invert?: boolean; cls: string }) {
  const good = c.dir === "same" ? "same" : (c.dir === "up") !== !!invert ? "good" : "bad";
  return <span className={`${cls} cmp-${good}`} data-cmp={c.dir}>{changeText(c)}</span>;
}

/** การ์ดมุมขวาบน (อยู่ในแถว KPI) */
export function SumCard({ v }: { v: SumView }) {
  return (
    <section className={`kpi dsum dsum-${v.tone}`} aria-label={`ยอดรวม ${v.chips.join(" · ") || "ทั้งหมด"}`} data-doc-sum>
      <div className="dsum-top">
        <span className="dsum-ic">{SIGMA}</span>
        <span className="dsum-h">ยอดรวม</span>
        <Chips list={v.chips} />
      </div>
      <small className="dsum-lbl">{v.label}</small>
      <b className="num dsum-amt">{v.amount}</b>
      {v.cmp && <Cmp c={v.cmp} invert={v.invertCmp} cls="dsum-cmp" />}
      <dl className="dsum-stats">
        {v.stats.map(([k, x]) => (
          <div key={k}><dt>{k}</dt><dd className="num">{x}</dd></div>
        ))}
      </dl>
      <small className="dsum-note">{v.note}</small>
    </section>
  );
}

/**
 * แถวรวมท้ายตาราง: รวมหน้านี้ (ถ้ามีหลายหน้า) + ยอดรวมตามตัวกรอง
 * lead = จำนวนคอลัมน์ก่อนคอลัมน์ยอดรวม · trail = จำนวนคอลัมน์หลัง
 */
export function SumRows({ v, page, lead, trail, unit }: { v: SumView; page: { count: number; amount: string; note: string } | null; lead: number; trail: number; unit: string }) {
  return (
    <tfoot className="dsum-foot">
      {page && (
        <tr className="dsum-page">
          <td colSpan={lead}>รวมหน้านี้ <span className="sub-inline">· {page.count.toLocaleString("th-TH")} {unit}{page.note ? ` (${page.note})` : ""}</span></td>
          <td className="r num">{page.amount}</td>
          <td colSpan={trail} />
        </tr>
      )}
      <tr className={`dsum-row dsum-${v.tone}`} data-doc-sum-row>
        <td colSpan={lead}>
          <span className="dsum-row-h">
            <span className="dsum-ic">{SIGMA}</span>
            <b>ยอดรวม</b>
            <Chips list={v.rowChips} />
            {v.cmp && <Cmp c={v.cmp} invert={v.invertCmp} cls="dsum-row-cmp" />}
          </span>
          <span className="dsum-row-sub">{v.label} · {v.note}</span>
        </td>
        <td className="r num dsum-row-amt">{v.amount}</td>
        <td colSpan={trail} className="dsum-row-stats">
          {v.stats.map(([k, x]) => (
            <span key={k}><small>{k}</small><b className="num">{x}</b></span>
          ))}
        </td>
      </tr>
    </tfoot>
  );
}

/** ปุ่มช่วงเวลาด่วน — ลิงก์ล้วน (ใช้ได้โดยไม่มี JS) · href(k) ของ "all" = ล้างช่วงวันที่ */
export function QuickRanges({ active, href, custom, shown }: { active: QuickKey | "all" | "custom"; href: (k: QuickKey | "all") => string; custom?: React.ReactNode; shown?: string }) {
  return (
    <div className="rgq-bar" role="group" aria-label="ช่วงเวลา">
      <span className="rgq-l">ช่วงเวลา</span>
      {QUICK_RANGES.map(([k, l]) => (
        <Link key={k} className={`rgq${active === k ? " on" : ""}`} href={href(k)} aria-current={active === k ? "true" : undefined} data-range={k}>{l}</Link>
      ))}
      <Link className={`rgq${active === "all" ? " on" : ""}`} href={href("all")} aria-current={active === "all" ? "true" : undefined} data-range="all">ทั้งหมด</Link>
      {custom}
      {shown && <span className="rgq-shown">{shown}</span>}
    </div>
  );
}
