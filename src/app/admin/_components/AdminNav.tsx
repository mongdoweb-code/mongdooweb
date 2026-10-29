"use client";
// เมนูด้านข้างหลังบ้าน — ไฮไลต์เมนูของหน้าปัจจุบัน
// locked: บัญชีที่ต้องเปลี่ยนรหัสผ่านก่อน แสดงเฉพาะ "บัญชีของฉัน"
// ?denied=1 (พนักงานเปิดหน้าของเจ้าของร้าน) → แสดงแถบแจ้งเตือนชั่วคราว
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** สีประจำกลุ่มเมนู — แถบหัวข้อ + สีไอคอนในกลุ่ม ช่วยให้แยกส่วนได้ด้วยตา */
const GROUP_COLOR: Record<string, string> = {
  "งานประจำวัน": "#F26B38",
  "สินค้าและหน้าร้าน": "#2EBD7A",
  "เนื้อหาและ SEO": "#4C9AFF",
  "เอกสารขาย": "#A78BFA",
  "รายงาน": "#F5B731",
  "ระบบ": "#8FA3B8",
};

export type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number; group?: string; external?: boolean; ownerOnly?: boolean };

function DeniedToast() {
  const path = usePathname();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("denied") !== "1") return;
    // อ่านค่าจาก URL ได้หลัง mount เท่านั้น (หน้าแรกของหลังบ้านเรนเดอร์ฝั่ง server โดยไม่รู้พารามิเตอร์นี้)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
    const t = setTimeout(() => setShow(false), 8000);
    return () => clearTimeout(t);
  }, [path]);
  if (!show) return null;
  // วาดที่ body (เมนูด้านข้างบนมือถือถูกเลื่อนออกนอกจอ)
  return createPortal(
    <div className="toast-denied" role="alert">
      หน้านี้สำหรับเจ้าของร้าน (OWNER) เท่านั้น — ขอสิทธิ์จากเจ้าของร้านถ้าต้องการใช้งาน
      <button type="button" className="icon-btn sm" aria-label="ปิด" onClick={() => setShow(false)}>
        ✕
      </button>
    </div>,
    document.body,
  );
}

export function AdminNav({ items, locked = false }: { items: NavItem[]; locked?: boolean }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  const list = locked ? items.filter((it) => it.href === "/admin/account") : items;
  return (
    <nav>
      <DeniedToast />
      {locked && <div className="nav-lock">ตั้งรหัสผ่านใหม่ก่อน จึงจะใช้เมนูอื่นได้</div>}
      {list.map((it, i) => {
        const prevGroup = list.slice(0, i).reverse().find((x) => x.group)?.group;
        const group = it.group ?? prevGroup; // รายการที่ไม่มี group อยู่ใต้หัวข้อก่อนหน้า
        const color = group ? GROUP_COLOR[group] : undefined;
        const tint = color ? ({ "--g": color } as React.CSSProperties) : undefined;
        const head =
          it.group && it.group !== prevGroup ? (
            it.group === "—" ? (
              <div key={`g-${it.href}`} className="nav-sep" role="separator" />
            ) : (
              <div key={`g-${it.href}`} className="nav-grp" style={tint}>
                {it.group}
              </div>
            )
          ) : null;
        const on = !it.external && active(it.href);
        const body = (
          <>
            {it.icon}
            {it.label} {it.badge ? <span className="badge">{it.badge}</span> : null}
          </>
        );
        return (
          <span key={it.href} style={{ display: "contents" }}>
            {head}
            {it.external ? (
              <a className="nav-i" href={it.href} target="_blank" rel="noopener" style={tint}>
                {body}
              </a>
            ) : (
              <Link className={`nav-i${on ? " on" : ""}`} style={tint} href={it.href} aria-current={on ? "page" : undefined} onClick={() => document.getElementById("side")?.classList.remove("open")}>
                {body}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
