"use client";
// ส่วนควบคุมของรายการสินค้าที่ต้องใช้ JS: เลือกการเรียงลำดับ (เปลี่ยนแล้วไปหน้าใหม่ทันที)
// และปุ่มเปิด/ปิดแผงตัวกรองบนมือถือ (เดสก์ท็อปแสดงตลอด)
import { useId, useState } from "react";

export function SortSelect({ value, options }: { value: string; options: { value: string; label: string; href: string }[] }) {
  const id = useId();
  return (
    <div className="lst-sort">
      <label htmlFor={id}>เรียงตาม</label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const o = options.find((x) => x.value === e.target.value);
          // ไปหน้าใหม่แบบลิงก์ธรรมดา → เพิ่มประวัติให้กดย้อนกลับได้
          if (o) window.location.assign(o.href);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
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
