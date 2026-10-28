// /admin/inquiries — กล่องคำขอจากลูกค้า (ขอใบเสนอราคา/ติดต่อ/เคลม) แยกตามสถานะ + ค้นหา
import Link from "next/link";
import { Pagination, readPer } from "../../_components/Pagination";
import type { Prisma } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { formatPhone, phoneDigits } from "@/lib/format";
import { INQ_KIND, INQ_STATUS, INQ_STATUS_CLS, isInqKind, isInqStatus, parseAttachments, parseInqItems } from "@/lib/inquiries";
import { prisma } from "@/lib/prisma";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const TABS = ["OPEN", "NEW", "IN_PROGRESS", "DONE", "SPAM", "ALL"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { OPEN: "ต้องดำเนินการ", NEW: "ใหม่", IN_PROGRESS: "กำลังดำเนินการ", DONE: "เสร็จแล้ว", SPAM: "สแปม", ALL: "ทั้งหมด" };

export default async function InquiriesPage({ searchParams }: PageProps<"/admin/inquiries">) {
  await requireAdmin();
  const sp = await searchParams;
  const PER = readPer(sp.per, 30);
  const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as Tab) : "OPEN";
  const kind = isInqKind(one(sp.kind)) ? one(sp.kind) : "";
  const q = one(sp.q).trim().slice(0, 80);
  const d = phoneDigits(q);
  const base: Prisma.InquiryWhereInput = {
    ...(kind ? { kind: kind as keyof typeof INQ_KIND } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }, ...(d.length >= 3 ? [{ phone: { contains: d } }] : [])] } : {}),
  };
  const statusWhere = (t: Tab): Prisma.InquiryWhereInput => (t === "ALL" ? {} : t === "OPEN" ? { status: { in: ["NEW", "IN_PROGRESS"] } } : isInqStatus(t) ? { status: t } : {});
  const where = { ...base, ...statusWhere(tab) };
  const [total, counts] = await Promise.all([prisma.inquiry.count({ where }), prisma.inquiry.groupBy({ by: ["status"], where: base, _count: true })]);
  const cnt = (t: Tab) => counts.filter((c) => t === "ALL" || (t === "OPEN" ? c.status === "NEW" || c.status === "IN_PROGRESS" : c.status === t)).reduce((s, c) => s + c._count, 0);
  const pages = Math.max(1, Math.ceil(total / PER));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const rows = await prisma.inquiry.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * PER, take: PER });
  const qs = (patch: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries({ per: PER === 30 ? "" : String(PER), tab: tab === "OPEN" ? "" : tab, kind, q, ...patch }).filter(([, v]) => v)).toString();
    return `/admin/inquiries${s ? `?${s}` : ""}`;
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>คำขอจากลูกค้า</h1>
          <p>ขอใบเสนอราคา และติดต่อสอบถามจากหน้าเว็บ — เปิดดูเพื่อจดโน้ต เปลี่ยนสถานะ หรือสร้างใบเสนอราคา · เรื่องเคลม/คืนสินค้าใหม่อยู่ที่ <Link className="link" href="/admin/claims">เคลม / คืนสินค้า</Link> (คำขอเคลมเดิมยังเปิดดูได้ที่นี่)</p>
        </div>
      </div>
      {one(sp.deleted) === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>ลบคำขอแล้ว</div>}
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <Link key={t} className={`tab ${tab === t ? "on" : ""}`} role="tab" aria-selected={tab === t} href={qs({ tab: t === "OPEN" ? "" : t, page: "" })}>
                {TAB_LABEL[t]} <em>{cnt(t)}</em>
              </Link>
            ))}
          </div>
        </div>
        <form className="toolbar2" action="/admin/inquiries" role="search">
          {tab !== "OPEN" && <input type="hidden" name="tab" value={tab} />}
          <label className="sr-only" htmlFor="iq">ค้นหาคำขอ</label>
          <input id="iq" className="sel inq-q" name="q" type="search" defaultValue={q} placeholder="ชื่อ, บริษัท, เบอร์โทร, ข้อความ" />
          <label className="sr-only" htmlFor="ik">ประเภท</label>
          <select id="ik" className="sel" name="kind" defaultValue={kind}>
            <option value="">ทุกประเภท</option>
            {Object.entries(INQ_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn btn-dark btn-sm" type="submit">ค้นหา</button>
        </form>
        <ul className="inq-list">
          {rows.map((r) => {
            const items = parseInqItems(r.items);
            const att = parseAttachments(r.attachments).length;
            return (
              <li key={r.id} className={`inq-row${r.status === "NEW" ? " is-new" : ""}`}>
                <Link href={`/admin/inquiries/${r.id}`} className="inq-link">
                  <div className="inq-main">
                    <b>{r.name}{r.company ? <span className="sub inl"> · {r.company}</span> : null}</b>
                    <span className="inq-msg">{r.message}</span>
                    <span className="sub">
                      {formatPhone(r.phone)}{items.length ? ` · สนใจ ${items.length} รายการ` : ""}{att ? ` · รูปแนบ ${att}` : ""}{r.quotationId ? " · มีใบเสนอราคาแล้ว" : ""}
                    </span>
                  </div>
                  <div className="inq-side">
                    <span className={`chip ${INQ_STATUS_CLS[r.status]}`}>{INQ_STATUS[r.status]}</span>
                    <span className="chip gray">{INQ_KIND[r.kind]}</span>
                    <span className="sub">{fmt(r.createdAt)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {!rows.length && <div className="empty"><b>{q || kind ? "ไม่พบคำขอตามที่ค้นหา" : tab === "OPEN" ? "ไม่มีคำขอค้าง" : "ยังไม่มีคำขอ"}</b>คำขอจากแบบฟอร์มหน้าเว็บจะขึ้นที่นี่</div>}
        <Pagination page={page} pages={pages} total={total} shown={rows.length} per={PER} unit="รายการ" href={(n, pp) => qs({ page: n > 1 ? String(n) : "", per: pp === 30 ? "" : String(pp) })} />
      </section>
    </main>
  );
}
