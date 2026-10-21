"use client";
// นำเข้าสินค้าจาก CSV: เลือกไฟล์ → ตรวจ (แสดงสิ่งที่จะเปลี่ยน + แถวที่ผิด) → ยืนยัน
import Link from "next/link";
import { useFormAction } from "../../../_components/useFormAction";
import { confirmImport, previewImport, type ImportState } from "../actions";

export function ImportForm() {
  const [pv, onPreview, checking] = useFormAction<ImportState>(previewImport, {});
  const [done, onConfirm, saving] = useFormAction<ImportState>(confirmImport, {});
  const rows = pv.rows ?? [];
  const changed = rows.filter((r) => !r.error && r.changes.length);
  const errors = rows.filter((r) => r.error);
  const finished = !!done.ok;

  return (
    <div className="l3-form">
      <form className="l3-panel l3-form" onSubmit={onPreview} id="importPick">
        <h2>1. เลือกไฟล์ CSV</h2>
        <div className="l3-file">
          <label htmlFor="impFile" className="sr-only">ไฟล์ CSV</label>
          <input id="impFile" name="file" type="file" accept=".csv,text/csv" required />
          <button className="btn btn-dark" type="submit" disabled={checking}>{checking ? "กำลังตรวจ…" : "ตรวจไฟล์"}</button>
        </div>
        {pv.error && <div className="login-err" role="alert">{pv.error}</div>}
      </form>

      {pv.rows && !finished && (
        <section className="l3-panel" id="importPreview" aria-live="polite">
          <div className="l3-ph">
            <div>
              <h2>2. ตรวจก่อนยืนยัน</h2>
              <p>
                {rows.length} แถว · <b className="l3-pos">จะเปลี่ยน {changed.length} รายการ</b> · ไม่เปลี่ยน {rows.length - changed.length - errors.length} ·{" "}
                <b className={errors.length ? "l3-neg" : ""}>ผิดพลาด {errors.length}</b>
              </p>
            </div>
          </div>
          {errors.length > 0 && (
            <div className="err-box" style={{ marginBottom: 12 }} id="importErrors">
              <b>แถวที่ผิด (จะไม่ถูกบันทึก — แก้ในไฟล์แล้วตรวจใหม่ได้)</b>
              <ul style={{ margin: "6px 0 0 18px" }}>
                {errors.slice(0, 50).map((r) => (
                  <li key={r.line}>แถว {r.line} {r.sku && <code className="l3-code">{r.sku}</code>}: {r.error}</li>
                ))}
              </ul>
              {errors.length > 50 && <p>…และอีก {errors.length - 50} แถว</p>}
            </div>
          )}
          {changed.length ? (
            <table className="l3-tbl" id="importTbl">
              <thead><tr><th>แถว</th><th>สินค้า</th><th>การเปลี่ยนแปลง</th></tr></thead>
              <tbody>
                {changed.map((r) => (
                  <tr key={r.line} className="chg">
                    <td data-l="แถว">{r.line}</td>
                    <td className="main">{r.name}<span className="sub">{r.sku}</span></td>
                    <td data-l="เปลี่ยน">
                      {r.changes.map((c) => (
                        <div key={c.field}>
                          <span className="sub" style={{ display: "inline" }}>{c.label}: </span>
                          <span className="l3-old">{c.from}</span>→ <b>{c.to}</b>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty"><b>ไม่มีรายการที่ต้องเปลี่ยน</b>ข้อมูลในไฟล์ตรงกับข้อมูลในร้านแล้ว</div>
          )}
          <form onSubmit={onConfirm} className="l3-actions" style={{ marginTop: 14 }}>
            <input type="hidden" name="csv" value={pv.csv ?? ""} />
            <button className="btn btn-primary" type="submit" disabled={!changed.length || saving} id="importConfirm">
              {saving ? "กำลังบันทึก…" : `ยืนยันนำเข้า ${changed.length} รายการ`}
            </button>
            <span className="l3-note">ระบบตรวจซ้ำกับข้อมูลล่าสุดอีกครั้งก่อนบันทึก · สต็อกที่เปลี่ยนบันทึกในประวัติสต็อก</span>
          </form>
          {done.error && <div className="login-err" role="alert" style={{ marginTop: 10 }}>{done.error}</div>}
        </section>
      )}

      {finished && (
        <div className="ok-box" role="status" id="importDone">
          {done.ok} <Link href="/admin/products">ดูรายการสินค้า</Link> · <Link href="/admin/stock?tab=moves&reason=IMPORT">ดูประวัติสต็อก</Link>
        </div>
      )}
    </div>
  );
}
