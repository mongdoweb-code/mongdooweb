"use client";
// ไฟล์ดาวน์โหลดของสินค้า (A8): อัปโหลด PDF (≤ 20 MB) ตั้งชื่อที่ลูกค้าเห็น ลบได้ — แสดงบนหน้าสินค้าทันที
// UI: รายการไฟล์ (ไอคอน PDF · ชื่อ · ขนาด · ดาวน์โหลด · ลบ) + กล่องลากไฟล์มาวาง/คลิกเลือก (ตรวจชนิด/ขนาดก่อนส่ง ชื่อเติมจากชื่อไฟล์ให้)
// คลาสขึ้นต้น dlf- (ไม่ใช้ dl- เพราะซ้ำกับรายการเอกสารขายใน admin.css)
import { useRef, useState } from "react";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { useFormAction } from "../../_components/useFormAction";
import { removeDownload, uploadDownload, type Lot9State } from "./lot9-actions";

export type DownloadRow = { key: string; name: string; size: string; href: string };

const MAX = 20 * 1024 * 1024;
const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const PdfIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#FDECEC" stroke="#D93025" strokeWidth="1.5" /><path d="M14 2v5h5" fill="none" stroke="#D93025" strokeWidth="1.5" /><text x="12" y="17.5" textAnchor="middle" fontSize="5.6" fontWeight="800" fill="#D93025" fontFamily="sans-serif">PDF</text></svg>
);

export function DownloadsBox({ productId, files }: { productId: string; files: DownloadRow[] }) {
  const [state, onSubmit, pending] = useFormAction<Lot9State>(uploadDownload, {});
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  // อัปโหลดสำเร็จ (ผลใหม่) → ล้างไฟล์ที่เลือก/ชื่อ (ปรับ state ระหว่าง render ตามแนวทางของ React แทน effect)
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) {
      setPicked(null);
      setName("");
    }
  }

  const choose = (f: File | undefined | null) => {
    setErr("");
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return setErr("รองรับเฉพาะไฟล์ PDF");
    if (f.size > MAX) return setErr(`ไฟล์ใหญ่เกิน 20 MB (${mb(f.size)})`);
    setPicked(f);
    if (!name.trim()) setName(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").slice(0, 120));
  };
  const clear = () => {
    setPicked(null);
    setName("");
    setErr("");
    if (input.current) input.current.value = "";
  };

  return (
    <section className="box dlf-box" id="downloadsBox">
      <div className="dlf-head">
        <h3>ไฟล์ดาวน์โหลด {files.length > 0 && <span className="dlf-count">{files.length}</span>}</h3>
        <span className="sub">สเปกชีต / คู่มือ (PDF) — ลูกค้ากดดาวน์โหลดได้ที่หน้าสินค้า</span>
      </div>

      {files.length > 0 && (
        <ul className="dlf-list" aria-label="ไฟล์ที่อัปโหลดแล้ว">
          {files.map((d) => (
            <li key={d.key} className="dlf-item">
              <span className="dlf-ic"><PdfIcon /></span>
              <span className="dlf-info">
                <a className="dlf-name" href={d.href} target="_blank" rel="noopener">{d.name}.pdf</a>
                <span className="sub">{d.size}</span>
              </span>
              <a className="ra ra-view" href={d.href} target="_blank" rel="noopener" data-tip="เปิด/ดาวน์โหลด" aria-label={`เปิด ${d.name}.pdf`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
              </a>
              <form action={removeDownload}>
                <input type="hidden" name="id" value={productId} />
                <input type="hidden" name="key" value={d.key} />
                <ConfirmSubmit className="ra ra-del" title="ลบไฟล์นี้?" body={`${d.name}.pdf จะถูกลบถาวร และหายจากหน้าสินค้า`} confirmLabel="ยืนยันลบ" tip="ลบไฟล์" ariaLabel={`ลบ ${d.name}.pdf`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          if (!picked) {
            e.preventDefault();
            setErr("เลือกไฟล์ PDF ก่อน");
            return;
          }
          onSubmit(e);
        }}
        className="dlf-up"
      >
        <input type="hidden" name="id" value={productId} />
        <label
          htmlFor="dlFile"
          className={`dlf-drop${over ? " over" : ""}${picked ? " has" : ""}${err || state.fields?.includes("file") ? " bad" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (!f || !input.current) return;
            const dt = new DataTransfer();
            dt.items.add(f);
            input.current.files = dt.files;
            choose(f);
          }}
        >
          {picked ? (
            <>
              <span className="dlf-ic"><PdfIcon /></span>
              <span className="dlf-info">
                <b>{picked.name}</b>
                <span className="sub">{mb(picked.size)} · คลิกเพื่อเปลี่ยนไฟล์</span>
              </span>
            </>
          ) : (
            <>
              <svg className="dlf-up-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 18a5 5 0 0 1-.5-9.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7Z" /><path d="M12 11v7M9 14l3-3 3 3" /></svg>
              <span className="dlf-info">
                <b>ลากไฟล์ PDF มาวางที่นี่ หรือคลิกเพื่อเลือก</b>
                <span className="sub">ไฟล์ PDF ไม่เกิน 20 MB</span>
              </span>
            </>
          )}
        </label>
        <input ref={input} id="dlFile" name="file" type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="เลือกไฟล์ PDF (ไม่เกิน 20 MB)" onClick={(e) => { e.currentTarget.value = ""; }} onChange={(e) => choose(e.target.files?.[0])} />
        <div className="dlf-row">
          <div className="field">
            <label htmlFor="dlName">ชื่อที่ลูกค้าเห็น (ไม่บังคับ)</label>
            <input id="dlName" name="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สเปกชีต, คู่มือติดตั้ง" />
          </div>
          <div className="dlf-btns">
            {picked && <button type="button" className="btn btn-ghost" onClick={clear}>ยกเลิก</button>}
            <button className="btn btn-primary" type="submit" disabled={pending || !picked} id="dlUpload">
              {pending ? "กำลังอัปโหลด…" : "อัปโหลดไฟล์"}
            </button>
          </div>
        </div>
      </form>
      {(err || state.error) && <div className="login-err" role="alert">{err || state.error}</div>}
      {state.ok && !err && <div className="login-info" role="status">{state.ok}</div>}
    </section>
  );
}
