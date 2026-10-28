// /admin/log — บันทึกการใช้งาน: เข้าสู่ระบบ, แก้ข้อมูลร้าน/สินค้า/เนื้อหา, เอกสารขาย และประวัติคำสั่งซื้อ
// กรองตามหมวด/ผู้ใช้/ช่วงวันที่/ข้อความ (อยู่ใน URL) · ส่งออก CSV ตามตัวกรองเดียวกัน (เจ้าของร้าน)
import Link from "next/link";
import { Pagination } from "../../_components/Pagination";
import { requireAdmin } from "@/lib/auth";
import { FIELD_LABEL, visibleDiff, type Diff } from "@/lib/log-diff";
import { prisma } from "@/lib/prisma";
import { ALL_LOG_TYPES, LOG_TABS, ORDER_EVENT, adminLogWhere, logQuery, orderEventWhere, parseLogFilter, type LogTab } from "./types";

const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Bangkok" });
const WARN = new Set(["LOGIN_FAIL", "LOCKOUT", "REJECTED", "CANCELLED", "DENIED"]);

export default async function LogPage({ searchParams }: PageProps<"/admin/log">) {
  const admin = await requireAdmin();
  const f = parseLogFilter(await searchParams);
  const page = f.page;
  const PER = f.per;
  const users = await prisma.admin.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, username: true, displayName: true } });

  const owner = admin.role === "OWNER";
  let rows: { id: string; at: Date; type: string; label: string; note: string; by: string; link?: string; diff?: Diff | null }[];
  let total: number;
  if (f.tab === "orders") {
    const where = orderEventWhere(f);
    total = await prisma.orderEvent.count({ where });
    const ev = await prisma.orderEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { admin: { select: { displayName: true } }, order: { select: { orderNo: true } } } });
    rows = ev.map((e) => ({ id: e.id, at: e.createdAt, type: e.type, label: ORDER_EVENT[e.type] ?? e.type, note: `${e.order.orderNo}${e.note ? ` · ${e.note}` : ""}`, by: e.admin?.displayName ?? "ลูกค้า/ระบบ", link: `/admin?tab=ALL&open=${e.order.orderNo}` }));
  } else {
    const where = adminLogWhere(f, owner); // พนักงานไม่เห็น PDPA/ต้นทุน/สำรองข้อมูล (D13)
    total = await prisma.adminLog.count({ where });
    const logs = await prisma.adminLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { admin: { select: { displayName: true } } } });
    rows = logs.map((l) => ({
      id: l.id, at: l.createdAt, type: l.type, label: ALL_LOG_TYPES[l.type] ?? l.type, note: l.note ?? "", by: l.admin?.displayName ?? "ไม่ทราบตัวตน",
      link: entityLink(l.entity), diff: visibleDiff(l.diff, owner),
    }));
  }
  const pages = Math.max(1, Math.ceil(total / PER));
  const filtered = !!(f.q || f.user || f.from || f.to || f.entity);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>บันทึกการใช้งาน</h1>
          <p>ใครทำอะไร เมื่อไร — ใช้ตรวจสอบย้อนหลังและความปลอดภัยของระบบ</p>
        </div>
        {admin.role === "OWNER" && (
          <div className="head-actions">
            <a className="btn btn-outline" href={`/admin/log.csv${logQuery(f, { page: "" })}`} download>
              ส่งออก CSV
            </a>
          </div>
        )}
      </div>
      {f.entity && (
        <div className="login-info lg-entity" role="status" style={{ marginBottom: 12 }}>
          ประวัติการแก้ไขของ <b>{entityName(f.entity)}</b> ·{" "}
          <Link className="link" href={`/admin/log${logQuery({ ...f, entity: "" }, { page: "" })}`}>ดูบันทึกทั้งหมด</Link>
        </div>
      )}
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {(Object.keys(LOG_TABS) as LogTab[]).map((k) => (
              <Link key={k} className={`tab ${f.tab === k ? "on" : ""}`} role="tab" aria-selected={f.tab === k} href={`/admin/log${logQuery(f, { tab: k === "all" ? "" : k, page: "" })}`}>{LOG_TABS[k].label}</Link>
            ))}
          </div>
        </div>
        <form className="toolbar2 log-filter" action="/admin/log" role="search">
          {f.tab !== "all" && <input type="hidden" name="tab" value={f.tab} />}
          {f.entity && <input type="hidden" name="entity" value={f.entity} />}
          <label className="sr-only" htmlFor="lq">ค้นหาบันทึก</label>
          <input id="lq" className="sel lf-q" name="q" type="search" defaultValue={f.q} placeholder="ค้นหาข้อความ, เลขที่คำสั่งซื้อ" />
          <label className="sr-only" htmlFor="lu">ผู้ใช้</label>
          <select id="lu" className="sel" name="user" defaultValue={f.user}>
            <option value="">ทุกผู้ใช้</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.displayName} ({u.username})</option>)}
            <option value="none">ลูกค้า/ระบบ/ไม่ทราบตัวตน</option>
          </select>
          <span className="date-custom">
            <label className="sr-only" htmlFor="lf">ตั้งแต่วันที่</label>
            <input id="lf" type="date" name="from" defaultValue={f.from} />
            <span>ถึง</span>
            <label className="sr-only" htmlFor="lt">ถึงวันที่</label>
            <input id="lt" type="date" name="to" defaultValue={f.to} />
          </span>
          <button className="btn btn-dark btn-sm" type="submit">กรอง</button>
          {filtered && <Link className="link" href={`/admin/log${logQuery({ ...f, q: "", user: "", from: "", to: "", entity: "" }, { page: "" })}`}>ล้างตัวกรอง</Link>}
        </form>
        <table className="tbl log-tbl">
          <thead><tr><th style={{ width: 190 }}>เวลา</th><th style={{ width: 190 }}>รายการ</th><th>รายละเอียด</th><th style={{ width: 160 }}>โดย</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sub num lg-at" style={{ fontSize: 13 }}>{fmt(r.at)}</td>
                <td className="lg-type"><span className={`chip ${WARN.has(r.type) ? "bad" : "gray"}`}>{r.label}</span></td>
                <td className="lg-note" style={{ overflowWrap: "anywhere" }}>
                  {r.link ? <Link className="row-link" href={r.link}>{r.note}</Link> : r.note}
                  {r.diff && <DiffView diff={r.diff} />}
                </td>
                <td className="lg-by">{r.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>{filtered ? "ไม่พบบันทึกตามตัวกรอง" : "ยังไม่มีบันทึก"}</b></div>}
        <Pagination page={page} pages={pages} total={total} shown={rows.length} per={PER} href={(n, pp) => `/admin/log${logQuery(f, { page: n > 1 ? String(n) : "", per: pp === 50 ? "" : String(pp) })}`} />
      </section>
    </main>
  );
}

/** ลิงก์ไปหน้ารายการที่ถูกแก้ */
function entityLink(entity: string | null) {
  if (!entity) return undefined;
  const [kind, id] = entity.split(":");
  if (kind === "Product") return `/admin/products/${id}`;
  if (kind === "Order") return `/admin?tab=ALL&open=${encodeURIComponent(id)}`;
  if (kind === "Customer") return `/admin/customers/${id}`;
  if (kind === "PurchaseOrder") return `/admin/purchase-orders/${id}`;
  if (kind === "DataRequest") return `/admin/data-requests/${id}`;
  if (kind === "ShopSetting") return "/admin/settings";
  return undefined;
}
function entityName(entity: string) {
  const [kind, id] = entity.split(":");
  const th: Record<string, string> = { Product: "สินค้า", Order: "คำสั่งซื้อ", Customer: "ลูกค้า", PurchaseOrder: "ใบสั่งซื้อ", DataRequest: "คำขอ PDPA", Task: "งาน", ShopSetting: "ตั้งค่าร้าน" };
  return id ? `${th[kind] ?? kind} ${kind === "Order" ? id : ""}`.trim() : th[kind] ?? kind;
}
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** ค่าก่อน/หลังของช่องที่เปลี่ยน (กดเพื่อดู) */
function DiffView({ diff }: { diff: Diff }) {
  const keys = Object.keys(diff);
  return (
    <details className="lg-diff">
      <summary>ดูการเปลี่ยนแปลง ({keys.length} ช่อง)</summary>
      <table>
        <thead><tr><th>ช่อง</th><th>ก่อน</th><th>หลัง</th></tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <th scope="row">{FIELD_LABEL[k] ?? k}</th>
              <td className="lg-before">{show(diff[k][0])}</td>
              <td className="lg-after">{show(diff[k][1])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
