"use client";
// แถบเครื่องมือของใบเสร็จฝั่งลูกค้า: พิมพ์ / บันทึก PDF (ชื่อไฟล์ = เลขที่เอกสาร) — ใช้ DocSheets ของหลังบ้าน (อ่านอย่างเดียว)
import { useEffect, useState } from "react";
import type { DocView } from "@/lib/doc-render";
import { DocSheets } from "@/app/admin/_components/DocSheets";

export function CustomerDoc({ view, voided }: { view: DocView; voided: boolean }) {
  const [pages, setPages] = useState(0);
  const title = view.no ?? "ใบเสร็จรับเงิน";
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <div className="pp">
      <style>{"@page{size:A4;margin:0}"}</style>
      <div className="pp-bar">
        {/* โหลดหน้าเต็ม: สคริปต์หน้าร้าน (shell.js) เริ่มทำงานตอนโหลดหน้าเท่านั้น */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn btn-outline btn-sm" href="/track">
          ← ติดตามคำสั่งซื้อ
        </a>
        <h1>{title}</h1>
        <span className="pp-hint">{voided ? "เอกสารนี้ถูกยกเลิกแล้ว" : pages ? `${pages} หน้า A4` : "กำลังจัดหน้า…"}</span>
        <span className="sp" />
        <button className="btn btn-primary btn-sm" type="button" onClick={() => window.print()} disabled={!pages}>
          พิมพ์ / บันทึก PDF
        </button>
      </div>
      <p className="pp-hint" style={{ padding: "8px 16px 0", textAlign: "center" }}>
        กด “พิมพ์ / บันทึก PDF” แล้วเลือก “บันทึกเป็น PDF” — ชื่อไฟล์จะเป็น {title}.pdf
      </p>
      <div className="pp-body">
        <DocSheets view={view} copies={["ต้นฉบับ"]} onPages={setPages} />
      </div>
    </div>
  );
}
