// /admin/reports/receivables — ลูกหนี้ค้างชำระ (ใบแจ้งหนี้ที่ยังชำระไม่ครบ) แยกอายุหนี้ต่อรายลูกค้า + คัดลอกข้อความทวงพร้อมลิงก์ชำระ
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { docDate, ymdBkk } from "@/lib/doc-calc";
import { formatPhone } from "@/lib/format";
import { AGE_BUCKETS, receivables, type ArCustomer } from "@/lib/finance";
import { siteUrl } from "@/lib/line";
import { ensureDocToken, publicDocUrl } from "@/lib/public-docs";
import { getSettings } from "@/lib/settings";
import { CopyButton } from "../../../_components/AdminClient";
import { Icons } from "../../../_components/RowActions";
import { baht } from "../_ui";
import "../../../lot3.css";

export default async function ReceivablesPage({ searchParams }: PageProps<"/admin/reports/receivables">) {
  await requireAdmin();
  const sp = await searchParams;
  const today = ymdBkk(new Date());
  const [r, s] = await Promise.all([receivables(today), getSettings()]);
  const only = typeof sp.age === "string" && AGE_BUCKETS.some((b) => b.key === sp.age) ? sp.age : "";
  const list = only ? r.customers.filter((c) => c.buckets[only as keyof ArCustomer["buckets"]] > 0) : r.customers;
  const era = s.dateEra;
  // ลิงก์ชำระของแต่ละใบ (ลูกค้าเปิดดูยอด สแกน QR และแนบสลิปได้เอง)
  const links = new Map<string, string>();
  await Promise.all(list.flatMap((c) => c.invoices).map(async (i) => {
    const t = await ensureDocToken(i.id);
    if (t) links.set(i.id, `${siteUrl()}${publicDocUrl({ id: i.id, type: "INVOICE" }, t)}`);
  }));
  const reminder = (c: ArCustomer) =>
    [
      `เรียน ${c.name}`,
      `ร้าน${s.legalName || "มองดูเว็บ"} ขอแจ้งยอดค้างชำระ รวม ${baht(c.total)} ดังนี้`,
      ...c.invoices.map((i) => `• ${i.docNo} ครบกำหนด ${docDate(i.dueYmd, era)} ค้าง ${baht(i.outstanding)}${links.get(i.id) ? `\n  ชำระ/แนบสลิป: ${links.get(i.id)}` : ""}`),
      `หากชำระแล้วขออภัยและขอบคุณครับ${s.phone ? ` · สอบถาม ${formatPhone(s.phone)}` : ""}`,
    ].join("\n");

  return (
    <main className="main" id="page-ar">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/reports">← รายงานยอดขาย</Link></p>
          <h1>ลูกหนี้ค้างชำระ</h1>
          <p>ใบแจ้งหนี้ที่ออกแล้วแต่ยังชำระไม่ครบ {r.invoiceCount} ใบ · {r.customers.length} ราย · ข้อมูล ณ {docDate(today, era)}</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href="/admin/docs/INVOICE?tab=overdue">ใบแจ้งหนี้เกินกำหนด</Link>
          <a className="btn btn-primary" href="/admin/reports/receivables/export" download>ส่งออก CSV</a>
        </div>
      </div>

      <div className="ar-kpis">
        <Link className={`ar-kpi${only ? "" : " on"}`} href="/admin/reports/receivables"><span>ค้างชำระทั้งหมด</span><b className="num">{baht(r.total)}</b></Link>
        {AGE_BUCKETS.map((b) => (
          <Link key={b.key} className={`ar-kpi ar-${b.key}${only === b.key ? " on" : ""}${r.totals[b.key] ? "" : " zero"}`} href={`/admin/reports/receivables?age=${b.key}`}>
            <span>{b.label}</span><b className="num">{baht(r.totals[b.key])}</b>
          </Link>
        ))}
      </div>

      <section className="panel">
        <div className="tbl-wrap">
          <table className="tbl ar-tbl">
            <thead>
              <tr>
                <th>ลูกค้า / ใบแจ้งหนี้</th>
                {AGE_BUCKETS.map((b) => <th key={b.key} className="r">{b.label}</th>)}
                <th className="r">รวมค้าง</th>
                <th className="r col-acts">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id ?? c.name} data-cust={c.code}>
                  <td>
                    <b>{c.id ? <Link className="link" href={`/admin/customers/${c.id}`}>{c.code} {c.name}</Link> : c.name}</b>
                    <span className="sub">{[c.phone && formatPhone(c.phone), c.oldestDays > 0 && `ค้างนานสุด ${c.oldestDays} วัน`].filter(Boolean).join(" · ")}</span>
                    <details className="ar-inv">
                      <summary>{c.invoices.length} ใบแจ้งหนี้</summary>
                      <ul>
                        {c.invoices.map((i) => (
                          <li key={i.id}>
                            <Link className="link num" href={`/admin/docs/INVOICE/${i.id}`}>{i.docNo}</Link>
                            <span className="sub">ครบกำหนด {docDate(i.dueYmd, era)}{i.days > 0 ? ` · เลย ${i.days} วัน` : ""}</span>
                            <b className="num">{baht(i.outstanding)}</b>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  {AGE_BUCKETS.map((b) => (
                    <td key={b.key} className={`r num${c.buckets[b.key] && b.key !== "current" ? " owe" : ""}`}>{c.buckets[b.key] ? baht(c.buckets[b.key]) : <span className="sub">—</span>}</td>
                  ))}
                  <td className="r num"><b>{baht(c.total)}</b></td>
                  <td className="r">
                    <div className="row-acts">
                      <CopyButton className="ra ra-dup" text={reminder(c)} label={`คัดลอกข้อความทวงหนี้ ${c.name}`} done="คัดลอกข้อความทวงแล้ว — วางใน LINE ได้เลย">{Icons.copy}</CopyButton>
                      {c.id && <Link className="ra ra-view" href={`/admin/customers/${c.id}`} data-tip="ดูลูกค้า" aria-label={`ดูลูกค้า ${c.name}`}>{Icons.eye}</Link>}
                      {c.invoices[0] && <a className="ra ra-print" href={`/admin/print/doc/${c.invoices[0].id}?auto=1`} target="_blank" rel="noopener" data-tip="พิมพ์ใบแจ้งหนี้ใบเก่าสุด" aria-label={`พิมพ์ ${c.invoices[0].docNo}`}>{Icons.print}</a>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr>
                  <th>รวม</th>
                  {AGE_BUCKETS.map((b) => <th key={b.key} className="r num">{baht(list.reduce((sum, c) => sum + c.buckets[b.key], 0))}</th>)}
                  <th className="r num">{baht(list.reduce((sum, c) => sum + c.total, 0))}</th>
                  <th />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!list.length && <div className="empty"><b>ไม่มีลูกหนี้ค้างชำระ{only ? "ในช่วงนี้" : ""}</b>ใบแจ้งหนี้ทุกใบชำระครบแล้ว</div>}
      </section>
    </main>
  );
}
