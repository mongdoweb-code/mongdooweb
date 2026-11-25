"use client";
// ช่วงวันที่ (แบบ A): 2 ช่องแคปซูลแยก "ตั้งแต่วันที่" → "ถึงวันที่" + จำนวนวัน — ใช้ทุกหน้าที่กรองตามช่วงวันที่
// · แสดงวันที่แบบไทย วว/ดด/ปปปป (พ.ศ. ตามตั้งค่าร้าน) + วันในสัปดาห์ ไม่ขึ้นกับภาษาของเบราว์เซอร์
// · ช่อง <input type="date"> จริงซ้อนโปร่งใสอยู่ใต้ตัวหนังสือ: คลิก/Enter เปิดปฏิทินของเบราว์เซอร์ · ชื่อช่อง (from/to) และ id เดิม ส่งไปกับฟอร์ม GET
// · เลือกวันแล้วกรองทันที (auto) · วันเริ่มหลังวันสิ้นสุด → ปรับวันสิ้นสุดตามให้ · × ล้างทีละช่อง
import { useRef, useState } from "react";
import "./date-range.css";

const WD = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export function thaiDate(ymd: string, era: "AD" | "BE" = "BE") {
  if (!ok(ymd)) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${era === "BE" ? Number(y) + 543 : y}`;
}
const weekday = (ymd: string) => (ok(ymd) ? WD[new Date(`${ymd}T00:00:00Z`).getUTCDay()] : "");
export const daysBetween = (a: string, b: string) => (ok(a) && ok(b) ? Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1 : 0);

const CAL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);

function DateBox({ id, name, label, value, era, min, max, required, onPick }: { id: string; name: string; label: string; value: string; era: "AD" | "BE"; min?: string; max?: string; required?: boolean; onPick: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const open = () => { try { ref.current?.showPicker(); } catch { ref.current?.focus(); } };
  return (
    <div className={`dr-box${value ? " has" : ""}`} data-date-box={name} onClick={open}>
      <label className="dr-lbl" htmlFor={id}>{label}</label>
      <span className="dr-val">
        {CAL}
        {value ? <><b data-date-text>{thaiDate(value, era)}</b><em>{weekday(value)}</em></> : <span className="dr-ph">เลือกวันที่</span>}
      </span>
      <input
        ref={ref}
        type="date"
        id={id}
        name={name}
        value={value}
        min={min}
        max={max}
        required={required}
        onChange={(e) => onPick(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      />
      {value && !required && (
        <button type="button" className="dr-x" aria-label={`ล้าง${label}`} onClick={(e) => { e.stopPropagation(); onPick(""); }}>×</button>
      )}
    </div>
  );
}

export function DateRange({
  from: from0 = "",
  to: to0 = "",
  era = "BE",
  fromId = "dFrom",
  toId = "dTo",
  fromName = "from",
  toName = "to",
  auto = true,
  required = false,
  max,
}: {
  from?: string; to?: string; era?: "AD" | "BE"; fromId?: string; toId?: string; fromName?: string; toName?: string;
  /** เลือกแล้วส่งฟอร์มทันที */
  auto?: boolean;
  /** ต้องมีทั้งสองวัน (รายงาน) — ไม่มีปุ่ม × */
  required?: boolean;
  max?: string;
}) {
  const [from, setFrom] = useState(from0);
  const [to, setTo] = useState(to0);
  const wrap = useRef<HTMLDivElement>(null);
  const submit = () => {
    if (!auto) return;
    // รอให้ค่าใหม่ลงช่องก่อน แล้วค่อยส่งฟอร์ม
    requestAnimationFrame(() => wrap.current?.closest("form")?.requestSubmit());
  };
  const pickFrom = (v: string) => {
    setFrom(v);
    if (v && to && v > to) setTo(v);
    if (!required || (v && to)) submit();
  };
  const pickTo = (v: string) => {
    setTo(v);
    if (v && from && v < from) setFrom(v);
    if (!required || (v && from)) submit();
  };
  const n = daysBetween(from, to);
  return (
    <div className="dr" role="group" aria-label="ช่วงวันที่" ref={wrap}>
      <DateBox id={fromId} name={fromName} label="ตั้งแต่วันที่" value={from} era={era} max={max} required={required} onPick={pickFrom} />
      <span className="dr-arrow" aria-hidden="true">→</span>
      <DateBox id={toId} name={toName} label="ถึงวันที่" value={to} era={era} min={from || undefined} max={max} required={required} onPick={pickTo} />
      {n > 0 && <span className="dr-days" data-range-days>{n.toLocaleString("th-TH")} วัน</span>}
    </div>
  );
}
