// /admin/reports/vat?month=YYYY-MM — รายงานภาษีขายรายเดือน (จากใบเสร็จรับเงิน/ใบกำกับภาษี) · ไม่นับใบที่ยกเลิก
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { docDate, fmtTaxId, ymdBkk } from "@/lib/doc-calc";
import { getSettings } from "@/lib/settings";
import { vatReport } from "@/lib/sales-report";
import { baht, monthTh } from "../_ui";
import "../../../lot3.css";


export default async function VatReportPage({ searchParams }: PageProps<"/admin/reports/vat">) {
  await requireAdmin();
  const sp = await searchParams;
  const cur = ymdBkk(new Date()).slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : cur;
  const [s, r] = await Promise.all([getSettings(), vatReport(month)]);
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <main className="main" id="page-vat">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/reports">← รายงานยอดขาย</Link></p>
          <h1>รายงานภาษีขาย</h1>
          <p>เดือนภาษี {monthTh(month)}</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-primary" href={`/admin/reports/vat/export?month=${month}`} download>ส่งออก CSV</a>
        </div>
      </div>

      {!s.vatEnabled && (
        <div className="info-box" style={{ marginBottom: 12 }}>
          ร้านยังไม่ได้เปิดคิดภาษีมูลค่าเพิ่ม (VAT) ในตั้งค่าร้าน — รายงานนี้แสดงเฉพาะใบเสร็จที่ออกแบบคิด VAT เท่านั้น
        </div>
      )}

      <section className="panel l3-section">
        <form className="l3-filter" action="/admin/reports/vat">
          <a className="btn btn-outline btn-sm" href={`?month=${shift(-1)}`} aria-label="เดือนก่อน">← {monthTh(shift(-1))}</a>
          <div className="field">
            <label htmlFor="vMonth">เดือน</label>
            <input id="vMonth" type="month" name="month" defaultValue={month} />
          </div>
          <button className="btn btn-dark" type="submit">ดูรายงาน</button>
          {month < cur && <a className="btn btn-outline btn-sm" href={`?month=${shift(1)}`}>{monthTh(shift(1))} →</a>}
        </form>
        <div className="l3-panel">
          <div className="l3-tax" style={{ marginBottom: 12 }}>
            <b>ชื่อผู้ประกอบการ: {s.legalName}</b>
            <span>เลขประจำตัวผู้เสียภาษีอากร: {s.taxId ? fmtTaxId(s.taxId) : <span className="chip warn">ยังไม่ได้ตั้งค่า</span>} · สถานประกอบการ: {s.branch || "สำนักงานใหญ่"}</span>
            <span className="sub">{s.addressText}</span>
          </div>
          {r.rows.length ? (
            <table className="l3-tbl" id="vatTbl">
              <thead>
                <tr>
                  <th>ลำดับ</th><th>วันที่</th><th>เลขที่ใบกำกับภาษี</th><th>ชื่อผู้ซื้อ</th><th>เลขประจำตัวผู้เสียภาษี</th><th>สถานประกอบการ</th>
                  <th className="r">มูลค่าสินค้า/บริการ</th><th className="r">ภาษีมูลค่าเพิ่ม</th><th className="r">รวม</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.docNo}>
                    <td data-l="ลำดับ">{x.no}</td>
                    <td data-l="วันที่">{docDate(x.date, "BE")}</td>
                    <td className="main">{x.docNo}</td>
                    <td data-l="ผู้ซื้อ">{x.buyer}</td>
                    <td data-l="เลขผู้เสียภาษี" className="num">{x.taxId ? fmtTaxId(x.taxId) : "—"}</td>
                    <td data-l="สาขา">{x.branch || "—"}</td>
                    <td className="r" data-l="มูลค่า">{baht(x.baseSatang)}</td>
                    <td className="r" data-l="VAT">{baht(x.vatSatang)}</td>
                    <td className="r" data-l="รวม"><b>{baht(x.totalSatang)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="main" colSpan={6}>รวม {r.rows.length} ฉบับ</td>
                  <td className="r" data-l="มูลค่า" id="vatBase">{baht(r.sum.base)}</td>
                  <td className="r" data-l="VAT" id="vatSum">{baht(r.sum.vat)}</td>
                  <td className="r" data-l="รวม">{baht(r.sum.total)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="empty"><b>ไม่มีใบกำกับภาษีในเดือนนี้</b>ใบเสร็จที่ออกขณะเปิด VAT จะแสดงที่นี่</div>
          )}
          {r.voided.length > 0 && (
            <p className="l3-note" style={{ marginTop: 10 }} id="vatVoided">
              ไม่นับใบที่ยกเลิก {r.voided.length} ฉบับ: {r.voided.join(", ")}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
