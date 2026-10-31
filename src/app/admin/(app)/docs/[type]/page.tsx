// /admin/docs/QUOTATION|INVOICE|RECEIPT — รายการเอกสารขาย: KPI, แท็บสถานะ, ค้นหา, ช่วงวันที่, แบ่งหน้า, ส่งออก CSV
import Link from "next/link";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { Icons } from "../../../_components/RowActions";
import { deleteDraft, reviseQuote } from "../actions";
import { VoidIcon } from "../DocForms";
import { Pagination } from "../../../_components/Pagination";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { docDate, fromYmd, money, ymdBkk } from "@/lib/doc-calc";
import { DOC_META, DOC_ST, DOC_TABS } from "@/lib/doc-render";
import { listDocs, parseDocFilter } from "@/lib/doc-list";
import { isDocType, statusOf, statusWhere, todayYmd, ymdOf } from "@/lib/docs";
import { prisma } from "@/lib/prisma";

export default async function DocsListPage({ params, searchParams }: PageProps<"/admin/docs/[type]">) {
  await requireAdmin();
  const [{ type }, sp] = await Promise.all([params, searchParams]);
  if (!isDocType(type)) notFound();
  const f = parseDocFilter(type, sp);
  const meta = DOC_META[type];
  const today = todayYmd();
  const monthStart = fromYmd(today.slice(0, 8) + "01");
  const { rows, total, page, pages } = await listDocs(type, f);
  const era = (await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { dateEra: true } }))?.dateEra ?? "AD";

  // KPI
  const sum = (w: Parameters<typeof prisma.salesDocument.aggregate>[0]["where"]) =>
    prisma.salesDocument.aggregate({ where: { type, ...w }, _count: { _all: true }, _sum: { grandSatang: true, paidSatang: true } });
  const counts = await Promise.all(DOC_TABS[type].map(([k]) => prisma.salesDocument.count({ where: { type, ...statusWhere(k) } })));
  let kpis: { label: string; value: string; sub: string; tab?: string; hot?: boolean }[] = [];
  if (type === "QUOTATION") {
    const [open, acc, exp, draft] = await Promise.all([sum(statusWhere("open")), sum({ status: "ACCEPTED", issueDate: { gte: monthStart } }), sum(statusWhere("expired")), sum({ status: "DRAFT" })]);
    kpis = [
      { label: "รอตอบรับ", value: String(open._count._all), sub: `มูลค่า ฿${money(open._sum.grandSatang ?? 0)}`, tab: "open", hot: open._count._all > 0 },
      { label: "ตอบรับแล้ว (เดือนนี้)", value: String(acc._count._all), sub: `฿${money(acc._sum.grandSatang ?? 0)}`, tab: "accepted" },
      { label: "หมดอายุ (ยังไม่ตอบ)", value: String(exp._count._all), sub: "ควรติดตามลูกค้า", tab: "expired" },
      { label: "ฉบับร่าง", value: String(draft._count._all), sub: "ยังไม่ออกเลขที่", tab: "draft" },
    ];
  } else if (type === "INVOICE") {
    const [owe, over, draft, paidMonth] = await Promise.all([
      sum({ status: { in: ["ISSUED", "PARTIAL"] } }), sum(statusWhere("overdue")), sum({ status: "DRAFT" }),
      prisma.docPayment.aggregate({ where: { voided: false, paidAt: { gte: monthStart } }, _sum: { amountSatang: true }, _count: { _all: true } }),
    ]);
    const outstanding = (a: typeof owe) => (a._sum.grandSatang ?? 0) - (a._sum.paidSatang ?? 0);
    kpis = [
      { label: "ยอดค้างชำระ", value: `฿${money(outstanding(owe))}`, sub: `${owe._count._all} ใบ`, tab: "unpaid" },
      { label: "เกินกำหนด", value: String(over._count._all), sub: `฿${money(outstanding(over))}`, tab: "overdue", hot: over._count._all > 0 },
      { label: "รับชำระเดือนนี้", value: `฿${money(paidMonth._sum.amountSatang ?? 0)}`, sub: `${paidMonth._count._all} รายการ` },
      { label: "ฉบับร่าง", value: String(draft._count._all), sub: "ยังไม่ออกเลขที่", tab: "draft" },
    ];
  } else {
    const [month, all, voids, draft] = await Promise.all([sum({ status: "ISSUED", issueDate: { gte: monthStart } }), sum({ status: "ISSUED" }), sum({ status: "VOID" }), sum({ status: "DRAFT" })]);
    kpis = [
      { label: "ออกเดือนนี้", value: String(month._count._all), sub: `฿${money(month._sum.grandSatang ?? 0)}`, tab: "issued" },
      { label: "ใบเสร็จทั้งหมด", value: String(all._count._all), sub: `฿${money(all._sum.grandSatang ?? 0)}` },
      { label: "ยกเลิก", value: String(voids._count._all), sub: "เลขที่ยังเก็บไว้", tab: "void" },
      { label: "ฉบับร่าง", value: String(draft._count._all), sub: "ยังไม่ออกเลขที่", tab: "draft" },
    ];
  }

  const qs = (patch: Record<string, string | number>) => {
    const v = new URLSearchParams(Object.entries({ tab: f.tab === "all" ? "" : f.tab, q: f.q, from: f.from, to: f.to, per: f.per === 20 ? "" : f.per, page: "", ...patch }).map(([k, x]) => [k, String(x)]).filter(([, x]) => x));
    const s = v.toString();
    return s ? `?${s}` : "";
  };
  const base = `/admin/docs/${type}`;
  const flash = sp.deleted === "1" ? "ลบฉบับร่างแล้ว" : "";

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>{meta.th}</h1>
          <p>{type === "QUOTATION" ? "เสนอราคา → ลูกค้าตอบรับ → แปลงเป็นใบแจ้งหนี้ได้ทันที" : type === "INVOICE" ? "วางบิล + QR พร้อมเพย์ตามยอดค้าง · บันทึกรับชำระแล้วออกใบเสร็จให้อัตโนมัติ" : "ใบเสร็จออกอัตโนมัติเมื่อบันทึกรับชำระ หรือออกจากคำสั่งซื้อหน้าเว็บ"}</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href={`/admin/docs.csv${qs({ type })}`}>ส่งออก CSV</a>
          <Link className="btn btn-primary" href={`${base}/new/edit`}>+ สร้าง{meta.th.split(" /")[0]}</Link>
        </div>
      </div>
      {flash && <div className="login-info" role="status" style={{ marginBottom: 12 }}>{flash}</div>}

      <div className="kpis">
        {kpis.map((k) =>
          k.tab ? (
            <Link key={k.label} className={`kpi ${k.hot ? "hot" : ""}`} href={`${base}${qs({ tab: k.tab })}`}><span>{k.label}</span><b className="num">{k.value}</b><small>{k.sub}</small></Link>
          ) : (
            <div key={k.label} className="kpi"><span>{k.label}</span><b className="num">{k.value}</b><small>{k.sub}</small></div>
          ),
        )}
      </div>

      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {DOC_TABS[type].map(([k, l], i) => (
              <Link key={k} className={`tab ${f.tab === k ? "on" : ""}`} role="tab" aria-selected={f.tab === k} href={`${base}${qs({ tab: k === "all" ? "" : k })}`}>
                {l}<em>{counts[i]}</em>
              </Link>
            ))}
          </div>
        </div>
        <form className="toolbar2 doc-filter" action={base}>
          {f.tab !== "all" && <input type="hidden" name="tab" value={f.tab} />}
          <label className="search" style={{ flex: 1, minWidth: 220 }}>
            <span className="sr-only">ค้นหาเอกสาร</span>
            <input name="q" type="search" defaultValue={f.q} placeholder="เลขที่, ชื่อ/รหัสลูกค้า, เบอร์โทร, เลขผู้เสียภาษี, สินค้า" />
          </label>
          <span className="lbl">วันที่</span>
          <label className="sr-only" htmlFor="dFrom">ตั้งแต่วันที่</label>
          <input className="sel" type="date" id="dFrom" name="from" defaultValue={f.from} />
          <span>ถึง</span>
          <label className="sr-only" htmlFor="dTo">ถึงวันที่</label>
          <input className="sel" type="date" id="dTo" name="to" defaultValue={f.to} />
          <button className="btn btn-outline btn-sm" type="submit">ค้นหา</button>
          {(f.q || f.from || f.to) && <Link className="link" href={`${base}${qs({ q: "", from: "", to: "" })}`}>ล้างตัวกรอง</Link>}
        </form>
        <table className="tbl doc-tbl">
          <thead>
            <tr>
              <th>เลขที่ / วันที่</th><th>ลูกค้า</th>
              <th>{type === "QUOTATION" ? "ยืนราคาถึง" : type === "INVOICE" ? "ครบกำหนด / ค้างชำระ" : "ชำระโดย / อ้างอิง"}</th>
              <th className="r">ยอดรวม</th><th>สถานะ</th><th className="r col-acts">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const st = statusOf(d, today);
              const [stl, stc] = DOC_ST[st];
              const href = `${base}/${d.id}`;
              const c4 =
                type === "QUOTATION" ? docDate(ymdOf(d.validUntil), era)
                : type === "INVOICE" ? (
                  <>{docDate(ymdOf(d.dueDate), era)}{d.status !== "DRAFT" && d.status !== "VOID" && d.grandSatang - d.paidSatang > 0 && <span className="sub owe">ค้าง ฿{money(d.grandSatang - d.paidSatang)}</span>}</>
                ) : (
                  <>{d.paymentMethod ?? "—"}{d.order && <span className="sub">{d.order.orderNo}</span>}</>
                );
              return (
                <tr key={d.id} className={st === "void" ? "row-off" : ""}>
                  <td>
                    <Link className="row-link" href={href}>
                      <b className={d.docNo ? "num" : "draft-no"}>{d.docNo ?? "ฉบับร่าง"}</b>
                      <span className="sub">{d.issueDate ? docDate(ymdBkk(d.issueDate), era) : `สร้าง ${docDate(ymdBkk(d.createdAt), era)}`} · {d._count.items} รายการ</span>
                    </Link>
                  </td>
                  <td><b>{d.customer?.name ?? "—"}</b>{d.customer && <span className="sub">รหัส {d.customer.code}</span>}</td>
                  <td className="num" style={{ fontSize: 13.5 }}>{c4}</td>
                  <td className="r num"><b style={st === "void" ? { textDecoration: "line-through" } : undefined}>{money(d.grandSatang)}</b></td>
                  <td><span className={`dst dst-${stc}`}>{stl}</span></td>
                  <td className="r">
                    <DocActions d={d} href={href} label={`${meta.th.split(" /")[0]} ${d.docNo ?? "ฉบับร่าง"}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <b>{f.q || f.from || f.to || f.tab !== "all" ? "ไม่พบเอกสารตามตัวกรอง" : `ยังไม่มี${meta.th.split(" /")[0]}`}</b>
            {type === "RECEIPT" ? "ใบเสร็จจะออกอัตโนมัติเมื่อบันทึกรับชำระในใบแจ้งหนี้ หรือกด “ออกใบเสร็จ” ในคำสั่งซื้อ" : <Link className="link" href={`${base}/new/edit`}>สร้างฉบับแรก</Link>}
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} shown={rows.length} per={f.per} unit="ฉบับ" href={(n, pp) => `${base}${qs({ page: n > 1 ? n : "", per: pp === 20 ? "" : pp })}`} />
      </section>
    </main>
  );
}

const PRINT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="7" /></svg>
);

/** ดู · แก้ไข · พิมพ์ · ยกเลิก · ลบ — ปุ่มที่ใช้ไม่ได้ตามสถานะจะจางพร้อมบอกเหตุผลเมื่อชี้ */
function DocActions({ d, href, label }: { d: { id: string; type: string; status: string; docNo: string | null }; href: string; label: string }) {
  const draft = d.status === "DRAFT", voided = d.status === "VOID";
  const off = (cls: string, icon: React.ReactNode, tip: string, name: string) => (
    <span className={`ra ${cls}`} aria-disabled="true" data-tip={tip}>{icon}<span className="sr-only">{name} ({tip})</span></span>
  );
  const revisable = d.type === "QUOTATION" && ["ISSUED", "REJECTED"].includes(d.status);
  return (
    <div className="row-acts">
      <Link className="ra ra-view" href={href} data-tip="ดู" aria-label={`ดู ${label}`}>{Icons.eye}</Link>
      {draft ? (
        <Link className="ra ra-edit" href={`${href}/edit`} data-tip="แก้ไข" aria-label={`แก้ไข ${label}`}>{Icons.edit}</Link>
      ) : revisable ? (
        <form action={reviseQuote}>
          <input type="hidden" name="id" value={d.id} />
          <button type="submit" className="ra ra-edit" data-tip="แก้ไข (สร้างฉบับแก้ไข)" aria-label={`แก้ไข ${label} (สร้างฉบับแก้ไข)`}>{Icons.edit}</button>
        </form>
      ) : (
        off("ra-edit", Icons.edit, voided ? "ยกเลิกแล้ว" : d.status === "ACCEPTED" ? "ลูกค้าตอบรับแล้ว — แก้ไม่ได้" : "ออกเลขแล้ว แก้ไม่ได้ — ยกเลิกแล้วออกใหม่", "แก้ไข")
      )}
      {draft ? off("ra-print", PRINT, "ออกเอกสารก่อนจึงพิมพ์ได้", "พิมพ์") : <a className="ra ra-print" href={`/admin/print/doc/${d.id}?auto=1`} target="_blank" rel="noopener" data-tip="พิมพ์ / PDF" aria-label={`พิมพ์ ${label}`}>{PRINT}</a>}
      {draft || voided ? off("ra-void", VOID_ICON, voided ? "ยกเลิกแล้ว" : "ฉบับร่าง — ใช้ลบแทน", "ยกเลิก") : <VoidIcon id={d.id} label={label} />}
      {draft ? (
        <form action={deleteDraft}>
          <input type="hidden" name="id" value={d.id} />
          <ConfirmSubmit className="ra ra-del" title="ลบฉบับร่างนี้?" body={`${label} — ยังไม่ได้ออกเลขที่ ลบแล้วกู้คืนไม่ได้`} confirmLabel="ลบฉบับร่าง" tip="ลบ" ariaLabel={`ลบ ${label}`}>
            {Icons.trash}
          </ConfirmSubmit>
        </form>
      ) : (
        off("ra-del", Icons.trash, "ออกเลขแล้วลบไม่ได้ (เลขที่ห้ามซ้ำ) — ใช้ยกเลิก", "ลบ")
      )}
    </div>
  );
}
const VOID_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></svg>
);
