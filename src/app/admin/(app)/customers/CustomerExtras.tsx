// หน้าลูกค้า: ยอดซื้อรวม/ซื้อล่าสุด + แท็ก (A23) + โน้ตภายใน + งานที่ต้องทำ (A25) + ลิงก์ประวัติการแก้ไข (A29)
import { requireAdmin } from "@/lib/auth";
import { allTags, statsFor } from "@/lib/customer-segments";
import { money } from "@/lib/doc-calc";
import { prisma } from "@/lib/prisma";
import { HistoryLink } from "../../_components/HistoryLink";
import { addCustomerNote, deleteNote, saveCustomerTags } from "../tasks/actions";
import { TaskPanel } from "../tasks/TaskPanel";

const when = (d: Date | null) => (d ? d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "—");

export async function CustomerExtras({ customerId, tags }: { customerId: string; tags: string[] }) {
  const admin = await requireAdmin();
  const ret = `/admin/customers/${customerId}`;
  const [stats, notes, known] = await Promise.all([
    statsFor([customerId]),
    prisma.internalNote.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 50, include: { admin: { select: { displayName: true } } } }),
    allTags(),
  ]);
  const s = stats.get(customerId)!;
  return (
    <>
      <div className="pay-sum" id="cuStats">
        <div><span>ยอดซื้อรวม</span><b className="num" id="cuSpend">฿{money(s.spendSatang)}</b></div>
        <div><span>ซื้อล่าสุด</span><b className="num">{s.lastAt ? s.lastAt.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }) : "—"}</b></div>
        <div><span>จำนวนครั้ง</span><b className="num">{s.orders + s.receipts}</b></div>
      </div>
      <form className="box" action={saveCustomerTags} id="tagForm">
        <h3>แท็ก / กลุ่มลูกค้า</h3>
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="ret" value={ret} />
        <div className="field">
          <label htmlFor="cuTags">แท็ก (คั่นด้วยจุลภาค)</label>
          <input id="cuTags" name="tags" defaultValue={tags.join(", ")} maxLength={1000} list="knownTags" placeholder="เช่น ผู้รับเหมา, VIP, ลูกค้าโครงการ" />
          <datalist id="knownTags">{known.map((t) => <option key={t.tag} value={t.tag} />)}</datalist>
        </div>
        {tags.length > 0 && <div className="cu-tags">{tags.map((t) => <a key={t} className="tag-chip" href={`/admin/customers?tag=${encodeURIComponent(t)}`}>{t}</a>)}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn btn-outline btn-sm" type="submit">บันทึกแท็ก</button></div>
      </form>
      <div className="box inote" id="cuNotes">
        <h3>โน้ตภายใน <small>ลูกค้าไม่เห็น</small></h3>
        {notes.length > 0 && (
          <ul className="inote-list">
            {notes.map((n) => (
              <li key={n.id}>
                {n.body}
                <small>
                  {when(n.createdAt)} · {n.admin?.displayName ?? "—"}
                  {(admin.role === "OWNER" || n.adminId === admin.id) && (
                    <form action={deleteNote} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="ret" value={ret} />
                      {" · "}<button type="submit" className="link">ลบ</button>
                    </form>
                  )}
                </small>
              </li>
            ))}
          </ul>
        )}
        <form action={addCustomerNote}>
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="ret" value={ret} />
          <label className="sr-only" htmlFor="cuNoteText">เพิ่มโน้ตภายใน</label>
          <textarea id="cuNoteText" name="body" required maxLength={2000} placeholder="เช่น ลูกค้าโครงการ ต้องการใบกำกับภาษีทุกครั้ง" className="note-ta" />
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn btn-dark btn-sm" type="submit">บันทึกโน้ต</button></div>
        </form>
      </div>
      <TaskPanel customerId={customerId} ret={ret} />
      <p><HistoryLink entity={`Customer:${customerId}`} /></p>
    </>
  );
}
