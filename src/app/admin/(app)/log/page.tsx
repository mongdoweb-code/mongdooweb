// /admin/log — บันทึกการใช้งาน: เข้าสู่ระบบ, แก้ข้อมูลร้าน/สินค้า/เนื้อหา, เอกสารขาย และประวัติคำสั่งซื้อ
// กรองตามหมวด/ผู้ใช้/ช่วงวันที่/ข้อความ (อยู่ใน URL) · ส่งออก CSV ตามตัวกรองเดียวกัน (เจ้าของร้าน)
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALL_LOG_TYPES, LOG_TABS, ORDER_EVENT, adminLogWhere, logQuery, orderEventWhere, parseLogFilter, type LogTab } from "./types";

const PER = 50;
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Bangkok" });
const WARN = new Set(["LOGIN_FAIL", "LOCKOUT", "REJECTED", "CANCELLED", "DENIED"]);

export default async function LogPage({ searchParams }: PageProps<"/admin/log">) {
  const admin = await requireAdmin();
  const f = parseLogFilter(await searchParams);
  const page = f.page;
  const users = await prisma.admin.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, username: true, displayName: true } });

  let rows: { id: string; at: Date; type: string; label: string; note: string; by: string; link?: string }[];
  let total: number;
  if (f.tab === "orders") {
    const where = orderEventWhere(f);
    total = await prisma.orderEvent.count({ where });
    const ev = await prisma.orderEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { admin: { select: { displayName: true } }, order: { select: { orderNo: true } } } });
    rows = ev.map((e) => ({ id: e.id, at: e.createdAt, type: e.type, label: ORDER_EVENT[e.type] ?? e.type, note: `${e.order.orderNo}${e.note ? ` · ${e.note}` : ""}`, by: e.admin?.displayName ?? "ลูกค้า/ระบบ", link: `/admin?tab=ALL&open=${e.order.orderNo}` }));
  } else {
    const where = adminLogWhere(f);
    total = await prisma.adminLog.count({ where });
    const logs = await prisma.adminLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { admin: { select: { displayName: true } } } });
    rows = logs.map((l) => ({ id: l.id, at: l.createdAt, type: l.type, label: ALL_LOG_TYPES[l.type] ?? l.type, note: l.note ?? "", by: l.admin?.displayName ?? "ไม่ทราบตัวตน" }));
  }
  const pages = Math.max(1, Math.ceil(total / PER));
  const filtered = !!(f.q || f.user || f.from || f.to);

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
          {filtered && <Link className="link" href={`/admin/log${logQuery({ ...f, q: "", user: "", from: "", to: "" }, { page: "" })}`}>ล้างตัวกรอง</Link>}
        </form>
        <table className="tbl log-tbl">
          <thead><tr><th style={{ width: 190 }}>เวลา</th><th style={{ width: 190 }}>รายการ</th><th>รายละเอียด</th><th style={{ width: 160 }}>โดย</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sub num lg-at" style={{ fontSize: 13 }}>{fmt(r.at)}</td>
                <td className="lg-type"><span className={`chip ${WARN.has(r.type) ? "bad" : "gray"}`}>{r.label}</span></td>
                <td className="lg-note" style={{ overflowWrap: "anywhere" }}>{r.link ? <Link className="row-link" href={r.link}>{r.note}</Link> : r.note}</td>
                <td className="lg-by">{r.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>{filtered ? "ไม่พบบันทึกตามตัวกรอง" : "ยังไม่มีบันทึก"}</b></div>}
        <div className="tbl-foot">
          <span>ทั้งหมด {total.toLocaleString("th-TH")} รายการ</span>
          {total > PER && (
            <div className="pager">
              {page > 1 && <Link className="btn btn-outline btn-sm" href={`/admin/log${logQuery(f, { page: String(page - 1) })}`}>← ใหม่กว่า</Link>}
              <span className="num">หน้า {page}/{pages}</span>
              {page < pages && <Link className="btn btn-outline btn-sm" href={`/admin/log${logQuery(f, { page: String(page + 1) })}`}>เก่ากว่า →</Link>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
