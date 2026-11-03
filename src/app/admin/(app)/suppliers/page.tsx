// /admin/suppliers — ทะเบียนผู้ขาย: ค้นหา · จำนวนใบสั่งซื้อ/ยอดสั่ง/สั่งล่าสุด · สร้างใบสั่งซื้อให้ผู้ขาย · เปิด/ปิดใช้ · ดู/แก้ไข/ลบ
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { Pagination, paginate } from "../../_components/Pagination";
import { Icons, RowActions } from "../../_components/RowActions";
import { deleteSupplier, toggleSupplier } from "./actions";
import "../../lot3.css";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const baht = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const day = (d: Date | null) => (d ? d.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }) : "—");

export default async function SuppliersPage({ searchParams }: PageProps<"/admin/suppliers">) {
  await requireOwner();
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 80);
  const show = one(sp.show) === "all" ? "all" : "active";
  const [list, stats] = await Promise.all([
    prisma.supplier.findMany({
      where: {
        ...(show === "active" ? { isActive: true } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { contact: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }, { lineId: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { name: "asc" },
      include: { _count: { select: { orders: true } } },
    }),
    prisma.purchaseOrder.groupBy({ by: ["supplierId"], where: { supplierId: { not: null }, status: { not: "CANCELLED" }, poNo: { not: null } }, _count: { _all: true }, _sum: { totalSatang: true }, _max: { orderedAt: true } }),
  ]);
  const st = new Map(stats.map((s) => [s.supplierId!, s]));
  const pg = paginate(list, sp, "/admin/suppliers", ["q", "show"], 30);

  return (
    <main className="main" id="page-suppliers">
      <div className="page-head">
        <div>
          <h1>ผู้ขาย (ซัพพลายเออร์)</h1>
          <p>ทะเบียนผู้ขาย ใช้เลือกตอนสร้างใบสั่งซื้อ และดูประวัติการสั่ง/ราคาทุนของแต่ละราย</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href="/admin/purchase-orders">ใบสั่งซื้อ (PO)</Link>
          <Link className="btn btn-primary" href="/admin/suppliers/new">+ เพิ่มผู้ขาย</Link>
        </div>
      </div>
      {sp.deleted === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ลบผู้ขายแล้ว</div>}
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            <Link className={`tab ${show === "active" ? "on" : ""}`} role="tab" aria-selected={show === "active"} href={`/admin/suppliers${q ? `?q=${encodeURIComponent(q)}` : ""}`}>ใช้งานอยู่</Link>
            <Link className={`tab ${show === "all" ? "on" : ""}`} role="tab" aria-selected={show === "all"} href={`/admin/suppliers?show=all${q ? `&q=${encodeURIComponent(q)}` : ""}`}>ทั้งหมด</Link>
          </div>
          <form className="search" action="/admin/suppliers" role="search">
            {show === "all" && <input type="hidden" name="show" value="all" />}
            <label className="sr-only" htmlFor="supq">ค้นหาผู้ขาย</label>
            <input id="supq" name="q" type="search" defaultValue={q} placeholder="ชื่อ ผู้ติดต่อ เบอร์โทร LINE" />
          </form>
        </div>
        <div className="tbl-wrap">
          <table className="tbl" id="supTable">
            <thead>
              <tr><th>ผู้ขาย</th><th>ติดต่อ</th><th className="r">ใบสั่งซื้อ</th><th className="r">ยอดสั่งรวม</th><th>สั่งล่าสุด</th><th>สถานะ</th><th className="r col-acts">การดำเนินการ</th></tr>
            </thead>
            <tbody>
              {pg.rows.map((s) => {
                const x = st.get(s.id);
                return (
                  <tr key={s.id} data-sup={s.name}>
                    <td><Link className="link" href={`/admin/suppliers/${s.id}`}><b>{s.name}</b></Link>{s.terms && <span className="sub">{s.terms}</span>}</td>
                    <td>{s.contact ?? "—"}<span className="sub">{[s.phone && formatPhone(s.phone), s.lineId && `LINE ${s.lineId}`].filter(Boolean).join(" · ")}</span></td>
                    <td className="r num">{x?._count._all ?? 0}</td>
                    <td className="r num">{baht(x?._sum.totalSatang ?? 0)}</td>
                    <td className="sub">{day(x?._max.orderedAt ?? null)}</td>
                    <td>
                      <form action={toggleSupplier}>
                        <input type="hidden" name="id" value={s.id} /><input type="hidden" name="back" value="list" />
                        <button className={`sw${s.isActive ? " on" : ""}`} type="submit" role="switch" aria-checked={s.isActive} aria-label={`ใช้งานผู้ขาย ${s.name}`} data-tip={s.isActive ? "ใช้งานอยู่ — กดเพื่อปิด" : "ปิดอยู่ — กดเพื่อเปิด"}>
                          <span className="sw-knob" aria-hidden="true" />
                        </button>
                      </form>
                    </td>
                    <td className="r">
                      <RowActions
                        name={s.name}
                        before={<Link className="ra ra-dup" href={`/admin/purchase-orders/new?supplier=${s.id}`} data-tip="สร้างใบสั่งซื้อ" aria-label={`สร้างใบสั่งซื้อจาก ${s.name}`}>{Icons.plusDoc}</Link>}
                        viewHref={`/admin/suppliers/${s.id}`}
                        viewNewTab={false}
                        editHref={`/admin/suppliers/${s.id}#edit`}
                        del={{ action: deleteSupplier, id: s.id, title: `ลบผู้ขาย ${s.name}?`, body: "ลบออกจากทะเบียน (ยังไม่เคยมีใบสั่งซื้อ)", disabled: s._count.orders ? "มีใบสั่งซื้อแล้ว ลบไม่ได้ — ใช้สวิตช์ปิดใช้แทน" : undefined }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!pg.total && <div className="empty"><b>{q ? "ไม่พบผู้ขายที่ค้นหา" : "ยังไม่มีผู้ขาย"}</b><Link className="link" href="/admin/suppliers/new">เพิ่มผู้ขาย</Link></div>}
        <Pagination page={pg.page} pages={pg.pages} total={pg.total} shown={pg.rows.length} per={pg.per} unit="ราย" href={pg.href} />
      </section>
    </main>
  );
}
