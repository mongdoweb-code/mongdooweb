// /admin/reports/wht?month=YYYY-MM&only=missing — ภาษีถูกหัก ณ ที่จ่าย (จากการรับชำระใบแจ้งหนี้)
// ใช้ตอนยื่นภาษี (เครดิตภาษีที่ถูกหักไว้) + ติดตามหนังสือรับรอง 50 ทวิ ที่ลูกค้ายังไม่ส่งให้
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { docDate, ymdBkk } from "@/lib/doc-calc";
import { monthRe, nextMonth, whtReport } from "@/lib/wht-report";
import { baht, monthTh } from "../_ui";
import { saveWhtCert } from "./actions";
import "../../../lot3.css";

export default async function WhtReportPage({ searchParams }: PageProps<"/admin/reports/wht">) {
  await requireAdmin();
  const sp = await searchParams;
  const cur = ymdBkk(new Date()).slice(0, 7);
  const month = typeof sp.month === "string" && monthRe.test(sp.month) ? sp.month : cur;
  const only = sp.only === "missing" ? "missing" : "all";
  const r = await whtReport(month, only);
  const prev = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const q = (o: Record<string, string>) => `?${new URLSearchParams({ month, ...(only === "missing" ? { only } : {}), ...o })}`;

  return (
    <main className="main" id="page-wht">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/reports">← รายงานยอดขาย</Link></p>
          <h1>ภาษีถูกหัก ณ ที่จ่าย</h1>
          <p>เดือน {monthTh(month)} · ภาษีที่ลูกค้าหักไว้ตอนจ่ายเงิน — ใช้เครดิตภาษีตอนยื่นแบบ (ต้องมีหนังสือรับรอง 50 ทวิ ตัวจริง)</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-primary" href={`/admin/reports/wht/export?month=${month}`} download>ส่งออก CSV</a>
        </div>
      </div>

      {r.missingAll > 0 && (
        <div className="info-box" role="status" style={{ marginBottom: 12 }}>
          ยังไม่ได้รับหนังสือรับรอง 50 ทวิ จากลูกค้า <b>{r.missingAll}</b> รายการ (ทุกเดือน) — ติดตามจากลูกค้า แล้วกด “ได้รับแล้ว”
        </div>
      )}

      <section className="panel l3-section">
        <form className="l3-filter" action="/admin/reports/wht">
          <a className="btn btn-outline btn-sm" href={q({ month: prev })} aria-label="เดือนก่อน">← {monthTh(prev)}</a>
          <div className="field"><label htmlFor="wMonth">เดือน</label><input id="wMonth" type="month" name="month" defaultValue={month} /></div>
          <div className="field"><label htmlFor="wOnly">แสดง</label>
            <select id="wOnly" name="only" defaultValue={only}><option value="all">ทั้งหมด</option><option value="missing">ยังไม่ได้รับหนังสือรับรอง</option></select></div>
          <button className="btn btn-dark" type="submit">ดูรายงาน</button>
          {month < cur && <a className="btn btn-outline btn-sm" href={q({ month: nextMonth(month) })}>{monthTh(nextMonth(month))} →</a>}
        </form>
        <div className="l3-panel">
          <div className="l3-kpis four" style={{ marginBottom: 12 }}>
            <div className="l3-kpi"><span>ฐานภาษีรวม</span><b>{baht(r.sum.base)}</b></div>
            <div className="l3-kpi"><span>ภาษีถูกหักรวม</span><b id="whtTotal">{baht(r.sum.wht)}</b></div>
            <div className="l3-kpi"><span>เงินที่ได้รับจริง</span><b>{baht(r.sum.net)}</b></div>
            <div className="l3-kpi"><span>รอหนังสือรับรอง (เดือนนี้)</span><b>{r.sum.missing}</b></div>
          </div>
          {r.rows.length ? (
            <div className="tbl-scroll">
              <table className="l3-tbl" id="whtTbl">
                <thead>
                  <tr><th>วันที่รับเงิน</th><th>ลูกค้า (ผู้หักภาษี)</th><th>ใบแจ้งหนี้ / ใบเสร็จ</th><th className="r">ฐานภาษี</th><th className="r">อัตรา</th><th className="r">ภาษีถูกหัก</th><th className="r">รับจริง</th><th>หนังสือรับรอง 50 ทวิ</th></tr>
                </thead>
                <tbody>
                  {r.rows.map((x) => (
                    <tr key={x.id} data-id={x.id}>
                      <td>{docDate(x.date, "BE")}</td>
                      <td><b>{x.customer}</b>{x.taxId && <span className="sub" style={{ display: "block" }}>{x.taxId}</span>}</td>
                      <td><Link className="link" href={`/admin/docs/INVOICE/${x.ivId}`}>{x.ivNo}</Link>{x.rcId && <> · <Link className="link" href={`/admin/docs/RECEIPT/${x.rcId}`}>{x.rcNo}</Link></>}</td>
                      <td className="r num">{baht(x.baseSatang)}</td>
                      <td className="r num">{x.rateBp / 100}%</td>
                      <td className="r num"><b>{baht(x.whtSatang)}</b></td>
                      <td className="r num">{baht(x.netSatang)}</td>
                      <td>
                        <form action={saveWhtCert} className="wht-cert">
                          <input type="hidden" name="id" value={x.id} />
                          <input name="certNo" defaultValue={x.certNo} maxLength={60} placeholder="เลขที่" aria-label={`เลขที่หนังสือรับรอง ${x.ivNo}`} />
                          <label className="chk-row"><input type="checkbox" name="received" value="1" defaultChecked={!!x.certAt} /> ได้รับแล้ว</label>
                          <button className="btn btn-outline btn-sm" type="submit">บันทึก</button>
                          {x.certAt ? <span className="chip ok">รับ {docDate(x.certAt, "BE")}</span> : <span className="chip warn">ยังไม่ได้รับ</span>}
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>รวม {r.rows.length} รายการ</td><td className="r num">{baht(r.sum.base)}</td><td /><td className="r num"><b>{baht(r.sum.wht)}</b></td><td className="r num">{baht(r.sum.net)}</td><td /></tr></tfoot>
              </table>
            </div>
          ) : (
            <p className="sub" style={{ padding: 16 }}>ไม่มีการรับชำระที่ถูกหักภาษี ณ ที่จ่ายใน{only === "missing" ? "รายการที่รอหนังสือรับรองของ" : ""}เดือนนี้ — บันทึกได้ตอน “บันทึกรับชำระ” ในใบแจ้งหนี้ (ติ๊ก “ลูกค้าหักภาษี ณ ที่จ่าย”)</p>
          )}
        </div>
      </section>
    </main>
  );
}
