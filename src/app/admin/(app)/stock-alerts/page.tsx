// /admin/stock-alerts — รายชื่อลูกค้ารอสินค้าเข้า (A7) แยกตามสินค้า + ส่งออก CSV + ทำเครื่องหมายแจ้งแล้ว
// สต็อกกลับมา > 0 (นับสต็อก/รับของเข้า) → ระบบแจ้ง LINE ร้านอัตโนมัติพร้อมจำนวนคนรอ (src/lib/stock-alerts.ts)
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { deleteAlert, markNotified } from "./actions";
import "../_lot10/lot10.css";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const DONE: Record<string, string> = { marked: "ทำเครื่องหมายแจ้งแล้ว", undone: "ย้ายกลับไปรอแจ้ง", deleted: "ลบรายการแล้ว" };

export default async function StockAlertsPage({ searchParams }: PageProps<"/admin/stock-alerts">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = one(sp.tab) === "done" ? "done" : "open";
  const [rows, openCount, doneCount] = await Promise.all([
    prisma.stockAlert.findMany({
      where: tab === "done" ? { notifiedAt: { not: null } } : { notifiedAt: null },
      orderBy: { createdAt: tab === "done" ? "desc" : "asc" },
      take: 1000,
      include: { product: { select: { id: true, sku: true, name: true, slug: true, stock: true, trackStock: true, inStock: true } } },
    }),
    prisma.stockAlert.count({ where: { notifiedAt: null } }),
    prisma.stockAlert.count({ where: { notifiedAt: { not: null } } }),
  ]);
  const groups = new Map<string, { product: (typeof rows)[number]["product"]; list: typeof rows }>();
  for (const r of rows) {
    const g = groups.get(r.productId) ?? { product: r.product, list: [] };
    g.list.push(r);
    groups.set(r.productId, g);
  }
  const list = [...groups.values()].sort((a, b) => {
    const av = (p: (typeof a)["product"]) => (p.trackStock ? p.stock > 0 : p.inStock);
    return Number(av(b.product)) - Number(av(a.product)) || b.list.length - a.list.length;
  });
  const self = tab === "done" ? "/admin/stock-alerts?tab=done" : "/admin/stock-alerts";
  const done = DONE[one(sp.done)];

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>รอสินค้าเข้า</h1>
          <p>ลูกค้าที่กด “แจ้งเมื่อมีของ” ในหน้าสินค้าที่หมด — เมื่อเติมสต็อก ระบบแจ้ง LINE ร้านอัตโนมัติ ติดต่อลูกค้าแล้วกด “แจ้งแล้ว”</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href={`/admin/stock-alerts/export?status=${tab}`} download>
            ส่งออก CSV
          </a>
        </div>
      </div>
      {done && <div className="ok-box l10-ok" role="status">{done}</div>}
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            <Link className={`tab ${tab === "open" ? "on" : ""}`} role="tab" aria-selected={tab === "open"} href="/admin/stock-alerts">
              รอแจ้ง <em>{openCount}</em>
            </Link>
            <Link className={`tab ${tab === "done" ? "on" : ""}`} role="tab" aria-selected={tab === "done"} href="/admin/stock-alerts?tab=done">
              แจ้งแล้ว <em>{doneCount}</em>
            </Link>
          </div>
        </div>
        {list.map(({ product: p, list: items }) => {
          const avail = p.trackStock ? p.stock > 0 : p.inStock;
          return (
            <div key={p.id} className="l10-grp" data-product={p.sku}>
              <div className="l10-grp-head">
                <div>
                  <b>{p.name}</b> <span className="sub">{p.sku}</span>{" "}
                  {avail ? <span className="chip ok">มีของแล้ว{p.trackStock ? ` (${p.stock})` : ""} — แจ้งลูกค้าได้</span> : <span className="chip gray">ยังหมด</span>}{" "}
                  <span className="chip warn">{items.length} คน</span>
                </div>
                <div className="l10-row-acts">
                  <a className="btn btn-outline btn-sm" href={`/product/${p.slug}`} target="_blank" rel="noopener">หน้าสินค้า</a>
                  {tab === "open" && (
                    <form action={markNotified}>
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="back" value={self} />
                      <button className="btn btn-ok btn-sm" type="submit">แจ้งแล้วทั้งหมด ({items.length})</button>
                    </form>
                  )}
                </div>
              </div>
              <table className="l10-mini">
                <thead>
                  <tr>
                    <th>ชื่อ</th>
                    <th>เบอร์โทร</th>
                    <th>LINE ID</th>
                    <th>อีเมล</th>
                    <th>{tab === "done" ? "แจ้งเมื่อ" : "ฝากเมื่อ"}</th>
                    <th><span className="sr-only">จัดการ</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className={r.notifiedAt ? "done" : ""}>
                      <td>{r.name ?? "—"}</td>
                      <td>{r.phone ? <a className="link" href={`tel:${r.phone}`}>{formatPhone(r.phone)}</a> : "—"}</td>
                      <td>{r.lineId ?? "—"}</td>
                      <td>{r.email ? <a className="link" href={`mailto:${r.email}`}>{r.email}</a> : "—"}</td>
                      <td>{fmt(r.notifiedAt ?? r.createdAt)}</td>
                      <td>
                        <div className="l10-row-acts">
                          <form action={markNotified}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="back" value={self} />
                            {r.notifiedAt && <input type="hidden" name="undo" value="1" />}
                            <button className="btn btn-outline btn-sm" type="submit">{r.notifiedAt ? "ย้ายกลับ" : "แจ้งแล้ว"}</button>
                          </form>
                          <form action={deleteAlert}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="back" value={self} />
                            <ConfirmSubmit title="ลบรายชื่อ" body="ลบรายชื่อนี้ออกจากรายการรอสินค้าเข้า?" confirmLabel="ลบ" className="btn btn-ghost btn-sm">
                              ลบ
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {!list.length && (
          <div className="empty">
            <b>{tab === "open" ? "ไม่มีลูกค้ารอสินค้าเข้า" : "ยังไม่มีรายการที่แจ้งแล้ว"}</b>
            ปุ่ม “แจ้งเมื่อมีของ” แสดงในหน้าสินค้าที่หมดสต็อก
          </div>
        )}
      </section>
    </main>
  );
}
