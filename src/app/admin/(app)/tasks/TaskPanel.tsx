// กล่อง "งานที่ต้องทำ" ของคำสั่งซื้อ/ลูกค้า (A25) — ใส่ในลิ้นชักคำสั่งซื้อและหน้าลูกค้า (server component)
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HistoryLink } from "../../_components/HistoryLink";
import { createTask, deleteTask, toggleTask } from "./actions";

export const fmtDue = (d: Date | null) => (d ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "");
export const isOverdue = (t: { done: boolean; dueAt: Date | null }, now = Date.now()) => !t.done && !!t.dueAt && t.dueAt.getTime() < now;

export async function TaskPanel({ orderId, orderNo, customerId, ret }: { orderId?: string; orderNo?: string; customerId?: string; ret: string }) {
  const admin = await requireAdmin();
  const me = admin.id, owner = admin.role === "OWNER";
  const where = orderId ? { orderId } : { customerId };
  const [tasks, admins] = await Promise.all([
    prisma.adminTask.findMany({ where, orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }], take: 50, include: { assignee: { select: { displayName: true } } } }),
    prisma.admin.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);
  const now = new Date().getTime();
  const key = orderId ?? customerId ?? "x";
  return (
    <div className="box task-box" id="taskPanel">
      <h3>งานที่ต้องทำ <small>{tasks.filter((t) => !t.done).length} งานค้าง</small></h3>
      {tasks.length > 0 && (
        <ul className="task-list">
          {tasks.map((t) => (
            <li key={t.id} className={`${t.done ? "done" : ""}${isOverdue(t, now) ? " overdue" : ""}`} data-task={t.title}>
              <form action={toggleTask}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="ret" value={ret} />
                <button type="submit" className="task-chk" aria-label={t.done ? `เปิดงาน “${t.title}” อีกครั้ง` : `ทำเสร็จ: ${t.title}`} aria-pressed={t.done}>{t.done ? "✓" : ""}</button>
              </form>
              <div className="task-txt">
                <b>{t.title}</b>
                {t.body && <span>{t.body}</span>}
                <small>
                  {t.assignee ? `มอบหมาย ${t.assignee.displayName}` : "ยังไม่มอบหมาย"}
                  {t.dueAt ? ` · ครบกำหนด ${fmtDue(t.dueAt)}` : ""}
                  {isOverdue(t, now) ? <em className="task-late"> เกินกำหนด</em> : null}
                </small>
              </div>
              {(owner || t.createdById === me) && (
                <form action={deleteTask}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="ret" value={ret} />
                  <button type="submit" className="icon-btn sm" aria-label={`ลบงาน ${t.title}`}>✕</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="task-new">
        <summary>+ เพิ่มงาน</summary>
        <form action={createTask} className="task-form">
          <input type="hidden" name="ret" value={ret} />
          {orderNo && <input type="hidden" name="orderNo" value={orderNo} />}
          {customerId && <input type="hidden" name="customer" value={customerId} />}
          <div className="field"><label htmlFor={`tt-${key}`}>งาน</label><input id={`tt-${key}`} name="title" required minLength={2} maxLength={200} placeholder="เช่น โทรยืนยันที่อยู่จัดส่ง" /></div>
          <div className="two">
            <div className="field">
              <label htmlFor={`ta-${key}`}>มอบหมายให้</label>
              <select id={`ta-${key}`} name="assigneeId" defaultValue={me}>
                <option value="">ยังไม่มอบหมาย</option>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor={`td-${key}`}>ครบกำหนด</label><input id={`td-${key}`} name="dueDate" type="date" /></div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn btn-dark btn-sm" type="submit">บันทึกงาน</button></div>
        </form>
      </details>
      {orderNo && <p style={{ marginTop: 8 }}><HistoryLink entity={`Order:${orderNo}`} /></p>}
    </div>
  );
}
