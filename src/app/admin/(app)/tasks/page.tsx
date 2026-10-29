// /admin/tasks — งานที่ต้องทำ (A25): "งานของฉัน", งานค้างทั้งหมด, เกินกำหนด, เสร็จแล้ว · สร้างงาน (มอบหมาย/วันครบ/ผูกคำสั่งซื้อหรือลูกค้า)
import { NotifPing } from "../../_components/NotifPing";
import Link from "next/link";
import type { Prisma } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTask, deleteTask, toggleTask } from "./actions";
import { fmtDue, isOverdue } from "./TaskPanel";
import "../../lot12.css";

const TABS = { mine: "งานของฉัน", open: "งานค้างทั้งหมด", overdue: "เกินกำหนด", done: "เสร็จแล้ว" } as const;
type Tab = keyof typeof TABS;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ERR: Record<string, string> = { title: "กรอกชื่องานอย่างน้อย 2 ตัวอักษร", assignee: "ไม่พบผู้ใช้ที่มอบหมาย", order: "ไม่พบเลขที่คำสั่งซื้อ", customer: "ไม่พบลูกค้า (ใช้รหัสลูกค้า เช่น 0012)" };

export default async function TasksPage({ searchParams }: PageProps<"/admin/tasks">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = one(sp.tab) in TABS ? (one(sp.tab) as Tab) : "mine";
  const now = new Date();
  const W: Record<Tab, Prisma.AdminTaskWhereInput> = {
    mine: { done: false, assigneeId: admin.id },
    open: { done: false },
    overdue: { done: false, dueAt: { lt: now } },
    done: { done: true },
  };
  const [tasks, counts, admins] = await Promise.all([
    prisma.adminTask.findMany({
      where: W[tab], take: 200,
      orderBy: tab === "done" ? [{ doneAt: "desc" }] : [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      include: { assignee: { select: { displayName: true } }, createdBy: { select: { displayName: true } }, order: { select: { orderNo: true } }, customer: { select: { id: true, code: true, name: true } } },
    }),
    Promise.all((Object.keys(TABS) as Tab[]).filter((t) => t !== "done").map(async (t) => [t, await prisma.adminTask.count({ where: W[t] })] as const)),
    prisma.admin.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);
  const cnt = Object.fromEntries(counts) as Partial<Record<Tab, number>>;
  const ret = `/admin/tasks${tab === "mine" ? "" : `?tab=${tab}`}`;
  const err = ERR[one(sp.taskErr)];
  return (
    <main className="main" id="page-tasks">
      <div className="page-head">
        <div><h1>งานที่ต้องทำ</h1><p>มอบหมายงานให้ทีม ผูกกับคำสั่งซื้อหรือลูกค้า และติดตามงานที่เกินกำหนด</p></div>
      </div>
      {sp.taskSaved === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>บันทึกงานแล้ว — แสดงในการแจ้งเตือน (กระดิ่งมุมขวาบน) ของผู้รับงาน<NotifPing /></div>}
      {err && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="pform-grid">
        <section className="panel">
          <div className="toolbar">
            <div className="tabs" role="tablist">
              {(Object.keys(TABS) as Tab[]).map((t) => (
                <Link key={t} className={`tab ${tab === t ? "on" : ""}`} role="tab" aria-selected={tab === t} href={t === "mine" ? "/admin/tasks" : `/admin/tasks?tab=${t}`}>
                  {TABS[t]} {cnt[t] ? <span className={`cnt${t === "overdue" ? " bad" : ""}`}>{cnt[t]}</span> : null}
                </Link>
              ))}
            </div>
          </div>
          {tasks.length ? (
            <ul className="task-list big" id="taskList">
              {tasks.map((t) => (
                <li key={t.id} className={`${t.done ? "done" : ""}${isOverdue(t, now.getTime()) ? " overdue" : ""}`} data-task={t.title}>
                  <form action={toggleTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="ret" value={ret} />
                    <button type="submit" className="task-chk" aria-label={t.done ? `เปิดงาน “${t.title}” อีกครั้ง` : `ทำเสร็จ: ${t.title}`} aria-pressed={t.done}>{t.done ? "✓" : ""}</button>
                  </form>
                  <div className="task-txt">
                    <b>{t.title}</b>
                    {t.body && <span>{t.body}</span>}
                    <small>
                      {t.assignee ? `มอบหมาย ${t.assignee.displayName}` : "ยังไม่มอบหมาย"} · สร้างโดย {t.createdBy?.displayName ?? "—"}
                      {t.dueAt ? ` · ครบกำหนด ${fmtDue(t.dueAt)}` : ""}
                      {t.done && t.doneAt ? ` · เสร็จ ${fmtDue(t.doneAt)}` : ""}
                      {isOverdue(t, now.getTime()) ? <em className="task-late"> เกินกำหนด</em> : null}
                    </small>
                    {(t.order || t.customer) && (
                      <small>
                        {t.order && <Link className="link" href={`/admin?tab=ALL&open=${t.order.orderNo}`}>คำสั่งซื้อ {t.order.orderNo}</Link>}
                        {t.order && t.customer ? " · " : ""}
                        {t.customer && <Link className="link" href={`/admin/customers/${t.customer.id}`}>ลูกค้า {t.customer.code} {t.customer.name}</Link>}
                      </small>
                    )}
                  </div>
                  {(admin.role === "OWNER" || t.createdById === admin.id) && (
                    <form action={deleteTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="ret" value={ret} />
                      <button type="submit" className="icon-btn sm" aria-label={`ลบงาน ${t.title}`}>✕</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty"><b>{tab === "mine" ? "ไม่มีงานค้างของคุณ" : tab === "overdue" ? "ไม่มีงานเกินกำหนด" : "ไม่มีงานในรายการนี้"}</b></div>
          )}
        </section>
        <form className="box task-form" action={createTask} id="newTaskForm">
          <h3>เพิ่มงานใหม่</h3>
          <input type="hidden" name="ret" value={ret} />
          <div className="field"><label htmlFor="ntTitle">งาน</label><input id="ntTitle" name="title" required minLength={2} maxLength={200} placeholder="เช่น สั่งไฟใต้น้ำเพิ่ม 20 ชุด" /></div>
          <div className="field"><label htmlFor="ntBody">รายละเอียด (ไม่บังคับ)</label><textarea id="ntBody" name="body" rows={3} maxLength={2000} /></div>
          <div className="field">
            <label htmlFor="ntAssignee">มอบหมายให้</label>
            <select id="ntAssignee" name="assigneeId" defaultValue={admin.id}>
              <option value="">ยังไม่มอบหมาย</option>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
            </select>
          </div>
          <div className="two">
            <div className="field"><label htmlFor="ntDue">ครบกำหนด</label><input id="ntDue" name="dueDate" type="date" /></div>
            <div className="field"><label htmlFor="ntTime">เวลา</label><input id="ntTime" name="dueTime" type="time" defaultValue="17:00" /></div>
          </div>
          <div className="two">
            <div className="field"><label htmlFor="ntOrder">เลขที่คำสั่งซื้อ (ไม่บังคับ)</label><input id="ntOrder" name="orderNo" maxLength={40} placeholder="MDW-…" /></div>
            <div className="field"><label htmlFor="ntCust">รหัสลูกค้า (ไม่บังคับ)</label><input id="ntCust" name="customer" maxLength={40} placeholder="0012" /></div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn btn-primary" type="submit">บันทึกงาน</button></div>
        </form>
      </div>
    </main>
  );
}
