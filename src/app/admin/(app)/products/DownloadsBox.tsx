"use client";
// ไฟล์ดาวน์โหลดของสินค้า (A8): อัปโหลด PDF (≤ 20 MB) ตั้งชื่อที่ลูกค้าเห็น ลบได้ — แสดงบนหน้าสินค้าทันที
import { useRef } from "react";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { useFormAction } from "../../_components/useFormAction";
import { removeDownload, uploadDownload, type Lot9State } from "./lot9-actions";

export type DownloadRow = { key: string; name: string; size: string; href: string };

export function DownloadsBox({ productId, files }: { productId: string; files: DownloadRow[] }) {
  const [state, onSubmit, pending] = useFormAction<Lot9State>(uploadDownload, {});
  const form = useRef<HTMLFormElement>(null);
  return (
    <section className="box" id="downloadsBox" style={{ marginTop: 16, maxWidth: 720 }}>
      <h3>
        ไฟล์ดาวน์โหลด <span className="sub">สเปกชีต / คู่มือ (PDF) แสดงในหน้าสินค้า</span>
      </h3>
      {files.length ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>ชื่อไฟล์ที่ลูกค้าเห็น</th>
              <th className="r">ขนาด</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {files.map((d) => (
              <tr key={d.key}>
                <td>
                  <a className="link" href={d.href} target="_blank" rel="noopener">
                    {d.name}.pdf
                  </a>
                </td>
                <td className="r num">{d.size}</td>
                <td className="r">
                  <form action={removeDownload}>
                    <input type="hidden" name="id" value={productId} />
                    <input type="hidden" name="key" value={d.key} />
                    <ConfirmSubmit className="btn btn-ghost btn-sm" title="ลบไฟล์นี้?" body={`${d.name}.pdf จะถูกลบถาวร`} confirmLabel="ยืนยันลบ">
                      ลบ
                    </ConfirmSubmit>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sub">ยังไม่มีไฟล์</p>
      )}
      <form
        ref={form}
        onSubmit={(e) => {
          onSubmit(e);
        }}
        className="two"
        style={{ alignItems: "end" }}
      >
        <input type="hidden" name="id" value={productId} />
        <div className="field">
          <label htmlFor="dlFile">ไฟล์ PDF (ไม่เกิน 20 MB)</label>
          <input id="dlFile" name="file" type="file" accept="application/pdf,.pdf" required style={state.fields?.includes("file") ? { borderColor: "var(--c-err)" } : undefined} />
        </div>
        <div className="field">
          <label htmlFor="dlName">ชื่อที่แสดง (ไม่บังคับ)</label>
          <input id="dlName" name="name" maxLength={120} placeholder="เช่น สเปกชีต, คู่มือติดตั้ง" />
        </div>
        <div>
          <button className="btn btn-outline" type="submit" disabled={pending} id="dlUpload">
            {pending ? "กำลังอัปโหลด…" : "อัปโหลดไฟล์"}
          </button>
        </div>
      </form>
      {state.error && (
        <div className="login-err" role="alert">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="login-info" role="status">
          {state.ok}
        </div>
      )}
    </section>
  );
}
