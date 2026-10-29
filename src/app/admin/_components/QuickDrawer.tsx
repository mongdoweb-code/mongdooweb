"use client";
// แผงแก้ไขด่วนเลื่อนออกจากด้านขวา — ใช้ร่วมกันหลายหน้า (สินค้า / หมวดหมู่)
// เปิดจากปุ่มในตาราง: <button data-qe-open='{"kind":"product",...}'> → host ของหน้านั้นรับข้อมูลไปแสดง (ไม่ต้องสร้าง client component ทุกแถว)
import { useEffect, useRef } from "react";

export function useQuickOpen<T>(kind: string, onOpen: (data: T) => void) {
  const cb = useRef(onOpen);
  useEffect(() => {
    cb.current = onOpen;
  });
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-qe-open]");
      if (!b) return;
      try {
        const d = JSON.parse(b.dataset.qeOpen!) as T & { kind: string };
        if (d.kind !== kind) return;
        e.preventDefault();
        cb.current(d);
      } catch {
        /* ข้อมูลเสีย — ไม่ทำอะไร */
      }
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [kind]);
}

export function QuickDrawer({ open, title, sub, onClose, children, footer }: { open: boolean; title: string; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    panel.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="qd" role="dialog" aria-modal="true" aria-label={title}>
      <div className="qd-bg" onClick={onClose} />
      <div className="qd-panel" ref={panel}>
        <div className="qd-head">
          <div>
            <span className="qd-kicker">⚡ แก้ไขด่วน</span>
            <h2>{title}</h2>
            {sub && <div className="qd-sub">{sub}</div>}
          </div>
          <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="qd-body">{children}</div>
        <div className="qd-foot">{footer}</div>
      </div>
    </div>
  );
}
