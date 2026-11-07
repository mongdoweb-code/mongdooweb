"use client";
// แถบเลื่อนของ "หมวดยอดนิยม": ปัดนิ้ว/ลากแถบเลื่อน/ลูกศร + แถบบอกตำแหน่งด้านล่าง (ยาวตามสัดส่วนที่เห็น)
import { useCallback, useEffect, useRef, useState } from "react";

export function PopularRail({ children, label }: { children: React.ReactNode; label: string }) {
  const track = useRef<HTMLUListElement>(null);
  const [bar, setBar] = useState({ w: 100, x: 0, start: true, end: true });
  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const w = Math.min(100, (el.clientWidth / el.scrollWidth) * 100);
    setBar({ w, x: max > 0 ? (el.scrollLeft / max) * (100 - w) : 0, start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
  }, []);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); removeEventListener("resize", update); };
  }, [update]);
  const go = (d: 1 | -1) => track.current?.scrollBy({ left: d * track.current.clientWidth * 0.9, behavior: "smooth" });
  const scrollable = bar.w < 99.5;
  return (
    <div className="pc-rail">
      {scrollable && (
        <div className="pc-nav">
          <button type="button" onClick={() => go(-1)} disabled={bar.start} aria-label={`เลื่อน${label}ไปทางซ้าย`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <button type="button" onClick={() => go(1)} disabled={bar.end} aria-label={`เลื่อน${label}ไปทางขวา`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </div>
      )}
      <ul className="pc-track" ref={track} aria-label={label}>
        {children}
      </ul>
      {scrollable && (
        <div className="pc-progress" aria-hidden="true">
          <span style={{ width: `${bar.w}%`, transform: `translateX(${(bar.x / bar.w) * 100}%)` }} />
        </div>
      )}
    </div>
  );
}
