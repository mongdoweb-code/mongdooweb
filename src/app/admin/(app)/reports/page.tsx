// /admin/reports — รายงานยอดขาย: รายวัน/รายเดือน, ตามสินค้า, ตามหมวด, ตามช่องทาง, รายการขาย · เลือกช่วงวันที่ · ส่งออก CSV
// ใช้เฉพาะยอดที่ยืนยันชำระแล้ว (ดู src/lib/sales-report.ts)
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { addDaysYmd, fromYmd } from "@/lib/doc-calc";
import {
  CHANNEL_LABEL, PRESETS, VIEWS, byCategory, byChannel, byPeriod, byProduct, parseReportFilter, reportQuery, salesBetween, sumSales,
  type Preset, type View,
} from "@/lib/sales-report";
import { BarChart, RankTable, baht, qtyText, shortDate } from "./_ui";
import "../../lot3.css";

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdmin();
  const f = parseReportFilter(await searchParams);
  const list = await salesBetween(fromYmd(f.from), fromYmd(addDaysYmd(f.to, 1)));
  const total = sumSales(list);
  const ship = list.reduce((a, s) => a + s.shippingSatang, 0);
  const pieces = list.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0);
  const periods = byPeriod(list, f.from, f.to, f.unit);
  const href = (patch: Partial<typeof f>) => `/admin/reports${reportQuery(f, patch)}`;
  const exportHref = `/admin/reports/export${reportQuery(f)}`;

  return (
    <main className="main" id="page-reports">
      <div className="page-head">
        <div>
          <h1>รายงานยอดขาย</h1>
          <p>
            {shortDate(f.from, true)} – {shortDate(f.to, true)} · เฉพาะยอดที่ยืนยันชำระแล้ว
          </p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href="/admin/reports/vat">รายงานภาษีขาย</Link>
          <a className="btn btn-primary" href={exportHref} download>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>
            ส่งออก CSV
          </a>
        </div>
      </div>

      <section className="panel l3-section">
        <nav className="l3-presets" aria-label="ช่วงเวลา">
          {(Object.keys(PRESETS) as Preset[]).filter((p) => p !== "custom").map((p) => (
            <a key={p} href={href({ preset: p })} aria-current={f.preset === p ? "true" : undefined}>{PRESETS[p]}</a>
          ))}
        </nav>
        <form className="l3-filter" action="/admin/reports">
          <input type="hidden" name="preset" value="custom" />
          {f.view !== "period" && <input type="hidden" name="view" value={f.view} />}
          <div className="field">
            <label htmlFor="rFrom">ตั้งแต่วันที่</label>
            <input id="rFrom" type="date" name="from" defaultValue={f.from} required />
          </div>
          <div className="field">
            <label htmlFor="rTo">ถึงวันที่</label>
            <input id="rTo" type="date" name="to" defaultValue={f.to} required />
          </div>
          <div className="field">
            <label htmlFor="rUnit">แสดงเป็น</label>
            <select id="rUnit" name="unit" defaultValue={f.unit}>
              <option value="day">รายวัน</option>
              <option value="month">รายเดือน</option>
            </select>
          </div>
          <button className="btn btn-dark" type="submit">ดูรายงาน</button>
          {f.bad && <span className="err-msg" role="alert">ช่วงวันที่ไม่ถูกต้อง ระบบปรับให้แล้ว</span>}
        </form>
        <nav className="l3-tabs" aria-label="มุมมอง">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <a key={v} href={href({ view: v })} aria-current={f.view === v ? "page" : undefined}>{VIEWS[v]}</a>
          ))}
        </nav>
      </section>

      <div className="l3-kpis four">
        <div className="l3-kpi"><span>ยอดขายรวม</span><b className="num" id="rTotal">{baht(total.satang)}</b><small>รวมค่าส่ง {baht(ship)}</small></div>
        <div className="l3-kpi"><span>จำนวนรายการขาย</span><b className="num" id="rCount">{total.count}</b><small>คำสั่งซื้อ + ใบเสร็จ</small></div>
        <div className="l3-kpi"><span>เฉลี่ยต่อรายการ</span><b className="num">{baht(total.count ? Math.round(total.satang / total.count) : 0)}</b><small>&nbsp;</small></div>
        <div className="l3-kpi"><span>จำนวนสินค้าที่ขาย</span><b className="num">{qtyText(pieces)}</b><small>ชิ้น/หน่วย</small></div>
      </div>

      {f.view === "period" && (
        <>
          <section className="chart-panel">
            <div className="chart-head">
              <div><h2>ยอดขาย{f.unit === "day" ? "รายวัน" : "รายเดือน"}</h2><p>ตามวันที่ยืนยันชำระ / วันที่ในใบเสร็จ</p></div>
            </div>
            <div className="chart-wrap">
              <BarChart data={periods} title={`ยอดขาย${f.unit === "day" ? "รายวัน" : "รายเดือน"}`} label={(k) => shortDate(k)} />
            </div>
          </section>
          <section className="l3-panel">
            <table className="l3-tbl" id="periodTbl">
              <thead><tr><th>{f.unit === "day" ? "วันที่" : "เดือน"}</th><th className="r">จำนวนรายการ</th><th className="r">ยอดขาย</th></tr></thead>
              <tbody>
                {[...periods].reverse().map((p) => (
                  <tr key={p.key} className={p.count ? "" : "off"}>
                    <td className="main">{shortDate(p.key, true)}</td>
                    <td className="r" data-l="รายการ">{p.count}</td>
                    <td className="r" data-l="ยอดขาย"><b>{baht(p.satang)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td className="main">รวม</td><td className="r" data-l="รายการ">{total.count}</td><td className="r" data-l="ยอดขาย">{baht(total.satang)}</td></tr></tfoot>
            </table>
          </section>
        </>
      )}

      {f.view === "product" && (
        <section className="l3-panel">
          <div className="l3-ph"><div><h2>ยอดขายตามสินค้า</h2><p>ไม่รวมค่าส่ง · รายการจากใบเสร็จที่ไม่ผูกสินค้าแสดงตามชื่อในเอกสาร</p></div></div>
          <RankTable rows={byProduct(list)} empty="ไม่มียอดขายในช่วงนี้" />
        </section>
      )}

      {f.view === "category" && (
        <section className="l3-panel">
          <div className="l3-ph"><div><h2>ยอดขายตามหมวดสินค้า</h2><p>ไม่รวมค่าส่ง</p></div></div>
          <RankTable rows={byCategory(list)} empty="ไม่มียอดขายในช่วงนี้" />
        </section>
      )}

      {f.view === "channel" && (
        <section className="l3-panel">
          <div className="l3-ph"><div><h2>ยอดขายตามช่องทาง</h2><p>หน้าเว็บ = ลูกค้าสั่งเอง · หลังร้าน = แอดมินสร้างคำสั่งซื้อให้ · ใบเสร็จ = ขายผ่านเอกสารขาย</p></div></div>
          <RankTable rows={byChannel(list)} empty="ไม่มียอดขายในช่วงนี้" unit={false} />
        </section>
      )}

      {f.view === "list" && (
        <section className="l3-panel">
          <div className="l3-ph"><div><h2>รายการขาย</h2><p>{list.length} รายการ เรียงจากล่าสุด</p></div></div>
          {list.length ? (
            <table className="l3-tbl">
              <thead><tr><th>วันที่</th><th>เลขที่</th><th>ช่องทาง</th><th className="r">ค่าส่ง</th><th className="r">ยอดรวม</th></tr></thead>
              <tbody>
                {[...list].reverse().slice(0, 500).map((s) => (
                  <tr key={s.ref}>
                    <td data-l="วันที่">{shortDate(s.day, true)}</td>
                    <td className="main">
                      {s.channel === "DOC" ? s.ref : <Link className="link" href={`/admin?tab=ALL&open=${encodeURIComponent(s.ref)}`}>{s.ref}</Link>}
                    </td>
                    <td data-l="ช่องทาง">{CHANNEL_LABEL[s.channel]}</td>
                    <td className="r" data-l="ค่าส่ง">{baht(s.shippingSatang)}</td>
                    <td className="r" data-l="ยอดรวม"><b>{baht(s.totalSatang)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty"><b>ไม่มียอดขายในช่วงนี้</b></div>
          )}
          {list.length > 500 && <p className="l3-note">แสดง 500 รายการล่าสุด — ส่งออก CSV เพื่อดูทั้งหมด</p>}
        </section>
      )}
    </main>
  );
}
