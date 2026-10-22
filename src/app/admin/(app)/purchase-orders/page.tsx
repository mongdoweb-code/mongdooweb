// /admin/purchase-orders — ใบสั่งซื้อถึงผู้ขาย (A21): รายการตามสถานะ + ค้นหา (เลขที่ ผู้ขาย สินค้า)
// พนักงานเห็นรายการเพื่อรับของ แต่ไม่เห็นยอดเงิน/ต้นทุน
import Link from "next/link";
import type { PoStatus } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PO_STATUS, poWhere } from "@/lib/purchase";
import "../../lot3.css";

const PER = 30;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const baht = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date | null) => (d ? d.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }) : "—");

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/admin/purchase-orders">) {
  const admin = await requireAdmin();
  const owner = admin.role === "OWNER";
  const sp = await searchParams;
  const status = (one(sp.status) in PO_STATUS ? one(sp.status) : "") as PoStatus | "";
  const q = one(sp.q).trim().slice(0, 80);
  const where = poWhere({ status, q });
  const [total, counts] = await Promise.all([prisma.purchaseOrder.count({ where }), prisma.purchaseOrder.groupBy({ by: ["status"], _count: { _all: true } })]);
  const pages = Math.max(1, Math.ceil(total / PER));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const rows = await prisma.purchaseOrder.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER,
    include: { items: { select: { qty: true, receivedQty: true } }, createdBy: { select: { displayName: true } } },
  });
  const cnt = (s: PoStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const qs = (patch: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries({ status, q, ...patch }).filter(([, v]) => v)).toString();
    return `/admin/purchase-orders${s ? `?${s}` : ""}`;
  };
  return (
    <main className="main" id="page-po">
      <div className="page-head">
        <div>
          <h1>ใบสั่งซื้อ (PO)</h1>
          <p>สั่งของจากผู้ขาย → รับของเข้า (เพิ่มสต็อกและบันทึกต้นทุนอัตโนมัติ)</p>
        </div>
        {owner && (
          <div className="head-actions">
            <Link className="btn btn-outline" href="/admin/purchase-orders/costs">ต้นทุนสินค้า</Link>
            <Link className="btn btn-primary" href="/admin/purchase-orders/new">+ สร้างใบสั่งซื้อ</Link>
          </div>
        )}
      </div>
      {sp.deleted === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ลบฉบับร่างแล้ว</div>}
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            <Link className={`tab ${!status ? "on" : ""}`} role="tab" aria-selected={!status} href={qs({ status: "", page: "" })}>ทั้งหมด</Link>
            {(Object.keys(PO_STATUS) as PoStatus[]).map((s) => (
              <Link key={s} className={`tab ${status === s ? "on" : ""}`} role="tab" aria-selected={status === s} href={qs({ status: s, page: "" })}>
                {PO_STATUS[s][0]} {cnt(s) ? <span className="cnt">{cnt(s)}</span> : null}
              </Link>
            ))}
          </div>
          <form className="search" action="/admin/purchase-orders" role="search">
            {status && <input type="hidden" name="status" value={status} />}
            <label className="sr-only" htmlFor="poq">ค้นหาใบสั่งซื้อ</label>
            <input id="poq" name="q" type="search" defaultValue={q} placeholder="เลขที่ PO, ผู้ขาย, ชื่อสินค้า" />
          </form>
        </div>
        <table className="tbl" id="poTable">
          <thead>
            <tr><th style={{ width: 150 }}>เลขที่</th><th>ผู้ขาย</th><th>สถานะ</th><th className="r">รับแล้ว</th>{owner && <th className="r">ยอดรวม</th>}<th>วันที่สั่ง</th></tr>
          </thead>
          <tbody>
            {rows.map((po) => {
              const ordered = po.items.reduce((s, i) => s + i.qty, 0);
              const got = po.items.reduce((s, i) => s + i.receivedQty, 0);
              const [label, cls] = PO_STATUS[po.status];
              return (
                <tr key={po.id}>
                  <td className="num"><Link className="row-link" href={`/admin/purchase-orders/${po.id}`}><b>{po.poNo ?? "ฉบับร่าง"}</b></Link></td>
                  <td>{po.supplierName}<span className="sub">{po.items.length} รายการ · โดย {po.createdBy?.displayName ?? "—"}</span></td>
                  <td><span className={`dst dst-${cls}`}>{label}</span></td>
                  <td className="r num">{got}/{ordered}</td>
                  {owner && <td className="r num">{baht(po.totalSatang)}</td>}
                  <td className="sub">{day(po.orderedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>{q || status ? "ไม่พบใบสั่งซื้อตามตัวกรอง" : "ยังไม่มีใบสั่งซื้อ"}</b>{owner && <Link className="link" href="/admin/purchase-orders/new">สร้างใบสั่งซื้อ</Link>}</div>}
        {total > PER && (
          <div className="tbl-foot">
            <span>ทั้งหมด {total} ใบ</span>
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
