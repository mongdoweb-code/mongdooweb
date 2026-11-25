"use client";
// ป้ายบนการ์ดสินค้า (หลายป้าย): พิมพ์แล้ว Enter เพื่อเพิ่ม · ลาก ⠿ หรือปุ่ม ‹ › เพื่อเรียง · เลือกสีทีละป้าย · × ลบ · ปุ่มป้ายที่ใช้บ่อย
// ส่งค่าเป็น JSON ใน <input name="badges"> (server ตรวจซ้ำด้วย parseBadges)
import { useRef, useState } from "react";
import "./badges.css";
import { BADGE_COLORS, BADGE_COLOR_KEYS, BADGE_MAX, BADGE_SUGGEST, BADGE_TEXT_MAX, parseBadges, type Badge, type BadgeColor } from "@/lib/badges";

export function BadgesEditor({ init, id = "badges", suggest = [] }: { init: Badge[]; id?: string; suggest?: string[] }) {
  const [list, setList] = useState<Badge[]>(init);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const drag = useRef<number | null>(null);
  const full = list.length >= BADGE_MAX;

  const add = (t: string, c: BadgeColor = "orange") => {
    const next = parseBadges([...list, { t, c }]);
    if (next.length === list.length) setMsg(full ? `ใส่ได้สูงสุด ${BADGE_MAX} ป้าย` : "มีป้ายนี้แล้ว");
    else { setMsg(""); setList(next); }
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const n = [...list];
    const [x] = n.splice(from, 1);
    n.splice(to, 0, x);
    setList(n);
  };
  const pool = [...new Set([...BADGE_SUGGEST, ...suggest])].filter((s) => !list.some((b) => b.t.toLowerCase() === s.toLowerCase())).slice(0, 14);

  return (
    <div className="bge">
      {/* ข้อความที่พิมพ์ค้างไว้ (ยังไม่กด Enter) ก็ถูกบันทึกด้วย */}
      <input type="hidden" name="badges" value={JSON.stringify(text.trim() ? parseBadges([...list, { t: text, c: "orange" }]) : list)} />
      <div className="bge-box" onClick={(e) => { if (e.target === e.currentTarget) (e.currentTarget.querySelector("input[type=text]") as HTMLInputElement | null)?.focus(); }}>
        {list.map((b, i) => (
          <span
            key={b.t}
            className="bge-chip"
            draggable
            onDragStart={() => { drag.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (drag.current != null) move(drag.current, i); drag.current = null; }}
            data-badge-chip={b.t}
          >
            <span className="bge-drag" aria-hidden="true" title="ลากเพื่อเรียง">⠿</span>
            <span className={`bge-pill bc-${b.c}`}>{b.t}</span>
            <label className="sr-only" htmlFor={`${id}-c${i}`}>สีป้าย {b.t}</label>
            <select id={`${id}-c${i}`} value={b.c} onChange={(e) => setList(list.map((x, k) => (k === i ? { ...x, c: e.target.value as BadgeColor } : x)))}>
              {BADGE_COLOR_KEYS.map((c) => <option key={c} value={c}>{BADGE_COLORS[c].label}</option>)}
            </select>
            <button type="button" className="bge-mv" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`เลื่อน ${b.t} ไปก่อน`}>‹</button>
            <button type="button" className="bge-mv" onClick={() => move(i, i + 1)} disabled={i === list.length - 1} aria-label={`เลื่อน ${b.t} ไปหลัง`}>›</button>
            <button type="button" className="bge-x" onClick={() => setList(list.filter((_, k) => k !== i))} aria-label={`ลบป้าย ${b.t}`}>×</button>
          </span>
        ))}
        {!full && (
          <input
            type="text"
            id={id}
            value={text}
            maxLength={BADGE_TEXT_MAX}
            placeholder={list.length ? "เพิ่มป้าย แล้วกด Enter" : "พิมพ์ป้าย แล้วกด Enter (เช่น 3000K)"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                if (text.trim()) { add(text); setText(""); }
              } else if (e.key === "Backspace" && !text && list.length) setList(list.slice(0, -1));
            }}
            onBlur={() => { if (text.trim()) { add(text); setText(""); } }}
          />
        )}
      </div>
      {msg && <small className="bge-msg" role="status">{msg}</small>}
      {!full && pool.length > 0 && (
        <div className="bge-sugg">
          <span>ใช้บ่อย:</span>
          {pool.map((s) => <button key={s} type="button" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
      <small className="bge-hint">สูงสุด {BADGE_MAX} ป้าย ป้ายละไม่เกิน {BADGE_TEXT_MAX} ตัวอักษร · ป้าย “ลด xx%” ระบบใส่ให้เองเป็นลำดับแรก · การจัดวาง/ทรง/ความทึบ ตั้งที่ ตั้งค่าร้าน → ป้ายบนการ์ดสินค้า</small>
    </div>
  );
}
