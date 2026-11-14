// /admin/docs/:type/:id — ดูเอกสาร: ตัวอย่าง A4 จริง, สถานะ/ยอดค้าง, ปุ่มตามขั้นตอน (ออก → ตอบรับ → แปลง → รับชำระ → ใบเสร็จ), ใบปะหน้า, ประวัติ
import { onlineQrFor } from "@/lib/public-docs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { docDate, docDateTime, money, ymdBkk } from "@/lib/doc-calc";
import { DOC_META, DOC_ST } from "@/lib/doc-render";
import { DOC_INCLUDE, LOST_REASONS, PAY_METHODS, asSnap, docPath, isDocType, statusOf, toView, todayYmd, ymdOf } from "@/lib/docs";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { ConfirmSubmit } from "../../../../_components/AdminClient";
import { DocSheets } from "../../../../_components/DocSheets";
import { LabelOptions } from "../../../../_components/LabelOptions";
import { acceptQuote, convertQuote, createCreditNote, deleteDraft, duplicateDoc, issueDoc, rejectQuote, reopenQuote, returnCreditStock, reviseQuote, setFollowUp, setSignDate } from "../../actions";
import { PaymentForm, QuoteToReceiptForm, VoidForm } from "../../DocForms";
import { DocOnline } from "../../DocOnline";
import { WorkPanel } from "../../WorkTag";

export const instant = false;

const SIGNER = { QUOTATION: "ผู้เสนอราคา", INVOICE: "ผู้วางบิล", RECEIPT: "ผู้รับเงิน", CREDIT_NOTE: "ผู้อนุมัติ" } as const;

const EV: Record<string, string> = { CREATED: "สร้าง", ISSUED: "ออกเอกสาร", CONVERTED: "แปลงเอกสาร", ACCEPTED: "ตอบรับ", REJECTED: "ไม่ตอบรับ", PAYMENT: "รับชำระ", PRINTED: "พิมพ์", VOIDED: "ยกเลิก", NOTE: "บันทึก", CUSTOMER_ACCEPTED: "ลูกค้ายืนยันออนไลน์", SLIP_UPLOADED: "ลูกค้าแนบสลิป", STOCK_RETURNED: "รับคืนเข้าสต็อก", VIEWED: "ลูกค้าเปิดดู", FOLLOW_UP: "นัดติดตาม", WORK: "สถานะงาน" };
/** จำนวนวันจาก a ถึง b (YYYY-MM-DD) */
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

export default async function DocViewPage({ params, searchParams }: PageProps<"/admin/docs/[type]/[id]">) {
  await requireAdmin();
  const [{ type, id }, sp] = await Promise.all([params, searchParams]);
  if (!isDocType(type)) notFound();
  if (id === "new") redirect(`/admin/docs/${type}/new/edit`);
  const d = await prisma.salesDocument.findUnique({ where: { id }, include: { ...DOC_INCLUDE, workBy: { select: { displayName: true } }, events: { orderBy: { createdAt: "desc" }, include: { admin: { select: { displayName: true } } } } } });
  if (!d) notFound();
  if (d.type !== type) redirect(docPath(d));
  const s = await getSettings();
  const view = { ...(await toView(d, s)), online: await onlineQrFor(d, s.quoteOnlineQr) };
  const today = todayYmd();
  const st = statusOf(d, today);
  const [stl, stc] = DOC_ST[st];
  const meta = DOC_META[d.type];
  const era = s.dateEra;
  const c = asSnap(d.customerSnapshot);
  const outstanding = Math.max(0, d.grandSatang - d.paidSatang);
  const livePays = d.payments.filter((p) => !p.voided);
  const liveIv = d.derived.find((x) => x.type === "INVOICE" && x.status !== "VOID");
  const liveRc = d.derived.find((x) => x.type === "RECEIPT" && x.status !== "VOID");
  const draftRevision = d.derived.find((x) => x.type === "QUOTATION" && x.status === "DRAFT");
  // ใบเสร็จ: ใบลดหนี้ที่ออกแล้วรวมเท่าไร (ลดได้อีกเท่าไร)
  const credited = d.derived.filter((x) => x.type === "CREDIT_NOTE" && x.status === "ISSUED").reduce((sum, x) => sum + x.grandSatang, 0);
  const cnDraft = d.derived.find((x) => x.type === "CREDIT_NOTE" && x.status === "DRAFT");
  const stockLines = d.type === "CREDIT_NOTE" ? d.items.filter((i) => i.productId && i.qtyMilli % 1000 === 0).length : 0;
  const label = meta.th.split(" /")[0];
  const flash =
    sp.issued === "1" ? `ออก${label}เลขที่ ${d.docNo} แล้ว` : sp.saved === "1" ? "บันทึกฉบับร่างแล้ว" : sp.exists === "1" ? "มีเอกสารนี้อยู่แล้ว — เปิดฉบับที่มีอยู่ให้" : sp.voided === "1" ? `ยกเลิก${label}แล้ว — เลขที่เดิมยังเก็บไว้ (ห้ามนำมาใช้ซ้ำ)` : sp.stock === "1" ? "รับสินค้าคืนเข้าสต็อกแล้ว — ดูได้ในประวัติสต็อก" : "";
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
              {d.type === "QUOTATION" && d.status === "REJECTED" && d.lostReason && <><span>เหตุผลที่ไม่ได้งาน</span><b className="owe">{d.lostReason}</b></>}
              {d.type === "INVOICE" && <><span>ครบกำหนด</span><b className={st === "overdue" ? "owe" : ""}>{docDate(ymdOf(d.dueDate), era)}</b></>}
              {d.paymentMethod && <><span>การชำระเงิน</span><b>{d.paymentMethod}</b></>}
              {d.carrier && <><span>ขนส่ง</span><b>{d.carrier}</b></>}
              {d.vatMode !== "NONE" && <><span>VAT {d.vatRateBp / 100}%</span><b>{d.vatMode === "EXCLUSIVE" ? "แยกนอก" : "รวมใน"} ฿{money(d.vatSatang)}</b></>}
              {d.status === "VOID" && <><span>เหตุผลยกเลิก</span><b>{d.voidReason}</b></>}
              {d.type === "CREDIT_NOTE" && <><span>เหตุผลลดหนี้</span><b>{d.creditReason ?? "—"}</b></>}
              {d.type === "CREDIT_NOTE" && d.source && <><span>อ้างอิงใบเสร็จ</span><b><Link className="link" href={docPath(d.source)}>{d.source.docNo}</Link> (฿{money(d.source.grandSatang)})</b></>}
              {d.type === "RECEIPT" && credited > 0 && <><span>ลดหนี้แล้ว</span><b className="owe">฿{money(credited)}</b></>}
            </div>
            <div className="dv-acts">
              {d.status === "DRAFT" && (
                <>
                  <form action={issueDoc}>{idInput}<ConfirmSubmit className="btn btn-primary" title={`ออก${label}?`} body="ระบบจะออกเลขที่เอกสาร หลังจากนี้แก้ไขไม่ได้ (แก้ได้ด้วยการยกเลิก/สร้างฉบับแก้ไข)" confirmLabel="ออกเอกสาร">ออกเอกสาร (ออกเลขที่)</ConfirmSubmit></form>
                  <Link className="btn btn-outline" href={`${docPath(d)}/edit`}>แก้ไขฉบับร่าง</Link>
                  <form action={deleteDraft}>{idInput}<ConfirmSubmit className="btn btn-ghost" title="ลบฉบับร่างนี้?" body="ฉบับร่างยังไม่มีเลขที่ ลบได้โดยไม่กระทบเลขเอกสาร" confirmLabel="ลบฉบับร่าง">ลบฉบับร่าง</ConfirmSubmit></form>
                </>
              )}
              {d.type === "QUOTATION" && ["ISSUED", "ACCEPTED"].includes(d.status) &&
                (liveRc ? (
                  <Link className="btn btn-primary" href={liveRc.docNo ? docPath(liveRc) : `${docPath(liveRc)}/edit`}>ดูใบเสร็จรับเงิน {liveRc.docNo ?? "(ฉบับร่าง)"}</Link>
                ) : liveIv ? (
                  <>
                    <Link className="btn btn-primary" href={docPath(liveIv)}>ดูใบแจ้งหนี้ {liveIv.docNo ?? "(ฉบับร่าง)"}</Link>
                    <small className="sub dv-hint">ใบเสร็จออกจากใบแจ้งหนี้: บันทึกรับชำระที่ใบแจ้งหนี้ แล้วระบบออกใบเสร็จให้อัตโนมัติ</small>
                  </>
                ) : (
                  <>
                    {act(convertQuote, "แปลงเป็นใบแจ้งหนี้", "btn btn-primary")}
                    <QuoteToReceiptForm id={d.id} total={money(d.grandSatang)} today={today} minDate={ymdOf(d.issueDate)} methods={PAY_METHODS} defaultMethod={d.paymentMethod ?? ""} />
                  </>
                ))}
              {d.type === "QUOTATION" && d.status === "ISSUED" && (
                <>
                  {act(acceptQuote, st === "expired" ? "ลูกค้าตอบรับ (หมดอายุแล้ว)" : "ลูกค้าตอบรับ")}
                  <details className="qt-lost">
                    <summary className="btn btn-outline">ลูกค้าไม่ตอบรับ…</summary>
                    <form action={rejectQuote} className="qt-lost-f">
                      {idInput}
                      <label htmlFor="lostReason">เหตุผลที่ไม่ได้งาน</label>
                      <select id="lostReason" name="reason" defaultValue={LOST_REASONS[0]}>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                      <label htmlFor="lostNote" className="sr-only">รายละเอียดเพิ่มเติม</label>
                      <input id="lostNote" name="reasonNote" maxLength={200} placeholder="รายละเอียด เช่น คู่แข่งเสนอ ฿12,000" />
                      <button className="btn btn-danger btn-sm" type="submit">บันทึกว่าไม่ตอบรับ</button>
                    </form>
                  </details>
                </>
              )}
              {d.type === "QUOTATION" && ["ACCEPTED", "REJECTED"].includes(d.status) && !liveIv && !liveRc && act(reopenQuote, "กลับเป็นรอตอบรับ", "btn btn-ghost")}
              {d.type === "QUOTATION" && ["ISSUED", "REJECTED"].includes(d.status) && (draftRevision ? <Link className="btn btn-outline" href={`${docPath(draftRevision)}/edit`}>ฉบับแก้ไขที่ร่างไว้</Link> : act(reviseQuote, "สร้างฉบับแก้ไข"))}
              {d.type === "RECEIPT" && d.status === "ISSUED" && (cnDraft ? (
                <Link className="btn btn-outline" href={`${docPath(cnDraft)}/edit`}>ใบลดหนี้ที่ร่างไว้</Link>
              ) : credited < d.grandSatang ? act(createCreditNote, credited ? `ออกใบลดหนี้เพิ่ม (ลดได้อีก ฿${money(d.grandSatang - credited)})` : "ออกใบลดหนี้ / คืนเงิน") : null)}
              {d.type === "CREDIT_NOTE" && d.status === "ISSUED" && !d.stockReturnedAt && stockLines > 0 && (
                <form action={returnCreditStock}>{idInput}<ConfirmSubmit className="btn btn-outline" title="รับสินค้าคืนเข้าสต็อก?" body={`เพิ่มสต็อกตามจำนวนในใบลดหนี้ ${stockLines} รายการ (สินค้าที่นับสต็อก) — ทำได้ครั้งเดียว`} confirmLabel="รับคืนเข้าสต็อก">รับสินค้าคืนเข้าสต็อก</ConfirmSubmit></form>
              )}
              {d.type === "CREDIT_NOTE" && d.stockReturnedAt && <small className="sub dv-hint">รับสินค้าคืนเข้าสต็อกแล้ว {docDateTime(d.stockReturnedAt, era)}</small>}
              {d.status !== "DRAFT" && d.type !== "CREDIT_NOTE" && act(duplicateDoc, "ทำสำเนาเป็นฉบับใหม่", "btn btn-ghost")}
            </div>
          </div>

          <WorkPanel id={d.id} state={d.workState} note={d.workNote} by={d.workBy?.displayName} at={d.workAt ? docDateTime(d.workAt, era) : null} />

          {d.type === "QUOTATION" && d.status !== "DRAFT" && (() => {
            const vu = ymdOf(d.validUntil);
            const left = vu ? dayDiff(today, vu) : null;
            const fu = ymdOf(d.followUpAt);
            const fuIn = fu ? dayDiff(today, fu) : null;
            return (
              <section className="dv-sec qt-track" id="qtTrack">
                <h3>ติดตามการขาย</h3>
                <ul className="qt-facts">
                  <li className={d.viewCount ? "ok" : "warn"}>
                    <b>{d.viewCount ? `ลูกค้าเปิดดูแล้ว ${d.viewCount} ครั้ง` : "ลูกค้ายังไม่เปิดดูลิงก์"}</b>
                    <span className="sub">{d.lastViewedAt ? `ล่าสุด ${docDateTime(d.lastViewedAt, era)}${d.firstViewedAt && d.viewCount > 1 ? ` · ครั้งแรก ${docDateTime(d.firstViewedAt, era)}` : ""}` : "ส่งลิงก์ด้านล่างให้ลูกค้าทาง LINE — ระบบจะบอกเมื่อลูกค้าเปิด"}</span>
                  </li>
                  {d.status === "ISSUED" && left !== null && (
                    <li className={left < 0 ? "bad" : left <= 3 ? "warn" : ""}>
                      <b>{left < 0 ? `หมดอายุแล้ว ${-left} วัน` : left === 0 ? "ยืนราคาวันสุดท้าย (วันนี้)" : `ยืนราคาเหลือ ${left} วัน`}</b>
                      <span className="sub">{left < 0 ? "ถ้าลูกค้ายังสนใจ กด \"สร้างฉบับแก้ไข\" เพื่อออกราคาใหม่" : `ถึง ${docDate(vu, era)}`}</span>
                    </li>
                  )}
                  {d.status === "ISSUED" && (
                    <li className={fuIn !== null && fuIn <= 0 ? "bad" : ""}>
                      <b>{fu ? `นัดติดตาม ${docDate(fu, era)}` : "ยังไม่ได้นัดติดตาม"}</b>
                      <span className="sub">{fuIn === null ? "ตั้งวันนัดเพื่อให้ขึ้นในแท็บ \"ต้องติดตาม\"" : fuIn < 0 ? `เลยนัดมา ${-fuIn} วัน` : fuIn === 0 ? "วันนี้" : `อีก ${fuIn} วัน`}</span>
                    </li>
                  )}
                </ul>
                {d.status === "ISSUED" && (
                  <form action={setFollowUp} className="qt-fu">
                    {idInput}
                    <label htmlFor="fuNote">บันทึกการติดตาม (ไม่บังคับ)</label>
                    <textarea id="fuNote" name="note" rows={2} maxLength={500} placeholder="เช่น โทรคุยแล้ว ลูกค้าขอเทียบราคา จะตอบภายในศุกร์" />
                    <div className="qt-fu-row" role="group" aria-label="นัดติดตามครั้งถัดไป">
                      <span className="lbl">นัดครั้งถัดไป</span>
                      <button className="btn btn-outline btn-sm" type="submit" name="days" value="1">พรุ่งนี้</button>
                      <button className="btn btn-outline btn-sm" type="submit" name="days" value="3">อีก 3 วัน</button>
                      <button className="btn btn-outline btn-sm" type="submit" name="days" value="7">อีก 7 วัน</button>
                    </div>
                    <div className="qt-fu-row">
                      <label htmlFor="fuDate" className="sr-only">เลือกวันนัด</label>
                      <input id="fuDate" type="date" name="date" min={today} defaultValue={fu && fu >= today ? fu : ""} />
                      <button className="btn btn-primary btn-sm" type="submit">บันทึก</button>
                      {fu && <button className="btn btn-ghost btn-sm" type="submit" name="clear" value="1">ยกเลิกนัด</button>}
                    </div>
                  </form>
                )}
              </section>
            );
          })()}

          <DocOnline doc={d} era={era} />

          {s.showSignature && d.status !== "VOID" && (
            <section className="dv-sec">
              <h3>วันที่ลงนาม{SIGNER[d.type]}</h3>
              <form action={setSignDate} className="sign-form">
                <input type="hidden" name="id" value={d.id} />
                <input type="date" name="signDate" defaultValue={ymdOf(d.signDate) || ymdOf(d.issueDate) || today} aria-label={`วันที่ลงนาม${SIGNER[d.type]}`} />
                <button className="btn btn-outline btn-sm" type="submit">บันทึกวันที่</button>
              </form>
              <small className="sub">แสดงใต้ช่องลงนาม{SIGNER[d.type]}บนเอกสาร · ค่าเริ่มต้น = วันที่เอกสาร</small>
            </section>
          )}

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
                {d.source && <li><span className="sub">{d.type === "QUOTATION" ? "แก้ไขจาก" : d.type === "CREDIT_NOTE" ? "ลดหนี้จากใบเสร็จ" : "อ้างอิง"}</span><Link className="link" href={docPath(d.source)}>{d.source.docNo ?? "ฉบับร่าง"}</Link><span className="sub">{DOC_META[d.source.type].short}</span></li>}
                {d.derived.map((x) => <li key={x.id}><span className="sub">{x.type === d.type ? "ฉบับแก้ไข/สำเนา" : DOC_META[x.type].th.split(" /")[0]}</span><Link className="link" href={docPath(x)}>{x.docNo ?? "ฉบับร่าง"}</Link>{x.status === "VOID" && <span className="dst dst-void">ยกเลิก</span>}</li>)}
                {d.order && <li><span className="sub">คำสั่งซื้อเว็บ</span><Link className="link" href={`/admin?tab=ALL&open=${d.order.orderNo}`}>{d.order.orderNo}</Link></li>}
              </ul>
            </section>
          )}

          {d.type !== "QUOTATION" && d.type !== "CREDIT_NOTE" && d.status !== "DRAFT" && d.status !== "VOID" && (
            <details className="dv-sec lbl-box">
              <summary><h3>ใบปะหน้าส่งของ</h3></summary>
              <LabelOptions target={`doc=${d.id}`} idKey={d.id} />
            </details>
          )}

          {d.internalNote && <section className="dv-sec"><h3>โน้ตภายในร้าน</h3><p className="dv-note">{d.internalNote}</p></section>}

          {d.status !== "DRAFT" && d.status !== "VOID" && (
            <section className="dv-sec">
              <VoidForm id={d.id} label={label} hint={d.type === "CREDIT_NOTE" && d.stockReturnedAt ? "สต็อกที่รับคืนไปแล้วไม่ถูกตัดกลับอัตโนมัติ — ปรับที่หน้าสต็อกถ้าจำเป็น" : d.type === "RECEIPT" && credited ? "ต้องยกเลิกใบลดหนี้ของใบเสร็จนี้ก่อน" : d.type === "RECEIPT" && d.receiptFor ? "ยอดรับชำระของงวดนี้จะถูกหักออกจากใบแจ้งหนี้ให้อัตโนมัติ" : d.type === "INVOICE" && livePays.length ? "ต้องยกเลิกใบเสร็จของทุกงวดก่อน" : undefined} />
            </section>
          )}

          <section className="dv-sec">
            <h3>ประวัติเอกสาร</h3>
            <ul className="timeline">
              {d.events.map((e) => (
                <li key={e.id} className={`t-${e.type === "VOIDED" ? "REJECTED" : e.type === "PAYMENT" || e.type === "ISSUED" || e.type === "CUSTOMER_ACCEPTED" ? "APPROVED" : e.type === "WORK" ? (e.note?.startsWith("เสร็จสิ้น") ? "APPROVED" : "WORK") : e.type}`}>
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
