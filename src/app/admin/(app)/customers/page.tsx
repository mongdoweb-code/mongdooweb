// /admin/customers — ลูกค้า: ค้นหา (ชื่อ/รหัส/เบอร์/เลขผู้เสียภาษี/แท็ก), ยอดค้างชำระ, จำนวนเอกสาร
// รอบ 3 (A23): กลุ่มลูกค้า — แท็ก, ยอดซื้อรวม, ซื้อล่าสุด, ตัวกรอง (แท็ก/ยอดซื้อ/วันที่ซื้อล่าสุด/มีเลขผู้เสียภาษี) + ส่งออกสำหรับบรอดแคสต์
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { allTags, parseSegment, segmentActive, segmentCustomers, segmentQuery } from "@/lib/customer-segments";
import { money } from "@/lib/doc-calc";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import "../../lot12.css";

const PER = 30;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const day = (d: Date | null) => (d ? d.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }) : "—");

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireAdmin();
  const sp = await searchParams;
  const f = parseSegment(sp);
  const [list, tags] = await Promise.all([segmentCustomers(f), allTags()]);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PER));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const rows = list.slice((page - 1) * PER, page * PER);
  const owe = rows.length
    ? await prisma.salesDocument.groupBy({ by: ["customerId"], where: { customerId: { in: rows.map((r) => r.id) }, type: "INVOICE", status: { in: ["ISSUED", "PARTIAL"] } }, _sum: { grandSatang: true, paidSatang: true } })
    : [];
  const oweOf = (id: string) => { const o = owe.find((x) => x.customerId === id); return o ? (o._sum.grandSatang ?? 0) - (o._sum.paidSatang ?? 0) : 0; };
  const qs = (patch: Record<string, string>) => `/admin/customers${segmentQuery(f, patch)}`;
  const spendSum = list.reduce((s, c) => s + c.stats.spendSatang, 0);
  const seg = segmentActive(f);
  return (
    <main className="main" id="page-customers">
      <div className="page-head">
        <div><h1>ลูกค้า</h1><p>ข้อมูลลูกค้าสำหรับใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จ · {seg || f.q || f.kind ? "ตามตัวกรอง" : "ทั้งหมด"} <span id="cuTotal">{total}</span> ราย · ยอดซื้อรวม ฿{money(spendSum)}</p></div>
        <div className="head-actions">
          <a className="btn btn-outline" href={`/admin/customers/export.csv${segmentQuery(f, { sort: "" })}`} download>ส่งออก CSV</a>
          <a className="btn btn-outline" href={`/admin/customers/broadcast.csv${segmentQuery(f, { sort: "" })}`} download id="cuBroadcast">ส่งออกสำหรับบรอดแคสต์</a>
          <Link className="btn btn-primary" href="/admin/customers/new">+ เพิ่มลูกค้า</Link>
        </div>
      </div>
      {sp.deleted === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ลบลูกค้าแล้ว</div>}
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {([["", "ทั้งหมด"], ["COMPANY", "นิติบุคคล"], ["PERSON", "บุคคลธรรมดา"]] as const).map(([k, l]) => (
              <Link key={k} className={`tab ${f.kind === k ? "on" : ""}`} role="tab" aria-selected={f.kind === k} href={qs({ kind: k, page: "" })}>{l}</Link>
            ))}
          </div>
          <form className="search" action="/admin/customers" role="search">
            {Object.entries({ ...f, q: "" }).filter(([, v]) => v && v !== "code").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <label className="sr-only" htmlFor="cq">ค้นหาลูกค้า</label>
            <input id="cq" name="q" type="search" defaultValue={f.q} placeholder="ชื่อ, รหัส, เบอร์โทร, เลขผู้เสียภาษี, แท็ก" />
          </form>
        </div>
        <details className="seg-box" open={seg}>
          <summary>กลุ่มลูกค้า / ตัวกรองเพิ่มเติม{seg ? " (กำลังกรอง)" : ""}</summary>
          <form className="seg-form" action="/admin/customers" id="segForm">
            {f.q && <input type="hidden" name="q" value={f.q} />}
            {f.kind && <input type="hidden" name="kind" value={f.kind} />}
            <div className="field">
              <label htmlFor="sgTag">แท็ก</label>
              <select id="sgTag" name="tag" defaultValue={f.tag}>
                <option value="">ทุกแท็ก</option>
                {tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.n})</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="sgMin">ยอดซื้อรวมตั้งแต่ (บาท)</label><input id="sgMin" name="minSpend" inputMode="decimal" defaultValue={f.minSpend} /></div>
            <div className="field"><label htmlFor="sgMax">ถึง (บาท)</label><input id="sgMax" name="maxSpend" inputMode="decimal" defaultValue={f.maxSpend} /></div>
            <div className="field"><label htmlFor="sgFrom">ซื้อล่าสุดตั้งแต่</label><input id="sgFrom" type="date" name="lastFrom" defaultValue={f.lastFrom} /></div>
            <div className="field"><label htmlFor="sgTo">ถึง</label><input id="sgTo" type="date" name="lastTo" defaultValue={f.lastTo} /></div>
            <div className="field">
              <label htmlFor="sgTax">เลขผู้เสียภาษี</label>
              <select id="sgTax" name="taxId" defaultValue={f.taxId}><option value="">ทั้งหมด</option><option value="yes">มีเลขผู้เสียภาษี</option><option value="no">ไม่มี</option></select>
            </div>
            <div className="field">
              <label htmlFor="sgSort">เรียงตาม</label>
              <select id="sgSort" name="sort" defaultValue={f.sort}><option value="code">รหัสลูกค้า (ใหม่ก่อน)</option><option value="spend">ยอดซื้อรวมมากสุด</option><option value="last">ซื้อล่าสุด</option></select>
            </div>
            <div className="seg-acts">
              <button className="btn btn-dark btn-sm" type="submit">กรอง</button>
              {seg && <Link className="link" href={`/admin/customers${segmentQuery({ ...f, tag: "", taxId: "", minSpend: "", maxSpend: "", lastFrom: "", lastTo: "" })}`}>ล้างตัวกรอง</Link>}
            </div>
          </form>
          {tags.length > 0 && (
            <div className="seg-tags" aria-label="แท็กที่ใช้บ่อย">
              {tags.slice(0, 20).map((t) => <Link key={t.tag} className={`tag-chip${f.tag === t.tag ? " on" : ""}`} href={qs({ tag: f.tag === t.tag ? "" : t.tag, page: "" })}>{t.tag} <small>{t.n}</small></Link>)}
            </div>
          )}
        </details>
        <table className="tbl" id="cuTable">
          <thead><tr><th style={{ width: 70 }}>รหัส</th><th>ลูกค้า</th><th>ติดต่อ</th><th className="r">ยอดซื้อรวม</th><th>ซื้อล่าสุด</th><th className="r">ค้างชำระ</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const o = oweOf(c.id);
              return (
                <tr key={c.id} data-code={c.code}>
                  <td className="num cu-code">{c.code}</td>
                  <td>
                    <Link className="row-link" href={`/admin/customers/${c.id}`}><b>{c.name}</b>
                      <span className="sub">{c.kind === "COMPANY" ? `นิติบุคคล · ${c.branch ?? "สำนักงานใหญ่"}` : "บุคคลธรรมดา"}{c.taxId ? ` · ${c.taxId}` : ""}</span></Link>
                    {c.marketingOptOut && <span className="dst dst-bad cu-optout" title="คัดค้านการตลาด (PDPA) — ไม่อยู่ในไฟล์บรอดแคสต์">ไม่รับข่าวสาร</span>}
                    {c.tags.length > 0 && <span className="cu-tags">{c.tags.map((t) => <span key={t} className="tag-chip sm">{t}</span>)}</span>}
                  </td>
                  <td className="sub" style={{ fontSize: 13.5 }}>{c.phone ? formatPhone(c.phone) : "—"}{c.province ? ` · ${c.province}` : ""}</td>
                  <td className="r num cu-spend">{c.stats.spendSatang ? `฿${money(c.stats.spendSatang)}` : <span className="sub">—</span>}<span className="sub">{c.stats.orders + c.stats.receipts ? `${c.stats.orders + c.stats.receipts} ครั้ง` : `เอกสาร ${c._count.documents}`}</span></td>
                  <td className="sub">{day(c.stats.lastAt)}</td>
                  <td className="r num">{o > 0 ? <b className="owe">฿{money(o)}</b> : <span className="sub">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>{f.q || seg ? "ไม่พบลูกค้าตามตัวกรอง" : "ยังไม่มีลูกค้า"}</b><Link className="link" href="/admin/customers/new">เพิ่มลูกค้า</Link></div>}
        {total > PER && (
          <div className="tbl-foot">
            <span>แสดง {(page - 1) * PER + 1}–{(page - 1) * PER + rows.length} จาก {total} ราย</span>
            <div className="pager">
              {page > 1 && <Link className="btn btn-outline btn-sm" href={qs({ page: String(page - 1) })}>← ก่อนหน้า</Link>}
              <span className="num">หน้า {page}/{pages}</span>
              {page < pages && <Link className="btn btn-outline btn-sm" href={qs({ page: String(page + 1) })}>ถัดไป →</Link>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
