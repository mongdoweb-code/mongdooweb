"use client";
// ปุ่ม "สร้างรูปย่อใหม่" — เรียก server ทีละชุด (6 รูป) จนครบ พร้อมแถบความคืบหน้า (ไม่ติด timeout ของคำขอเดียว)
import { useRef, useState } from "react";
import { regenerateAction } from "./actions";

export function RegenButton({ total }: { total: number }) {
  const [state, setState] = useState<{ done: number; total: number; created: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  const run = async (force: boolean) => {
    setBusy(true);
    stop.current = false;
    let offset = 0, created = 0;
    const errors: string[] = [];
    setState({ done: 0, total, created: 0, errors: [] });
    try {
      for (;;) {
        const r = await regenerateAction(offset, force);
        created += r.created;
        errors.push(...r.errors);
        offset = r.next;
        setState({ done: offset, total: r.total, created, errors: [...errors] });
        if (offset >= r.total || stop.current) break;
      }
    } finally {
      setBusy(false);
    }
  };
  const pct = state && state.total ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <div className="regen" id="regenBox">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(false)} id="regenMissing">สร้างรูปย่อใหม่ (เฉพาะที่ยังไม่มี)</button>
        <button className="btn btn-outline" type="button" disabled={busy} onClick={() => run(true)}>สร้างใหม่ทั้งหมด</button>
        {busy && <button className="btn btn-outline" type="button" onClick={() => (stop.current = true)}>หยุด</button>}
      </div>
      {state && (
        <div className="regen-prog" role="status" aria-live="polite">
          <div className="l3-bar"><i style={{ width: `${pct}%` }} /></div>
          <span id="regenStatus">{busy ? "กำลังสร้าง…" : state.done >= state.total ? "เสร็จแล้ว" : "หยุดแล้ว"} {state.done}/{state.total} รูป · สร้างไฟล์ {state.created} ไฟล์{state.errors.length ? ` · ผิดพลาด ${state.errors.length}` : ""}</span>
          {state.errors.length > 0 && <ul className="l3-note">{state.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
