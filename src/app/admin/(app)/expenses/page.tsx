// /admin/expenses?month=YYYY-MM&cat=&q= — ค่าใช้จ่ายร้านรายเดือน: สรุปตามหมวด · ภาษีซื้อ · ภาษีที่ต้องนำส่ง · รายการ + หลักฐาน · CSV
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { docDate, fromYmd, money, ymdBkk } from "@/lib/doc-calc";
import { EXPENSE_CATEGORIES, EXPENSE_CAT_KEYS, expenseCash, expenseCatLabel, type ExpenseCategory } from "@/lib/expense-rules";
import { expenseSummary } from "@/lib/expenses";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { Pagination, paginate } from "../../_components/Pagination";
import { RowActions } from "../../_components/RowActions";
import { monthTh } from "../reports/_ui";
import { deleteExpense } from "./actions";
import "../../lot3.css";
import "./expenses.css";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const nextM = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const lastDay = (m: string) => ymdBkk(new Date(fromYmd(`${nextM(m, 1)}-01`).getTime() - 864e5));

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  const admin = await requireAdmin();
  const owner = admin.role === "OWNER";
  const sp = await searchParams;
  const cur = ymdBkk(new Date()).slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(one(sp.month)) ? one(sp.month) : cur;
  const cat = EXPENSE_CAT_KEYS.includes(one(sp.cat) as ExpenseCategory) ? one(sp.cat) : "";
  const q = one(sp.q).trim().slice(0, 80);
  const s = await getSettings();
  const [rows, sum, prevSum] = await Promise.all([
    prisma.expense.findMany({
      where: {
        date: { gte: fromYmd(`${month}-01`), lt: fromYmd(`${nextM(month, 1)}-01`) },
        ...(cat ? { category: cat } : {}),
        ...(q ? { OR: [{ description: { contains: q, mode: "insensitive" } }, { payee: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    expenseSummary(`${month}-01`, lastDay(month), s.vatEnabled),
    expenseSummary(`${nextM(month, -1)}-01`, lastDay(nextM(month, -1)), s.vatEnabled),
  ]);
  const pg = paginate(rows, sp, "/admin/expenses", ["month", "cat", "q"], 30);
  const cats = [...sum.byCat.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const max = Math.max(1, ...cats.map(([, v]) => v.amount));
  const listTotal = rows.reduce((t, r) => t + r.amountSatang, 0);
  const qs = (o: Record<string, string>) => `?${new URLSearchParams(Object.entries({ month, cat, q, ...o }).filter(([, v]) => v))}`;
  const diff = sum.cost - prevSum.cost;

  return (
    <main className="main" id="page-expenses">
      <div className="page-head">
        <div>
          <h1>ค่าใช้จ่ายร้าน</h1>
          <p>เดือน {monthTh(month)} · ค่าขนส่ง ค่าแรง ค่าเช่า ค่าโฆษณา ฯลฯ (ซื้อสินค้าเข้าสต็อกบันทึกที่ <Link className="link" href="/admin/purchase-orders">ใบสั่งซื้อ</Link>)</p>
        </div>
        <div className="head-actions">
          {owner && <Link className="btn btn-outline" href="/admin/reports/profit">รายงานกำไร</Link>}
          <a className="btn btn-outline" href={`/admin/expenses/export?month=${month}`} download>ส่งออก CSV</a>
          <Link className="btn btn-primary" href="/admin/expenses/new">+ บันทึกค่าใช้จ่าย</Link>
        </div>
      </div>
      {sp.saved === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>บันทึกค่าใช้จ่ายแล้ว</div>}
      {sp.deleted === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ลบรายการแล้ว</div>}

      <div className="l3-kpis four">
        <div className="l3-kpi"><span>ค่าใช้จ่ายเดือนนี้{s.vatEnabled ? " (ไม่รวมภาษีซื้อ)" : ""}</span><b id="xpTotal">฿{money(sum.cost)}</b>
          <small>{prevSum.cost ? `${diff >= 0 ? "▲" : "▼"} ฿${money(Math.abs(diff))} จากเดือนก่อน` : `${sum.count} รายการ`}</small></div>
        <div className="l3-kpi"><span>จำนวนรายการ</span><b>{sum.count}</b><small>มีหลักฐาน {rows.filter((r) => r.fileKey).length}/{rows.length} รายการที่แสดง</small></div>
        <div className="l3-kpi"><span>ภาษีซื้อในบิล</span><b>฿{money(sum.vat)}</b><small>{s.vatEnabled ? "ใช้หักภาษีขายตอนยื่น ภ.พ.30" : "ร้านยังไม่จด VAT — นับรวมในค่าใช้จ่าย"}</small></div>
        <div className="l3-kpi"><span>ภาษีหัก ณ ที่จ่ายที่ต้องนำส่ง</span><b>฿{money(sum.wht)}</b><small>นำส่งภายในวันที่ 7 ของเดือนถัดไป (ภ.ง.ด.3/53)</small></div>
      </div>

      {cats.length > 0 && (
        <section className="panel xp-cats" aria-label="ค่าใช้จ่ายตามหมวด">
          <h3>ตามหมวด</h3>
          <ul>
            {cats.map(([k, v]) => (
              <li key={k}>
                <Link href={qs({ cat: k, page: "" })} className={cat === k ? "on" : ""}>
                  <span className="xp-cl">{expenseCatLabel(k)} <small>({v.count})</small></span>
                  <span className="xp-bar"><i style={{ width: `${Math.max(2, (v.amount / max) * 100)}%` }} /></span>
                  <b>฿{money(v.amount)}</b>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <form className="l3-filter" action="/admin/expenses">
          <a className="btn btn-outline btn-sm" href={qs({ month: nextM(month, -1), page: "" })}>← {monthTh(nextM(month, -1))}</a>
          <div className="field"><label htmlFor="xpMonth">เดือน</label><input id="xpMonth" type="month" name="month" defaultValue={month} /></div>
          <div className="field"><label htmlFor="xpCat">หมวด</label>
            <select id="xpCat" name="cat" defaultValue={cat}><option value="">ทุกหมวด</option>{EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
          <div className="field"><label htmlFor="xpQ">ค้นหา</label><input id="xpQ" name="q" type="search" defaultValue={q} placeholder="รายละเอียด ผู้รับเงิน เลขที่บิล" /></div>
          <button className="btn btn-dark" type="submit">แสดง</button>
          {month < cur && <a className="btn btn-outline btn-sm" href={qs({ month: nextM(month, 1), page: "" })}>{monthTh(nextM(month, 1))} →</a>}
        </form>
        <div className="tbl-wrap">
          <table className="tbl" id="xpTable">
            <thead><tr><th>วันที่</th><th>หมวด</th><th>รายละเอียด</th><th>วิธีจ่าย</th><th className="r">ยอดรวม</th><th className="r">จ่ายจริง</th><th>หลักฐาน</th><th className="r col-acts">การดำเนินการ</th></tr></thead>
            <tbody>
              {pg.rows.map((e) => (
                <tr key={e.id} data-id={e.id}>
                  <td className="nw">{docDate(ymdBkk(e.date), s.dateEra)}</td>
                  <td><span className="chip gray">{expenseCatLabel(e.category)}</span></td>
                  <td><Link className="link" href={`/admin/expenses/${e.id}`}><b>{e.description}</b></Link><span className="sub">{[e.payee, e.reference && `บิล ${e.reference}`].filter(Boolean).join(" · ")}</span></td>
                  <td className="sub">{e.method}</td>
                  <td className="r num">฿{money(e.amountSatang)}{e.vatSatang > 0 && <span className="sub">VAT ฿{money(e.vatSatang)}</span>}</td>
                  <td className="r num">฿{money(expenseCash(e))}{e.whtSatang > 0 && <span className="sub">หัก ณ ที่จ่าย ฿{money(e.whtSatang)}</span>}</td>
                  <td>{e.fileKey ? <a className="link" href={`/admin/expenses/${e.id}/file`} target="_blank" rel="noopener">{e.fileKey.endsWith(".pdf") ? "PDF" : "ดูรูป"}</a> : <span className="chip warn">ไม่มี</span>}</td>
                  <td className="r">
                    <RowActions name={e.description} viewHref={`/admin/expenses/${e.id}`} viewNewTab={false} editHref={`/admin/expenses/${e.id}`}
                      del={owner ? { action: deleteExpense, id: e.id, title: `ลบค่าใช้จ่าย “${e.description}”?`, body: `฿${money(e.amountSatang)} · ${expenseCatLabel(e.category)} — ลบหลักฐานด้วย (กู้คืนไม่ได้)` } : undefined} />
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr><td colSpan={4}>รวม {rows.length} รายการ{cat || q ? " (ตามตัวกรอง)" : ""}</td><td className="r num"><b>฿{money(listTotal)}</b></td><td colSpan={3} /></tr></tfoot>}
          </table>
        </div>
        {!rows.length && <div className="empty"><b>{cat || q ? "ไม่พบรายการตามตัวกรอง" : `ยังไม่มีค่าใช้จ่ายเดือน ${monthTh(month)}`}</b><Link className="link" href="/admin/expenses/new">บันทึกค่าใช้จ่าย</Link></div>}
        <Pagination page={pg.page} pages={pg.pages} total={pg.total} shown={pg.rows.length} per={pg.per} unit="รายการ" href={pg.href} />
      </section>
    </main>
  );
}
