// /admin/customers — ลูกค้าสำหรับเอกสารขาย: ค้นหา (ชื่อ/รหัส/เบอร์/เลขผู้เสียภาษี), ยอดค้างชำระ, จำนวนเอกสาร
import Link from "next/link";
import type { Prisma } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/doc-calc";
import { formatPhone, phoneDigits } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const PER = 30;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 80);
  const kind = one(sp.kind) === "COMPANY" ? "COMPANY" : one(sp.kind) === "PERSON" ? "PERSON" : "";
  const d = phoneDigits(q);
  const where: Prisma.CustomerWhereInput = {
    ...(kind ? { kind } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: q }, { contactName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, ...(d.length >= 3 ? [{ phone: { contains: d } }, { taxId: { contains: d } }] : [])] } : {}),
  };
  const total = await prisma.customer.count({ where });
  const pages = Math.max(1, Math.ceil(total / PER));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const rows = await prisma.customer.findMany({ where, orderBy: { code: "desc" }, skip: (page - 1) * PER, take: PER, include: { _count: { select: { documents: true, orders: true } } } });
  const owe = rows.length
    ? await prisma.salesDocument.groupBy({ by: ["customerId"], where: { customerId: { in: rows.map((r) => r.id) }, type: "INVOICE", status: { in: ["ISSUED", "PARTIAL"] } }, _sum: { grandSatang: true, paidSatang: true } })
    : [];
  const oweOf = (id: string) => { const o = owe.find((x) => x.customerId === id); return o ? (o._sum.grandSatang ?? 0) - (o._sum.paidSatang ?? 0) : 0; };
  const qs = (patch: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries({ q, kind, ...patch }).filter(([, v]) => v)).toString();
    return `/admin/customers${s ? `?${s}` : ""}`;
  };
  return (
    <main className="main">
      <div className="page-head">
        <div><h1>ลูกค้า</h1><p>ข้อมูลลูกค้าสำหรับใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จ · ทั้งหมด {total} ราย</p></div>
        <div className="head-actions"><Link className="btn btn-primary" href="/admin/customers/new">+ เพิ่มลูกค้า</Link></div>
      </div>
      {sp.deleted === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ลบลูกค้าแล้ว</div>}
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {([["", "ทั้งหมด"], ["COMPANY", "นิติบุคคล"], ["PERSON", "บุคคลธรรมดา"]] as const).map(([k, l]) => (
              <Link key={k} className={`tab ${kind === k ? "on" : ""}`} role="tab" aria-selected={kind === k} href={qs({ kind: k, page: "" })}>{l}</Link>
            ))}
          </div>
          <form className="search" action="/admin/customers" role="search">
            {kind && <input type="hidden" name="kind" value={kind} />}
            <label className="sr-only" htmlFor="cq">ค้นหาลูกค้า</label>
            <input id="cq" name="q" type="search" defaultValue={q} placeholder="ชื่อ, รหัส, เบอร์โทร, เลขผู้เสียภาษี" />
          </form>
        </div>
        <table className="tbl">
          <thead><tr><th style={{ width: 70 }}>รหัส</th><th>ลูกค้า</th><th>ติดต่อ</th><th className="r">เอกสาร</th><th className="r">ค้างชำระ</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const o = oweOf(c.id);
              return (
                <tr key={c.id}>
                  <td className="num cu-code">{c.code}</td>
                  <td>
                    <Link className="row-link" href={`/admin/customers/${c.id}`}><b>{c.name}</b>
                      <span className="sub">{c.kind === "COMPANY" ? `นิติบุคคล · ${c.branch ?? "สำนักงานใหญ่"}` : "บุคคลธรรมดา"}{c.taxId ? ` · ${c.taxId}` : ""}</span></Link>
                  </td>
                  <td className="sub" style={{ fontSize: 13.5 }}>{c.phone ? formatPhone(c.phone) : "—"}{c.province ? ` · ${c.province}` : ""}</td>
                  <td className="r num">{c._count.documents}{c._count.orders ? <span className="sub">เว็บ {c._count.orders}</span> : null}</td>
                  <td className="r num">{o > 0 ? <b className="owe">฿{money(o)}</b> : <span className="sub">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>{q ? "ไม่พบลูกค้า" : "ยังไม่มีลูกค้า"}</b><Link className="link" href="/admin/customers/new">เพิ่มลูกค้า</Link></div>}
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
