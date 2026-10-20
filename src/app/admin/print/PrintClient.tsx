"use client";
// แถบเครื่องมือหน้าพิมพ์: ปุ่มพิมพ์/บันทึก PDF (ชื่อไฟล์ = เลขที่เอกสาร), ต้นฉบับ + สำเนา, พิมพ์อัตโนมัติเมื่อเปิดจากปุ่ม
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DocView } from "@/lib/doc-render";
import { markPrinted } from "../(app)/docs/actions";
import { DocSheets } from "../_components/DocSheets";

function usePrint(title: string, kind: "doc" | "label", ref: string, auto: boolean, ready: boolean) {
  useEffect(() => {
    document.title = title;
    const after = () => void markPrinted(kind, ref).catch(() => {});
    addEventListener("afterprint", after);
    return () => removeEventListener("afterprint", after);
  }, [title, kind, ref]);
  useEffect(() => {
    if (auto && ready) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [auto, ready]);
}

export function PrintDoc({ view, id, back, auto, both: both0 }: { view: DocView; id: string; back: string; auto: boolean; both: boolean }) {
  const [both, setBoth] = useState(both0);
  const [pages, setPages] = useState(0);
  const title = view.no || `ฉบับร่าง-${view.type}`;
  usePrint(title, "doc", id, auto, pages > 0);
  return (
    <div className="pp">
      <style>{"@page{size:A4;margin:0}"}</style>
      <div className="pp-bar">
        <Link className="btn btn-outline btn-sm" href={back}>← กลับ</Link>
        <h1>{title}</h1>
        <span className="pp-hint">{pages ? `${pages} หน้า A4` : "กำลังจัดหน้า…"}</span>
        <span className="sp" />
        <label className="chk-row"><input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} /> ต้นฉบับ + สำเนา</label>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => window.print()} disabled={!pages}>พิมพ์ / บันทึก PDF</button>
      </div>
      <p className="pp-hint" style={{ padding: "8px 16px 0", textAlign: "center" }}>ในหน้าต่างพิมพ์ เลือก “บันทึกเป็น PDF” ได้ — ชื่อไฟล์จะเป็น {title}.pdf · ตั้งค่าขอบกระดาษ “ไม่มี” และเปิด “กราฟิกพื้นหลัง”</p>
      <div className="pp-body"><DocSheets view={view} copies={both ? ["ต้นฉบับ", "สำเนา"] : ["ต้นฉบับ"]} onPages={setPages} /></div>
    </div>
  );
}

export function PrintLabels({ html, size, count, refText, back, auto }: { html: string; size: "A6" | "A4"; count: number; refText: string; back: string; auto: boolean }) {
  usePrint(`ใบปะหน้า-${refText}`, "label", refText, auto, true);
  return (
    <div className="pp">
      <style>{`@page{size:${size === "A4" ? "A4" : "100mm 150mm"};margin:0}`}</style>
      <div className="pp-bar">
        <Link className="btn btn-outline btn-sm" href={back}>← กลับ</Link>
        <h1>ใบปะหน้า {count} ใบ</h1>
        <span className="pp-hint">{size === "A4" ? "A4 — 4 ใบต่อแผ่น (ตัดตามเส้นประ)" : "A6 100×150 มม. สำหรับเครื่องพิมพ์ฉลาก"}</span>
        <span className="sp" />
        <button className="btn btn-primary btn-sm" type="button" onClick={() => window.print()}>พิมพ์ใบปะหน้า</button>
      </div>
      <div className="pp-body"><div className="pp-sheets" dangerouslySetInnerHTML={{ __html: html }} /></div>
    </div>
  );
}
