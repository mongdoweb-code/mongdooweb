// /admin/docs/:type/:id — ดูเอกสาร: ตัวอย่าง A4 จริง, สถานะ/ยอดค้าง, ปุ่มตามขั้นตอน (ออก → ตอบรับ → แปลง → รับชำระ → ใบเสร็จ), ใบปะหน้า, ประวัติ
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { docDate, docDateTime, money, ymdBkk } from "@/lib/doc-calc";
import { DOC_META, DOC_ST } from "@/lib/doc-render";
import { DOC_INCLUDE, PAY_METHODS, asSnap, docPath, isDocType, statusOf, toView, todayYmd, ymdOf } from "@/lib/docs";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { ConfirmSubmit } from "../../../../_components/AdminClient";
import { DocSheets } from "../../../../_components/DocSheets";
import { LabelOptions } from "../../../../_components/LabelOptions";
import { acceptQuote, convertQuote, deleteDraft, duplicateDoc, issueDoc, rejectQuote, reopenQuote, reviseQuote } from "../../actions";
import { PaymentForm, VoidForm } from "../../DocForms";

export const instant = false;

const EV: Record<string, string> = { CREATED: "สร้าง", ISSUED: "ออกเอกสาร", CONVERTED: "แปลงเอกสาร", ACCEPTED: "ตอบรับ", REJECTED: "ไม่ตอบรับ", PAYMENT: "รับชำระ", PRINTED: "พิมพ์", VOIDED: "ยกเลิก", NOTE: "บันทึก" };

export default async function DocViewPage({ params, searchParams }: PageProps<"/admin/docs/[type]/[id]">) {
  await requireAdmin();
  const [{ type, id }, sp] = await Promise.all([params, searchParams]);
  if (!isDocType(type)) notFound();
  if (id === "new") redirect(`/admin/docs/${type}/new/edit`);
  const d = await prisma.salesDocument.findUnique({ where: { id }, include: { ...DOC_INCLUDE, events: { orderBy: { createdAt: "desc" }, include: { admin: { select: { displayName: true } } } } } });
  if (!d) notFound();
  if (d.type !== type) redirect(docPath(d));
  const s = await getSettings();
  const view = await toView(d, s);
  const today = todayYmd();
  const st = statusOf(d, today);
  const [stl, stc] = DOC_ST[st];
  const meta = DOC_META[d.type];
  const era = s.dateEra;
  const c = asSnap(d.customerSnapshot);
  const outstanding = Math.max(0, d.grandSatang - d.paidSatang);
  const livePays = d.payments.filter((p) => !p.voided);
  const liveIv = d.derived.find((x) => x.type === "INVOICE" && x.status !== "VOID");
  const draftRevision = d.derived.find((x) => x.type === "QUOTATION" && x.status === "DRAFT");
  const label = meta.th.split(" /")[0];
  const flash =
    sp.issued === "1" ? `ออก${label}เลขที่ ${d.docNo} แล้ว` : sp.saved === "1" ? "บันทึกฉบับร่างแล้ว" : sp.exists === "1" ? "มีเอกสารนี้อยู่แล้ว — เปิดฉบับที่มีอยู่ให้" : sp.voided === "1" ? `ยกเลิก${label}แล้ว — เลขที่เดิมยังเก็บไว้ (ห้ามนำมาใช้ซ้ำ)` : "";
  const err = typeof sp.err === "string" ? sp.err.slice(0, 200) : "";
  const idInput = <input type="hidden" name="id" value={d.id} />;
  const act = (fn: (f: FormData) => Promise<void>, text: string, cls = "btn btn-outline") => (
    <form action={fn}>{idInput}<button className={cls} type="submit">{text}</button></form>
  );

  return (
    <main className="main doc-view">
      <div className="page-head">
        <div>
          <p><Link className="link" href={`/admin/docs/${d.type}`}>← {label}ทั้งหมด</Link></p>
          <h1 className="dv-title"><span className={d.docNo ? "num" : "draft-no"}>{d.docNo ?? `${label} (ฉบับร่าง)`}</span><span className={`dst dst-${stc}`}>{stl}</span></h1>
          <p>{c.name ?? "—"}{d.issueDate ? ` · วันที่ ${docDate(ymdBkk(d.issueDate), era)}` : ""}</p>
        </div>
        <div className="head-actions">
          {d.status === "DRAFT" && <Link className="btn btn-outline" href={`${docPath(d)}/edit`}>แก้ไข</Link>}
          <a className="btn btn-outline" href={`/admin/print/doc/${d.id}?both=1&auto=1`} target="_blank" rel="noopener">ต้นฉบับ + สำเนา</a>
          <a className="btn btn-primary" href={`/admin/print/doc/${d.id}?auto=1`} target="_blank" rel="noopener">พิมพ์ / PDF</a>
        </div>
      </div>
      {flash && <div className="login-info" role="status" style={{ marginBottom: 12 }}>{flash}</div>}
      {typeof sp.paid === "string" && typeof sp.rc === "string" && (
        <div className="login-info" role="status" style={{ marginBottom: 12 }}>
          บันทึกรับชำระแล้ว — ออกใบเสร็จ <b>{sp.paid.slice(0, 40)}</b> · <Link className="link" href={`/admin/docs/RECEIPT/${encodeURIComponent(sp.rc)}`}>ดูใบเสร็จ</Link> · <a className="link" href={`/admin/print/doc/${encodeURIComponent(sp.rc)}?auto=1`} target="_blank" rel="noopener">พิมพ์ใบเสร็จ</a>
        </div>
      )}
      {err && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="de-cols dv">
        <aside className="dv-side">
          <div className="dv-card">
            <div className="dv-top">
              <div className="dv-amt">
                <span>{d.type === "INVOICE" && st !== "draft" && st !== "void" ? "ยอดค้างชำระ" : "ยอดรวมสุทธิ"}</span>
                <b className="num">฿{money(d.type === "INVOICE" && st !== "draft" && st !== "void" ? outstanding : d.grandSatang)}</b>
                {d.type === "INVOICE" && d.paidSatang > 0 && <small>ชำระแล้ว ฿{money(d.paidSatang)} จาก ฿{money(d.grandSatang)}</small>}
              </div>
            </div>
            {d.type === "INVOICE" && d.grandSatang > 0 && st !== "draft" && <div className="dv-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (d.paidSatang / d.grandSatang) * 100)}%` }} /></div>}
            <div className="dv-kv">
              <span>ลูกค้า</span><b>{d.customer ? <Link className="link" href={`/admin/customers/${d.customer.id}`}>{d.customer.code} {d.customer.name}</Link> : c.name ?? "—"}</b>
              {d.type === "QUOTATION" && <><span>ยืนราคาถึง</span><b>{docDate(ymdOf(d.validUntil), era)}</b></>}
              {d.type === "INVOICE" && <><span>ครบกำหนด</span><b className={st === "overdue" ? "owe" : ""}>{docDate(ymdOf(d.dueDate), era)}</b></>}
              {d.paymentMethod && <><span>การชำระเงิน</span><b>{d.paymentMethod}</b></>}
              {d.carrier && <><span>ขนส่ง</span><b>{d.carrier}</b></>}
              {d.vatMode !== "NONE" && <><span>VAT {d.vatRateBp / 100}%</span><b>{d.vatMode === "EXCLUSIVE" ? "แยกนอก" : "รวมใน"} ฿{money(d.vatSatang)}</b></>}
              {d.status === "VOID" && <><span>เหตุผลยกเลิก</span><b>{d.voidReason}</b></>}
            </div>
            <div className="dv-acts">
              {d.status === "DRAFT" && (
                <>
                  <form action={issueDoc}>{idInput}<ConfirmSubmit className="btn btn-primary" title={`ออก${label}?`} body="ระบบจะออกเลขที่เอกสาร หลังจากนี้แก้ไขไม่ได้ (แก้ได้ด้วยการยกเลิก/สร้างฉบับแก้ไข)" confirmLabel="ออกเอกสาร">ออกเอกสาร (ออกเลขที่)</ConfirmSubmit></form>
                  <Link className="btn btn-outline" href={`${docPath(d)}/edit`}>แก้ไขฉบับร่าง</Link>
                  <form action={deleteDraft}>{idInput}<ConfirmSubmit className="btn btn-ghost" title="ลบฉบับร่างนี้?" body="ฉบับร่างยังไม่มีเลขที่ ลบได้โดยไม่กระทบเลขเอกสาร" confirmLabel="ลบฉบับร่าง">ลบฉบับร่าง</ConfirmSubmit></form>
                </>
              )}
              {d.type === "QUOTATION" && ["ISSUED", "ACCEPTED"].includes(d.status) && (liveIv ? <Link className="btn btn-primary" href={docPath(liveIv)}>ดูใบแจ้งหนี้ {liveIv.docNo ?? "(ฉบับร่าง)"}</Link> : act(convertQuote, "แปลงเป็นใบแจ้งหนี้", "btn btn-primary"))}
              {d.type === "QUOTATION" && d.status === "ISSUED" && <>{act(acceptQuote, st === "expired" ? "ลูกค้าตอบรับ (หมดอายุแล้ว)" : "ลูกค้าตอบรับ")}{act(rejectQuote, "ลูกค้าไม่ตอบรับ")}</>}
              {d.type === "QUOTATION" && ["ACCEPTED", "REJECTED"].includes(d.status) && !liveIv && act(reopenQuote, "กลับเป็นรอตอบรับ", "btn btn-ghost")}
              {d.type === "QUOTATION" && ["ISSUED", "REJECTED"].includes(d.status) && (draftRevision ? <Link className="btn btn-outline" href={`${docPath(draftRevision)}/edit`}>ฉบับแก้ไขที่ร่างไว้</Link> : act(reviseQuote, "สร้างฉบับแก้ไข"))}
              {d.status !== "DRAFT" && act(duplicateDoc, "ทำสำเนาเป็นฉบับใหม่", "btn btn-ghost")}
            </div>
          </div>

          {d.type === "INVOICE" && ["ISSUED", "PARTIAL"].includes(d.status) && (
            <section className="dv-sec">
              <h3>บันทึกรับชำระ</h3>
              <PaymentForm id={d.id} outstanding={outstanding} today={today} methods={PAY_METHODS} minDate={ymdOf(d.issueDate)} />
            </section>
          )}

          {d.type === "INVOICE" && d.payments.length > 0 && (
            <section className="dv-sec">
              <h3>การรับชำระ ({livePays.length} งวด)</h3>
              <ul className="dv-pays">
                {d.payments.map((p) => (
                  <li key={p.id} className={p.voided ? "voided" : ""}>
                    <span>
                      <b className="num">฿{money(p.amountSatang)}</b>
                      <span className="sub">{docDate(ymdBkk(p.paidAt), era)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}{p.voided ? " · ยกเลิกแล้ว" : ""}</span>
                    </span>
                    {p.receipt && <Link className="link" href={`/admin/docs/RECEIPT/${p.receipt.id}`}>{p.receipt.docNo}</Link>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(d.source || d.derived.length > 0 || d.order || d.receiptFor) && (
            <section className="dv-sec">
              <h3>เอกสารที่เกี่ยวข้อง</h3>
              <ul className="dv-links">
                {d.source && <li><span className="sub">{d.type === "QUOTATION" ? "แก้ไขจาก" : "อ้างอิง"}</span><Link className="link" href={docPath(d.source)}>{d.source.docNo ?? "ฉบับร่าง"}</Link><span className="sub">{DOC_META[d.source.type].short}</span></li>}
                {d.derived.map((x) => <li key={x.id}><span className="sub">{x.type === d.type ? "ฉบับแก้ไข/สำเนา" : DOC_META[x.type].th.split(" /")[0]}</span><Link className="link" href={docPath(x)}>{x.docNo ?? "ฉบับร่าง"}</Link>{x.status === "VOID" && <span className="dst dst-void">ยกเลิก</span>}</li>)}
                {d.order && <li><span className="sub">คำสั่งซื้อเว็บ</span><Link className="link" href={`/admin?tab=ALL&open=${d.order.orderNo}`}>{d.order.orderNo}</Link></li>}
              </ul>
            </section>
          )}

          {d.type !== "QUOTATION" && d.status !== "DRAFT" && d.status !== "VOID" && (
            <details className="dv-sec lbl-box">
              <summary><h3>ใบปะหน้าส่งของ</h3></summary>
              <LabelOptions target={`doc=${d.id}`} idKey={d.id} />
            </details>
          )}

          {d.internalNote && <section className="dv-sec"><h3>โน้ตภายในร้าน</h3><p className="dv-note">{d.internalNote}</p></section>}

          {d.status !== "DRAFT" && d.status !== "VOID" && (
            <section className="dv-sec">
              <VoidForm id={d.id} label={label} hint={d.type === "RECEIPT" && d.receiptFor ? "ยอดรับชำระของงวดนี้จะถูกหักออกจากใบแจ้งหนี้ให้อัตโนมัติ" : d.type === "INVOICE" && livePays.length ? "ต้องยกเลิกใบเสร็จของทุกงวดก่อน" : undefined} />
            </section>
          )}

          <section className="dv-sec">
            <h3>ประวัติเอกสาร</h3>
            <ul className="timeline">
              {d.events.map((e) => (
                <li key={e.id} className={`t-${e.type === "VOIDED" ? "REJECTED" : e.type === "PAYMENT" || e.type === "ISSUED" ? "APPROVED" : e.type}`}>
                  <b>{EV[e.type] ?? e.type}</b>{e.note ? ` — ${e.note}` : ""}
                  <small>{docDateTime(e.createdAt, era)} · {e.admin?.displayName ?? "ระบบ"}</small>
                </li>
              ))}
            </ul>
          </section>
        </aside>
        <section className="de-pv" aria-label="ตัวอย่างเอกสาร">
          <DocSheets view={view} fit />
        </section>
      </div>
    </main>
  );
}
