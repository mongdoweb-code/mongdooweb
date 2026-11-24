"use client";
// ซ่อน/แสดงใบที่ยกเลิกในรายการเอกสาร — สวิตช์เป็นลิงก์ (?void=show|hide) + จำค่าในคุกกี้ เปิดหน้าครั้งหน้า/ประเภทเอกสารอื่นก็ใช้ค่าเดิม
import Link from "next/link";
import type { ReactNode } from "react";

const COOKIE = "mdw_doc_void"; // = DOC_VOID_COOKIE ใน src/lib/doc-list.ts (ไฟล์นั้นเป็น server-only)
const remember = (show: boolean) => {
  try {
    document.cookie = `${COOKIE}=${show ? "show" : "hide"}; path=/admin; max-age=${365 * 864e2}; samesite=lax`;
  } catch {}
};

/** ลิงก์ที่เปลี่ยนค่าซ่อน/แสดง (จำค่าไว้ก่อนเปลี่ยนหน้า) */
export function VoidSetLink({ show, href, className = "link", children }: { show: boolean; href: string; className?: string; children: ReactNode }) {
  return (
    <Link className={className} href={href} onClick={() => remember(show)} data-void-set={show ? "show" : "hide"}>
      {children}
    </Link>
  );
}

/** สวิตช์ "แสดงใบที่ยกเลิก (n)" — มีผลกับแท็บ "ทั้งหมด" (แท็บสถานะอื่นไม่มีใบยกเลิกอยู่แล้ว) */
export function VoidToggle({ show, count, active, href, voidHref }: { show: boolean; count: number; active: boolean; href: string; voidHref: string }) {
  const tip = !active
    ? "แท็บนี้ไม่มีใบที่ยกเลิก — ค่านี้ใช้กับแท็บ “ทั้งหมด”"
    : show
      ? "กดเพื่อซ่อนใบที่ยกเลิกจากแท็บ “ทั้งหมด”"
      : "กดเพื่อแสดงใบที่ยกเลิกในแท็บ “ทั้งหมด” ด้วย";
  return (
    <span className="void-tg-wrap">
      <Link
        className={`void-tg${show ? " on" : ""}${active ? "" : " idle"}`}
        href={href}
        role="switch"
        aria-checked={show}
        aria-label={`แสดงใบที่ยกเลิก (${count} ฉบับ)`}
        title={tip}
        onClick={() => remember(!show)}
        data-void-toggle
      >
        <span className="void-sw" aria-hidden="true"><i /></span>
        <span className="void-lbl">{show ? "แสดงใบที่ยกเลิก" : "ซ่อนใบที่ยกเลิก"}</span>
        <em className="num">{count}</em>
      </Link>
      {count > 0 && (
        <Link className="void-only" href={voidHref}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></svg>ดูเฉพาะที่ยกเลิก</Link>
      )}
    </span>
  );
}
