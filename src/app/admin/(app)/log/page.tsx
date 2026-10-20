// /admin/log — บันทึกการใช้งาน: เข้าสู่ระบบ, แก้ข้อมูลร้าน/สินค้า/เนื้อหา, เอกสารขาย และประวัติคำสั่งซื้อ
import Link from "next/link";
import type { Prisma } from "../../../../../generated/prisma/client";
import { LOG_TYPES } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TABS = {
  all: { label: "ทั้งหมด", types: null },
  auth: { label: "เข้าสู่ระบบ", types: ["LOGIN", "LOGIN_FAIL", "LOCKOUT", "LOGOUT", "IDLE_LOGOUT", "PASSWORD", "ADMIN_USER"] },
  orders: { label: "คำสั่งซื้อ", types: [] },
  content: { label: "สินค้าและเนื้อหา", types: ["PRODUCT", "CATEGORY", "SLIDES", "CONTENT_ROLLBACK"] },
  docs: { label: "เอกสารขาย", types: ["DOC", "CUSTOMER", "LABEL"] },
  settings: { label: "ตั้งค่า/ส่งออก", types: ["SETTINGS", "ORDERS_EXPORT"] },
  line: { label: "แจ้งเตือน LINE", types: ["LINE"] },
} as const;
type Tab = keyof typeof TABS;
const EVENT: Record<string, string> = { CREATED: "สร้างคำสั่งซื้อ", SLIP_UPLOADED: "แนบสลิป", APPROVED: "อนุมัติการชำระเงิน", REJECTED: "ปฏิเสธสลิป", REOPENED: "เปิดตรวจใหม่", SHIPPED: "จัดส่ง", CANCELLED: "ยกเลิก", NOTE: "โน้ตภายใน" };
const PER = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Bangkok" });
const WARN = new Set(["LOGIN_FAIL", "LOCKOUT", "REJECTED", "CANCELLED"]);

export default async function LogPage({ searchParams }: PageProps<"/admin/log">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = one(sp.tab) in TABS ? (one(sp.tab) as Tab) : "all";
  const q = one(sp.q).trim().slice(0, 80);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const href = (patch: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries({ tab: tab === "all" ? "" : tab, q, ...patch }).filter(([, v]) => v)).toString();
    return `/admin/log${s ? `?${s}` : ""}`;
  };

  let rows: { id: string; at: Date; type: string; label: string; note: string; by: string; link?: string }[];
  let total: number;
  if (tab === "orders") {
    const where: Prisma.OrderEventWhereInput = q ? { OR: [{ note: { contains: q, mode: "insensitive" } }, { order: { orderNo: { contains: q, mode: "insensitive" } } }] } : {};
    total = await prisma.orderEvent.count({ where });
    const ev = await prisma.orderEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { admin: { select: { displayName: true } }, order: { select: { orderNo: true } } } });
    rows = ev.map((e) => ({ id: e.id, at: e.createdAt, type: e.type, label: EVENT[e.type] ?? e.type, note: `${e.order.orderNo}${e.note ? ` · ${e.note}` : ""}`, by: e.admin?.displayName ?? "ลูกค้า/ระบบ", link: `/admin?tab=ALL&open=${e.order.orderNo}` }));
  } else {
    const types = TABS[tab].types;
    const where: Prisma.AdminLogWhereInput = { ...(types ? { type: { in: [...types] } } : {}), ...(q ? { note: { contains: q, mode: "insensitive" } } : {}) };
    total = await prisma.adminLog.count({ where });
    const logs = await prisma.adminLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { admin: { select: { displayName: true } } } });
    rows = logs.map((l) => ({ id: l.id, at: l.createdAt, type: l.type, label: LOG_TYPES[l.type] ?? l.type, note: l.note ?? "", by: l.admin?.displayName ?? "ไม่ทราบตัวตน" }));
  }
  const pages = Math.max(1, Math.ceil(total / PER));

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>บันทึกการใช้งาน</h1>
          <p>ใครทำอะไร เมื่อไร — ใช้ตรวจสอบย้อนหลังและความปลอดภัยของระบบ</p>
        </div>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {(Object.keys(TABS) as Tab[]).map((k) => (
              <Link key={k} className={`tab ${tab === k ? "on" : ""}`} role="tab" aria-selected={tab === k} href={href({ tab: k === "all" ? "" : k, page: "" })}>{TABS[k].label}</Link>
            ))}
          </div>
          <form className="search" action="/admin/log" role="search">
            {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
            <label className="sr-only" htmlFor="lq">ค้นหาบันทึก</label>
            <input id="lq" name="q" type="search" defaultValue={q} placeholder="ค้นหาข้อความ, เลขที่คำสั่งซื้อ" />
          </form>
        </div>
        <table className="tbl">
          <thead><tr><th style={{ width: 190 }}>เวลา</th><th style={{ width: 190 }}>รายการ</th><th>รายละเอียด</th><th style={{ width: 160 }}>โดย</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sub num" style={{ fontSize: 13 }}>{fmt(r.at)}</td>
                <td><span className={`chip ${WARN.has(r.type) ? "bad" : "gray"}`}>{r.label}</span></td>
                <td style={{ overflowWrap: "anywhere" }}>{r.link ? <Link className="row-link" href={r.link}>{r.note}</Link> : r.note}</td>
                <td>{r.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>ยังไม่มีบันทึก</b></div>}
        {total > PER && (
          <div className="tbl-foot">
            <span>ทั้งหมด {total} รายการ</span>
            <div className="pager">
              {page > 1 && <Link className="btn btn-outline btn-sm" href={href({ page: String(page - 1) })}>← ใหม่กว่า</Link>}
              <span className="num">หน้า {page}/{pages}</span>
              {page < pages && <Link className="btn btn-outline btn-sm" href={href({ page: String(page + 1) })}>เก่ากว่า →</Link>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
