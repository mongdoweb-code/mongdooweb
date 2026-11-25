"use client";
// ข้อความท้ายเอกสาร (แถบล่างสุดของแผ่นสุดท้าย) — ข้อความเดียวกันทุกเอกสาร + เลือกรูปแบบ A/B/C
// ตัวอย่างแต่ละแบบกว้างเท่าพื้นที่พิมพ์จริงบน A4 (184 มม.) ใช้ HTML/CSS ชุดเดียวกับเอกสารจริง (taglineHtml + .sh-thanks)
// แบบที่เลือกเกิน 1 บรรทัดจะเตือน (ยังพิมพ์ได้ ระบบแบ่งหน้าเผื่อความสูงให้)
import { useLayoutEffect, useRef, useState } from "react";
import { DOC_TAGLINE, DOC_TAGLINE_MAX, DOC_TAGLINE_STYLES, isTaglineStyle, taglineHtml, type DocTaglineStyle } from "@/lib/doc-render";

const STYLES = Object.keys(DOC_TAGLINE_STYLES) as DocTaglineStyle[];

export function DocTaglineField({ init, on: on0, style: style0 }: { init: string | null; on: boolean; style: string }) {
  const [text, setText] = useState(init ?? DOC_TAGLINE);
  const [on, setOn] = useState(on0);
  const [style, setStyle] = useState<DocTaglineStyle>(isTaglineStyle(style0) ? style0 : "A");
  const [lines, setLines] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const shown = text.replace(/\s+/g, " ").trim() || DOC_TAGLINE;
  useLayoutEffect(() => {
    const e = box.current?.querySelector<HTMLElement>(`[data-style="${style}"] .sh-thanks`);
    if (!e) return;
    const cs = getComputedStyle(e);
    const lh = parseFloat(cs.lineHeight) || 1;
    const inner = e.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    setLines(Math.max(1, Math.round(inner / lh)));
  }, [shown, on, style]);
  return (
    <fieldset className="set-sign dtl" id="docTagline">
      <legend>ข้อความท้ายเอกสาร (ทุกเอกสาร)</legend>
      <label className="chk-row"><input type="checkbox" name="docTaglineOn" checked={on} onChange={(e) => setOn(e.target.checked)} /> แสดงแถบข้อความท้ายเอกสาร <span className="dtl-docs">(ใบเสนอราคา · ใบแจ้งหนี้ · ใบเสร็จ · ใบลดหนี้ · ใบส่งของ)</span></label>
      <div className="field dtl-text">
        <label htmlFor="docTaglineText">ข้อความ</label>
        <textarea id="docTaglineText" name="docTagline" rows={2} maxLength={DOC_TAGLINE_MAX} value={text} disabled={!on} onChange={(e) => setText(e.target.value)} />
        <div className="dtl-row">
          <small>{text.length}/{DOC_TAGLINE_MAX} ตัวอักษร · คั่นด้วย &quot; | &quot; · ปล่อยว่าง = ข้อความเดิม</small>
          {text.trim() !== DOC_TAGLINE && <button type="button" className="btn btn-outline btn-sm" onClick={() => setText(DOC_TAGLINE)} disabled={!on}>ใช้ข้อความเดิม</button>}
        </div>
      </div>
      {/* ซ่อนแถบแล้วยังส่งข้อความ/รูปแบบไปเก็บไว้ (textarea ที่ disabled ไม่ถูกส่ง) */}
      {!on && <input type="hidden" name="docTagline" value={text} />}
      <input type="hidden" name="docTaglineStyle" value={style} />
      {on ? (
        <div className="dtl-styles" ref={box} role="radiogroup" aria-label="รูปแบบแถบข้อความท้ายเอกสาร">
          <p className="dtl-h">รูปแบบแถบ <small>คลิกเพื่อเลือก · ตัวอย่างขนาดจริงตามความกว้าง A4</small></p>
          {STYLES.map((k) => (
            <label key={k} className={`dtl-opt${style === k ? " on" : ""}`} data-style={k}>
              <input type="radio" name="dtlStyle" value={k} checked={style === k} onChange={() => setStyle(k)} />
              <span className="dtl-name">
                <b>{k} · {DOC_TAGLINE_STYLES[k].label}</b>
                <small>{DOC_TAGLINE_STYLES[k].desc}</small>
              </span>
              <span className="dtl-paper" aria-hidden="true">
                <span className="dtl-strip" data-tagline-preview={k} dangerouslySetInnerHTML={{ __html: taglineHtml(shown, k) }} />
              </span>
            </label>
          ))}
          {lines > 1 && <small className="dtl-warn" role="status">แบบที่เลือกยาว {lines} บรรทัด — แนะนำให้ข้อความสั้นลงให้อยู่ในบรรทัดเดียวจะดูเรียบร้อยกว่า</small>}
        </div>
      ) : (
        <div className="dtl-off">ไม่แสดงแถบข้อความท้ายเอกสาร (ข้อความและรูปแบบยังเก็บไว้ เปิดอีกครั้งได้)</div>
      )}
    </fieldset>
  );
}
