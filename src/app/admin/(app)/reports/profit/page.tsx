// /admin/reports/profit — รายงานกำไร (A22): ตามสินค้า / หมวด / เดือน · เลือกช่วงวันที่ · CSV · เจ้าของร้านเท่านั้น
// รายได้ชุดเดียวกับรายงานยอดขาย, ต้นทุน = ต้นทุนล่าสุด ณ ตอนดูรายงาน (ดู src/lib/sales-report.ts)
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { addDaysYmd, fromYmd } from "@/lib/doc-calc";
import { PRESETS, PROFIT_VIEWS, costsFor, marginPct, parseReportFilter, profitBy, profitTotals, salesBetween, type Preset, type ProfitView } from "@/lib/sales-report";
import { baht, monthTh, qtyText, shortDate } from "../_ui";
import "../../../lot3.css";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`);

export default async function ProfitPage({ searchParams }: PageProps<"/admin/reports/profit">) {
  await requireOwner();
  const sp = await searchParams;
  const f = parseReportFilter(sp);
  const by: ProfitView = one(sp.by) in PROFIT_VIEWS ? (one(sp.by) as ProfitView) : "product";
  const list = await salesBetween(fromYmd(f.from), fromYmd(addDaysYmd(f.to, 1)));
  const costs = await costsFor(list);
  const rows = profitBy(list, costs, by);
  const t = profitTotals(rows);
  const q = (patch: Record<string, string>) => {
    const v = { preset: f.preset === "month" ? "" : f.preset, from: f.preset === "custom" ? f.from : "", to: f.preset === "custom" ? f.to : "", by: by === "product" ? "" : by, ...patch };
    const s = new URLSearchParams(Object.entries(v).filter(([, x]) => x)).toString();
    return s ? `?${s}` : "";
  };
  return (
    <main className="main" id="page-profit">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/reports">← รายงานยอดขาย</Link></p>
          <h1>รายงานกำไร</h1>
          <p>{shortDate(f.from, true)} – {shortDate(f.to, true)} · รายได้หักส่วนลดท้ายบิล ไม่รวมค่าส่ง · ต้นทุน = ต้นทุนล่าสุดของสินค้า</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href="/admin/purchase-orders/costs">ต้นทุนสินค้า</Link>
          <a className="btn btn-primary" href={`/admin/reports/profit/export${q({})}`} download id="profitCsv">ส่งออก CSV</a>
        </div>
      </div>

      <section className="panel l3-section">
        <nav className="l3-presets" aria-label="ช่วงเวลา">
          {(Object.keys(PRESETS) as Preset[]).filter((p) => p !== "custom").map((p) => (
            <a key={p} href={`/admin/reports/profit${q({ preset: p === "month" ? "" : p, from: "", to: "" })}`} aria-current={f.preset === p ? "true" : undefined}>{PRESETS[p]}</a>
          ))}
        </nav>
        <form className="l3-filter" action="/admin/reports/profit">
          <input type="hidden" name="preset" value="custom" />
          {by !== "product" && <input type="hidden" name="by" value={by} />}
          <div className="field"><label htmlFor="pFrom">ตั้งแต่วันที่</label><input id="pFrom" type="date" name="from" defaultValue={f.from} required /></div>
          <div className="field"><label htmlFor="pTo">ถึงวันที่</label><input id="pTo" type="date" name="to" defaultValue={f.to} required /></div>
          <button className="btn btn-dark" type="submit">ดูรายงาน</button>
        </form>
        <nav className="l3-tabs" aria-label="มุมมอง">
          {(Object.keys(PROFIT_VIEWS) as ProfitView[]).map((v) => (
            <a key={v} href={`/admin/reports/profit${q({ by: v === "product" ? "" : v })}`} aria-current={by === v ? "page" : undefined}>{PROFIT_VIEWS[v]}</a>
          ))}
        </nav>
      </section>

      <div className="l3-kpis four">
        <div className="l3-kpi"><span>รายได้ (ทราบต้นทุน)</span><b className="num" id="pfRevenue">{baht(t.revenueSatang)}</b><small>&nbsp;</small></div>
        <div className="l3-kpi"><span>ต้นทุนขาย</span><b className="num" id="pfCost">{baht(t.costSatang)}</b><small>&nbsp;</small></div>
        <div className="l3-kpi"><span>กำไรขั้นต้น</span><b className="num" id="pfProfit">{baht(t.profitSatang)}</b><small>อัตรากำไร {pct(marginPct(t))}</small></div>
        <div className="l3-kpi"><span>รายได้ที่ไม่ทราบต้นทุน</span><b className="num" id="pfUnknown">{baht(t.unknownRevenueSatang)}</b><small>{qtyText(t.unknownQty)} หน่วย — ตั้งต้นทุนเพื่อให้ครบ</small></div>
      </div>

      <section className="l3-panel">
        {rows.length ? (
          <table className="l3-tbl" id="profitTbl">
            <thead>
              <tr>
                <th>{by === "month" ? "เดือน" : by === "category" ? "หมวด" : "สินค้า"}</th>
                <th className="r">จำนวน</th><th className="r">รายได้</th><th className="r">ต้นทุน</th><th className="r">กำไร</th><th className="r">อัตรากำไร</th><th className="r">ไม่ทราบต้นทุน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.unknownRevenueSatang && !r.revenueSatang ? "pf-unknown" : ""}>
                  <td className="main">
                    {by === "month" ? monthTh(r.key) : r.label}
                    {r.sku ? <span className="sub">{r.sku}</span> : null}
                    {r.unknownQty > 0 && <span className="pf-flag" title="บางบรรทัดยังไม่มีต้นทุน">ไม่ทราบต้นทุน</span>}
                  </td>
                  <td className="r" data-l="จำนวน">{qtyText(r.qty)}</td>
                  <td className="r" data-l="รายได้">{baht(r.revenueSatang)}</td>
                  <td className="r" data-l="ต้นทุน">{baht(r.costSatang)}</td>
                  <td className="r" data-l="กำไร"><b className={r.profitSatang < 0 ? "owe" : ""}>{baht(r.profitSatang)}</b></td>
                  <td className="r" data-l="อัตรากำไร">{pct(marginPct(r))}</td>
                  <td className="r" data-l="ไม่ทราบต้นทุน">{r.unknownRevenueSatang ? `${baht(r.unknownRevenueSatang)} (${qtyText(r.unknownQty)})` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td className="main">รวม</td><td className="r" /><td className="r">{baht(t.revenueSatang)}</td><td className="r">{baht(t.costSatang)}</td><td className="r">{baht(t.profitSatang)}</td><td className="r">{pct(marginPct(t))}</td><td className="r">{baht(t.unknownRevenueSatang)}</td></tr>
            </tfoot>
          </table>
        ) : (
          <div className="empty"><b>ไม่มียอดขายในช่วงนี้</b></div>
        )}
        <p className="l3-note">ต้นทุนใช้ค่าล่าสุดของสินค้า ณ วันที่ดูรายงาน (ไม่ย้อนตามวันที่ขาย) · บรรทัดที่ไม่ผูกสินค้าหรือยังไม่มีต้นทุนไม่นำมาคิดกำไร</p>
      </section>
    </main>
  );
}
