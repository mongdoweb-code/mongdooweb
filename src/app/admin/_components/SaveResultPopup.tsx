"use client";
// ป๊อปอัปแจ้งผลการบันทึก (กลางจอ): ✓ "บันทึกสำเร็จ" ปิดเองใน 3 วินาที (หยุดนับเมื่อชี้/โฟกัส) · ✕ "บันทึกไม่สำเร็จ" ค้างไว้จนกดปิด
// ปิดด้วย Esc / ปุ่มปิด · ไม่บังฟอร์ม · ไม่ดึงโฟกัสจากฟอร์มตอนสำเร็จ (พิมพ์ต่อได้ทันที) · ตอนผิดโฟกัสปุ่ม "แก้ไขช่องที่ผิด"
import { useEffect, useRef, useState } from "react";

export type SaveResult = { ok?: string; error?: string } | null | undefined;

/** เลขประจำผลแต่ละครั้ง (ใช้เป็น key ให้ป๊อปอัปเริ่มนับเวลาใหม่ทุกครั้งที่บันทึก) */
const ids = new WeakMap<object, number>();
let seq = 0;
const idOf = (o: object) => {
  if (!ids.has(o)) ids.set(o, ++seq);
  return ids.get(o)!;
};

export function SaveResultPopup(props: {
  /** ผลจาก server action — ทุกครั้งที่เป็น object ใหม่ = บันทึกครั้งใหม่ */
  result: SaveResult;
  /** ลิงก์ปุ่ม "ดูหน้าสินค้า" (ตอนสำเร็จ) */
  viewHref?: string;
  viewLabel?: string;
  /** ตอนผิด: ปุ่ม "แก้ไขช่องที่ผิด" */
  onFix?: () => void;
}) {
  const [closed, setClosed] = useState<SaveResult>(null);
  const r = props.result;
  if (!r || (!r.ok && !r.error) || closed === r) return null;
  const ok = !!r.ok && !r.error;
  return (
    <SavePopupCard key={idOf(r)} ok={ok} title={ok ? "บันทึกสำเร็จ" : "บันทึกไม่สำเร็จ"} message={(ok ? r.ok : r.error) ?? ""}
      viewHref={props.viewHref} viewLabel={props.viewLabel} onFix={props.onFix} onClose={() => setClosed(r)} />
  );
}

/** การ์ดป๊อปอัป (ใช้ร่วมกับ SaveCenter ที่แจ้งผลทุกเมนู) */
export function SavePopupCard({ ok, title, message, viewHref, viewLabel = "ดูหน้าสินค้า", onFix, onClose: close }: {
  ok: boolean;
  title: string;
  message: string;
  viewHref?: string;
  viewLabel?: string;
  /** ตอนผิด: ปุ่ม "แก้ไขช่องที่ผิด" (ไม่ส่ง = ปุ่ม "ตกลง" อย่างเดียว) */
  onFix?: () => void;
  onClose: () => void;
}) {
  const [left, setLeft] = useState(100);
  const paused = useRef(false);
  const fixBtn = useRef<HTMLButtonElement>(null);

  // สำเร็จ: นับถอยหลัง 3 วินาทีแล้วปิด (แถบเวลาด้านล่าง)
  useEffect(() => {
    if (!ok) return;
    const t = setInterval(() => {
      if (!paused.current) setLeft((x) => x - 100 / 30);
    }, 100);
    return () => clearInterval(t);
  }, [ok]);
  useEffect(() => {
    if (left <= 0) close();
  }, [left, close]);

  useEffect(() => {
    if (!ok) fixBtn.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [ok, close]);

  return (
    <div className="srp-back">
      <div
        className={`srp ${ok ? "ok" : "bad"}`}
        role={ok ? "status" : "alertdialog"}
        aria-live={ok ? "polite" : "assertive"}
        aria-labelledby="srp-t"
        aria-describedby={message ? "srp-d" : undefined}
        onMouseEnter={() => (paused.current = true)}
        onMouseLeave={() => (paused.current = false)}
        onFocus={() => (paused.current = true)}
        onBlur={() => (paused.current = false)}
      >
        <button type="button" className="srp-x" aria-label="ปิด" onClick={close}>✕</button>
        <span className="srp-ic" aria-hidden="true">
          {ok ? (
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="m15 27 7 7 15-16" /></svg>
          ) : (
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="m18 18 16 16M34 18 18 34" /></svg>
          )}
        </span>
        <h2 id="srp-t">{title}</h2>
        {message && <p id="srp-d">{message}</p>}
        <div className="srp-acts">
          {ok ? (
            <>
              {viewHref && <a className="btn btn-outline btn-sm" href={viewHref} target="_blank" rel="noopener">{viewLabel}</a>}
              <button type="button" className="btn btn-primary btn-sm" onClick={close}>ตกลง</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={close} ref={onFix ? undefined : fixBtn}>{onFix ? "ปิด" : "ตกลง"}</button>
              {onFix && <button ref={fixBtn} type="button" className="btn btn-primary btn-sm" onClick={() => { close(); onFix(); }}>แก้ไขช่องที่ผิด</button>}
            </>
          )}
        </div>
        {ok && <span className="srp-bar" style={{ width: `${Math.max(0, left)}%` }} aria-hidden="true" />}
      </div>
    </div>
  );
}
