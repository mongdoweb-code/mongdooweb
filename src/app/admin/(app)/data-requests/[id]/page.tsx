// /admin/data-requests/:id — รายละเอียดคำขอ PDPA: ข้อมูลที่พบ (ตามเบอร์/อีเมล), ส่งออก ZIP, ลบ/ทำให้ไม่ระบุตัวตน, ปิดคำขอพร้อมผล
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { DR_KIND, DR_STATUS, personSummary } from "@/lib/pdpa";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { HistoryLink } from "../../../_components/HistoryLink";
import { eraseAction, objectMarketingAction, reopenAction, resolveAction } from "../actions";
import "../../../lot12.css";

export const instant = false;

const when = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const LABEL: Record<string, string> = {
  customers: "ลูกค้า (เอกสารขาย)", orders: "คำสั่งซื้อ", salesDocuments: "เอกสารขายที่ออกแล้ว", inquiries: "คำขอ/ติดต่อ", reviews: "รีวิว",
  claims: "เคลม/คืนสินค้า", stockAlerts: "แจ้งเมื่อมีของ", couponRedemptions: "การใช้คูปอง", dataRequests: "คำขอ PDPA",
  docSlips: "สลิปของใบแจ้งหนี้", emailLogs: "อีเมลที่ส่งถึง", internalNotes: "โน้ตภายใน", adminTasks: "งานที่เกี่ยวข้อง",
};

export default async function DataRequestPage({ params, searchParams }: PageProps<"/admin/data-requests/[id]">) {
  await requireOwner();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const r = await prisma.dataRequest.findUnique({ where: { id } });
  if (!r) notFound();
  const found = await personSummary(r.phone, r.email);
  const [label, cls] = DR_STATUS[r.status];
  const due = new Date(r.createdAt.getTime() + 30 * 864e5);
  return (
    <main className="main" id="drDetail">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/data-requests">← คำขอทั้งหมด</Link></p>
          <h1>{DR_KIND[r.kind]}</h1>
          <p><span className={`dst dst-${cls}`} id="drStatus">{label}</span> · ขอเมื่อ {when(r.createdAt)} · ครบกำหนดตอบ {due.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" })}</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href={`/admin/data-requests/${r.id}/export`} download id="drExport">ส่งออกข้อมูลของบุคคลนี้ (ZIP)</a>
        </div>
      </div>
      {sp.erased === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }} id="drErased">ลบ/ทำให้ไม่ระบุตัวตนแล้ว — ผลอยู่ในช่อง “ผลการดำเนินการ”</div>}
      {typeof sp.optout === "string" && <div className="ok-box" role="status" style={{ marginBottom: 12 }} id="drOptOut">บันทึกการคัดค้านการตลาดแล้ว — {Number(sp.optout) ? `ลูกค้า ${Number(sp.optout)} รายถูกตั้ง “ไม่รับข่าวสาร”` : "ไม่พบลูกค้าในรายชื่อ (เบอร์/อีเมลนี้จะไม่อยู่ในไฟล์บรอดแคสต์)"}</div>}
      {sp.saved === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>บันทึกแล้ว</div>}
      {sp.err === "result" && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>กรอกผลการดำเนินการที่จะแจ้งผู้ขอ</div>}
      <div className="pform-grid">
        <div className="d-col">
          <div className="box">
            <h3>ผู้ขอ</h3>
            <dl className="po-meta">
              <dt>ชื่อ</dt><dd>{r.name}</dd>
              <dt>เบอร์โทร</dt><dd>{formatPhone(r.phone)}</dd>
              <dt>อีเมล</dt><dd>{r.email ?? "—"}</dd>
              <dt>รายละเอียด</dt><dd style={{ whiteSpace: "pre-wrap" }}>{r.detail}</dd>
            </dl>
            <p className="l3-note">ยืนยันตัวตนก่อนดำเนินการ (โทรกลับเบอร์นี้ / ถามเลขคำสั่งซื้อ) — อย่าส่งข้อมูลให้ผู้ที่ยืนยันตัวตนไม่ได้</p>
          </div>
          <div className="box">
            <h3>ข้อมูลที่พบในระบบ <small>ค้นจากเบอร์{r.email ? "และอีเมล" : ""}</small></h3>
            <ul className="dr-found" id="drFound">
              {Object.entries(found).map(([k, n]) => <li key={k} data-k={k}><span>{LABEL[k] ?? k}</span><b className="num">{n}</b></li>)}
            </ul>
          </div>
          {r.result && <div className="box"><h3>ผลการดำเนินการ</h3><p style={{ whiteSpace: "pre-wrap" }} id="drResult">{r.result}</p><p className="sub">{r.handledBy ?? ""}{r.handledAt ? ` · ${when(r.handledAt)}` : ""}</p></div>}
        </div>
        <div className="d-col">
          <form className="box" action={eraseAction}>
            <h3>ลบ / ทำให้ไม่ระบุตัวตน</h3>
            <input type="hidden" name="id" value={r.id} />
            <ul className="l3-note dr-policy">
              <li>ลบ: คำขอ/ติดต่อ, แจ้งเมื่อมีของ, รีวิว (รวมรูป), ลูกค้าที่ยังไม่มีเอกสาร, สลิปของคำสั่งซื้อที่ไม่ได้ชำระ, สลิปใบแจ้งหนี้ที่ยังไม่ยอมรับ, โน้ตภายใน</li>
              <li>ลบเฉพาะส่วนที่ไม่บังคับ: คำสั่งซื้อที่ชำระแล้ว (คงยอด/รายการไว้เป็นหลักฐานบัญชี), ลูกค้าที่มีเอกสาร, เคลม, เบอร์/อีเมลในเอกสาร, การใช้คูปอง, ประวัติอีเมล</li>
              <li>ปิดบังข้อความ: ประวัติคำสั่งซื้อ (ค่าเก่า/ใหม่ของที่อยู่, เหตุผลยกเลิก, โน้ต), บันทึกการใช้งาน (ค่าก่อน/หลัง), งานที่เกี่ยวข้อง</li>
              <li>เก็บไว้ตามกฎหมาย 5 ปี: ชื่อ ที่อยู่ เลขผู้เสียภาษี ที่พิมพ์บนใบเสร็จ/ใบกำกับภาษี/ใบแจ้งหนี้</li>
            </ul>
            <ConfirmSubmit className="btn btn-danger" title={`ลบข้อมูลของ ${r.name}?`} body="ข้อมูลที่ไม่บังคับตามกฎหมายจะถูกลบถาวร ย้อนกลับไม่ได้ — ควรส่งออก ZIP เก็บเป็นหลักฐานก่อน (ถ้าผู้ขอต้องการสำเนา)" confirmLabel="ลบข้อมูล">ลบข้อมูลตามคำขอ</ConfirmSubmit>
          </form>
          {r.kind === "OBJECT" && (
            <form className="box" action={objectMarketingAction} id="drObject">
              <h3>บันทึกการคัดค้านการตลาด</h3>
              <input type="hidden" name="id" value={r.id} />
              <p className="l3-note">ตั้ง “ไม่รับข่าวสาร/การตลาด” ให้ลูกค้าที่เบอร์{r.email ? "หรืออีเมล" : ""}ตรงกับผู้ขอ — ไม่อยู่ในไฟล์รายชื่อบรอดแคสต์อีก (ยังติดต่อเรื่องคำสั่งซื้อ/เอกสารได้ตามปกติ)</p>
              <button className="btn btn-primary btn-sm" type="submit">บันทึกการคัดค้านการตลาด</button>
            </form>
          )}
          {r.status === "NEW" ? (
            <form className="box" action={resolveAction} id="drResolve">
              <h3>ปิดคำขอ</h3>
              <input type="hidden" name="id" value={r.id} />
              <div className="field">
                <label htmlFor="drRes">ผลการดำเนินการ (แจ้งผู้ขอ)</label>
                <textarea id="drRes" name="result" rows={4} maxLength={3000} defaultValue={r.result ?? ""} placeholder="เช่น ส่งสำเนาข้อมูลทางอีเมลแล้ว / ลบข้อมูลที่ไม่บังคับแล้ว คงใบเสร็จไว้ตามกฎหมาย" required />
              </div>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-outline btn-sm" type="submit" name="status" value="REJECTED">ปฏิเสธคำขอ</button>
                <button className="btn btn-primary btn-sm" type="submit" name="status" value="DONE">ดำเนินการแล้ว</button>
              </div>
            </form>
          ) : (
            <form className="box" action={reopenAction}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn btn-outline btn-sm" type="submit">เปิดคำขออีกครั้ง</button>
            </form>
          )}
          <p><HistoryLink entity={`DataRequest:${r.id}`} /></p>
        </div>
      </div>
    </main>
  );
}
