"use client";
// แถบเครื่องมือหน้าพิมพ์ใบสั่งซื้อ — ชื่อหน้า = เลขที่ PO (บันทึก PDF ได้ชื่อไฟล์ตามเลขที่)
import Link from "next/link";
import { useEffect } from "react";

export function PrintBar({ title, back, auto, hint = "ใบสั่งซื้อ A4" }: { title: string; back: string; auto: boolean; hint?: string }) {
  useEffect(() => {
    document.title = title;
    if (auto) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [title, auto]);
  return (
    <div className="pp-bar">
      <Link className="btn btn-outline btn-sm" href={back}>← กลับ</Link>
      <h1>{title}</h1>
      <span className="pp-hint">{hint}</span>
      <span className="sp" />
      <button className="btn btn-primary btn-sm" type="button" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</button>
    </div>
  );
}
