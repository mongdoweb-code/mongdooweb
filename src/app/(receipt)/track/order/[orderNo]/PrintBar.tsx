"use client";
// แถบเครื่องมือใบสั่งซื้อ: พิมพ์ / บันทึก PDF (ชื่อไฟล์ = เลขที่คำสั่งซื้อ)
import { useEffect } from "react";

export function PrintBar({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <>
      <div className="pp-bar">
        <a className="btn btn-outline btn-sm" href={`/track?no=${encodeURIComponent(title)}`}>← ติดตามคำสั่งซื้อ</a>
        <h1>ใบสั่งซื้อ {title}</h1>
        <span className="sp" />
        <button className="btn btn-primary btn-sm" type="button" onClick={() => window.print()} id="printOrder">พิมพ์ / บันทึก PDF</button>
      </div>
      <p className="pp-hint" style={{ padding: "8px 16px 0", textAlign: "center" }}>
        กด “พิมพ์ / บันทึก PDF” แล้วเลือก “บันทึกเป็น PDF” — ชื่อไฟล์จะเป็น {title}.pdf
      </p>
    </>
  );
}
