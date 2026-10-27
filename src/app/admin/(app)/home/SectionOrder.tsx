"use client";
// จัดลำดับ/แสดง-ซ่อนส่วนของหน้าแรก (ปุ่มขึ้น/ลง — ใช้คีย์บอร์ดได้) แล้วส่งเป็น JSON
import { useState } from "react";

type Row = { key: string; label: string; show: boolean };

export function SectionOrder({ rows, action }: { rows: Row[]; action: (f: FormData) => Promise<void> }) {
  const [list, setList] = useState(rows);
  const move = (i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
    setList(next);
  };
  return (
    <form action={action} id="sectionsForm">
      <input type="hidden" name="sections" value={JSON.stringify(list.map(({ key, show }) => ({ key, show })))} />
      <ol className="l10-order" aria-label="ลำดับส่วนของหน้าแรก">
        {list.map((r, i) => (
          <li key={r.key} className={r.show ? "" : "off"} data-key={r.key}>
            <span className="n">{i + 1}</span>
            <label className="switch-lbl" style={{ color: "var(--c-ink)" }}>
              <input
                type="checkbox"
                checked={r.show}
                disabled={r.key === "slides"}
                onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, show: e.target.checked } : x)))}
              />
              {r.label}
            </label>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`เลื่อน “${r.label}” ขึ้น`}>
              ↑
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`เลื่อน “${r.label}” ลง`}>
              ↓
            </button>
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="submit">บันทึกลำดับหน้าแรก</button>
      </p>
    </form>
  );
}
