"use client";
// ปุ่มสลับธีมหลังบ้าน: สว่าง / มืด / ตามเครื่อง — เก็บในคุกกี้ mdw_admin_theme (1 ปี) และเปลี่ยนทันทีไม่ต้องโหลดหน้า
// "ตามเครื่อง" ติดตามการเปลี่ยนโหมดของระบบปฏิบัติการแบบสด · สคริปต์ตั้งค่าเริ่มต้นก่อนแสดงหน้าอยู่ใน admin/layout.tsx
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";
const COOKIE = "mdw_admin_theme";
const MQ = "(prefers-color-scheme: dark)";

const readMode = (): ThemeMode => {
  const m = /(?:^|; )mdw_admin_theme=(light|dark|system)/.exec(document.cookie)?.[1];
  return (m as ThemeMode) ?? "system";
};
/** ตั้งธีมจริงบน <html> */
export function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && matchMedia(MQ).matches);
  const h = document.documentElement;
  h.dataset.admTheme = dark ? "dark" : "light";
  h.dataset.admMode = mode;
}

// ร้านค้าภายนอก (คุกกี้) ให้ React อ่านค่าโดยไม่ต้อง setState ใน effect
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const setMode = (mode: ThemeMode) => {
  document.cookie = `${COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
  applyTheme(mode);
  listeners.forEach((fn) => fn());
};

const SunIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>;
const MoonIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>;
const AutoIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></svg>;
const OPTS: [ThemeMode, string, () => React.JSX.Element][] = [["light", "สว่าง", SunIcon], ["dark", "มืด", MoonIcon], ["system", "ตามเครื่อง", AutoIcon]];

export function ThemeToggle({ className = "" }: { className?: string }) {
  const mode = useSyncExternalStore(subscribe, readMode, () => "system" as ThemeMode);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // โหมดตามเครื่อง: ระบบเปลี่ยนมืด/สว่าง → ตามทันที
  useEffect(() => {
    const mq = matchMedia(MQ);
    const on = () => { if (readMode() === "system") applyTheme("system"); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("mousedown", out);
    addEventListener("keydown", esc);
    return () => { removeEventListener("mousedown", out); removeEventListener("keydown", esc); };
  }, [open]);
  const Cur = OPTS.find(([k]) => k === mode)?.[2] ?? AutoIcon;
  const label = OPTS.find(([k]) => k === mode)?.[1] ?? "ตามเครื่อง";
  return (
    <div className={`thm ${className}`} ref={box}>
      <button type="button" className="thm-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`ธีม: ${label} (เปลี่ยนธีม)`} title={`ธีม: ${label}`} onClick={() => setOpen((o) => !o)}>
        <Cur />
      </button>
      {open && (
        <div className="thm-menu" role="menu" aria-label="เลือกธีม">
          {OPTS.map(([k, l, I]) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={mode === k} onClick={() => { setMode(k); setOpen(false); }}>
              <I />{l}{k === "system" && <small>ตามระบบ</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
