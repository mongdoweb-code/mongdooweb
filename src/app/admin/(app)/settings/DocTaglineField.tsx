"use client";
// ข้อความท้ายเอกสาร (แถบกรอบล่างสุดของแผ่นสุดท้าย) — ใช้ข้อความเดียวกันทุกเอกสาร
// ตัวอย่างกว้างเท่าพื้นที่พิมพ์จริงบน A4 (184 มม.) ฟอนต์ 7.8pt · เกิน 1 บรรทัดจะเตือน (ยังพิมพ์ได้ ระบบแบ่งหน้าเผื่อความสูงให้)
import { useLayoutEffect, useRef, useState } from "react";
import { DOC_TAGLINE, DOC_TAGLINE_MAX } from "@/lib/doc-render";

export function DocTaglineField({ init, on: on0 }: { init: string | null; on: boolean }) {
  const [text, setText] = useState(init ?? DOC_TAGLINE);
  const [on, setOn] = useState(on0);
  const [lines, setLines] = useState(1);
  const pv = useRef<HTMLDivElement>(null);
  const shown = text.replace(/\s+/g, " ").trim() || DOC_TAGLINE;
  useLayoutEffect(() => {
    const e = pv.current;
    if (!e) return;
    const lh = parseFloat(getComputedStyle(e).lineHeight) || 1;
    const pad = parseFloat(getComputedStyle(e).paddingTop) + parseFloat(getComputedStyle(e).paddingBottom);
    setLines(Math.max(1, Math.round((e.getBoundingClientRect().height - pad - 2) / lh)));
  }, [shown, on]);
  return (
    <fieldset className="set-sign dtl" id="docTagline">
      <legend>ข้อความท้ายเอกสาร (ทุกเอกสาร)</legend>
      <label className="chk-row"><input type="checkbox" name="docTaglineOn" checked={on} onChange={(e) => setOn(e.target.checked)} /> แสดงแถบข้อความท้ายเอกสาร (ใบเสนอราคา · ใบแจ้งหนี้ · ใบเสร็จ · ใบลดหนี้ · ใบส่งของ)</label>
      <div className="field">
        <label htmlFor="docTaglineText">ข้อความ</label>
        <textarea id="docTaglineText" name="docTagline" rows={2} maxLength={DOC_TAGLINE_MAX} value={text} disabled={!on} onChange={(e) => setText(e.target.value)} />
        <div className="dtl-row">
          <small>{text.length}/{DOC_TAGLINE_MAX} ตัวอักษร · คั่นด้วย &quot; | &quot; ได้ · ปล่อยว่าง = ข้อความเดิม</small>
          {text.trim() !== DOC_TAGLINE && <button type="button" className="btn btn-outline btn-sm" onClick={() => setText(DOC_TAGLINE)} disabled={!on}>ใช้ข้อความเดิม</button>}
        </div>
      </div>
      {/* ซ่อนแล้วยังต้องส่งข้อความไปเก็บไว้ (textarea ที่ disabled ไม่ถูกส่ง) */}
      {!on && <input type="hidden" name="docTagline" value={text} />}
      <div className="dtl-pv-wrap" aria-label="ตัวอย่างบนเอกสาร">
        <span className="dtl-pv-l">ตัวอย่างบนเอกสาร (ขนาดจริงตามความกว้าง A4)</span>
        {on ? <div className="dtl-pv" ref={pv} data-tagline-preview>{shown}</div> : <div className="dtl-off">ไม่แสดงแถบข้อความท้ายเอกสาร</div>}
      </div>
      {on && lines > 1 && <small className="dtl-warn" role="status">ข้อความยาว {lines} บรรทัด — แนะนำให้สั้นลงให้อยู่ในบรรทัดเดียวจะดูเรียบร้อยกว่า</small>}
    </fieldset>
  );
}
