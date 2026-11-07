"use client";
// ปุ่ม "ตัวกรอง" เปิด/ปิดแผงตัวกรอง (ทุกขนาดจอ — ปิดไว้ก่อน เปิดเองเมื่อมีตัวกรองที่เลือกอยู่) — การเรียง/จำนวนต่อหน้า/มุมมองอยู่ที่ src/components/sort-toolbar
import { useId, useState } from "react";

export function FilterPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  // มีตัวกรองที่เลือกอยู่ = เปิดแผงไว้ให้เห็นว่ากรองอะไรอยู่
  const [open, setOpen] = useState(activeCount > 0);
  const id = useId();
  return (
    <div className="lst-filters" data-open={open ? "true" : undefined}>
      <button type="button" className="lst-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        ตัวกรอง{activeCount > 0 && <span className="lst-badge">{activeCount}</span>}
      </button>
      <div id={id} className="lst-panel" role="group" aria-label="กรองสินค้า">
        {children}
      </div>
    </div>
  );
}
