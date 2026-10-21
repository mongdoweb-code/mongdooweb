// /admin/inquiries/:id — รายละเอียดคำขอ: ข้อมูลลูกค้า, ข้อความ, สินค้าที่สนใจ, รูปแนบ, สถานะ, โน้ตภายใน, สร้างใบเสนอราคา
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/doc-calc";
import { formatPhone } from "@/lib/format";
import { INQ_KIND, INQ_STATUS, INQ_STATUS_CLS, parseAttachments, parseInqItems } from "@/lib/inquiries";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { deleteInquiry, quotationFromInquiry, saveInquiryNote, setInquiryStatus } from "../actions";

export const instant = false;

const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function InquiryPage({ params, searchParams }: PageProps<"/admin/inquiries/[id]">) {
  const admin = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const q = await prisma.inquiry.findUnique({ where: { id: id.slice(0, 40) } });
  if (!q) notFound();
  const items = parseInqItems(q.items);
  const att = parseAttachments(q.attachments);
  const products = items.length ? await prisma.product.findMany({ where: { slug: { in: items.map((i) => i.slug) } }, select: { slug: true, sku: true, name: true, priceSatang: true } }) : [];
  const [qt, customer, others] = await Promise.all([
    q.quotationId ? prisma.salesDocument.findUnique({ where: { id: q.quotationId }, select: { id: true, docNo: true, status: true, grandSatang: true } }) : null,
    q.customerId ? prisma.customer.findUnique({ where: { id: q.customerId }, select: { id: true, code: true, name: true } }) : null,
    prisma.inquiry.count({ where: { phone: q.phone, id: { not: q.id } } }),
  ]);
  const saved = one(sp.saved);
  const tel = q.phone.replace(/\D/g, "");

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/inquiries">← คำขอทั้งหมด</Link></p>
          <h1 className="dv-title">{INQ_KIND[q.kind]} · {q.name} <span className={`chip ${INQ_STATUS_CLS[q.status]}`} id="inqStatus">{INQ_STATUS[q.status]}</span></h1>
          <p>ส่งเมื่อ {fmt(q.createdAt)}{others ? ` · เบอร์นี้เคยส่งคำขออีก ${others} ครั้ง` : ""}</p>
        </div>
        <div className="head-actions">
          {q.kind !== "CLAIM" && (
            <form action={quotationFromInquiry}>
              <input type="hidden" name="id" value={q.id} />
              <button className="btn btn-primary" type="submit" id="mkQuote">
                {qt && qt.status !== "VOID" ? "เปิดใบเสนอราคา" : "สร้างใบเสนอราคาจากคำขอนี้"}
              </button>
            </form>
          )}
        </div>
      </div>
      <div className="notice-stack">
        {saved === "status" && <div className="ok-box" role="status">เปลี่ยนสถานะแล้ว</div>}
        {saved === "note" && <div className="ok-box" role="status">บันทึกโน้ตแล้ว</div>}
      </div>
      <div className="pform-grid">
        <div className="d-col">
          <section className="box">
            <h3>ข้อความจากลูกค้า</h3>
            <p className="inq-body">{q.message}</p>
          </section>
          {items.length > 0 && (
            <section className="box">
              <h3>สินค้าที่สนใจ ({items.length})</h3>
              <ul className="inq-items">
                {items.map((it, i) => {
                  const p = products.find((x) => x.slug === it.slug);
                  return (
                    <li key={i}>
                      <div>
                        {p ? <a className="link" href={`/product/${p.slug}`} target="_blank" rel="noopener">{p.name}</a> : <b>{it.name}</b>}
                        <span className="sub">{p ? `${p.sku} · ${p.priceSatang ? `฿${money(p.priceSatang)}` : "สอบถามราคา"}` : "ไม่พบสินค้านี้ในระบบ"}</span>
                      </div>
                      <b className="num">× {it.qty}</b>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {att.length > 0 && (
            <section className="box">
              <h3>รูปแนบ ({att.length})</h3>
              <div className="inq-att">
                {att.map((_, i) => (
                  <a key={i} href={`/admin/inquiries/${q.id}/file/${i}`} target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/admin/inquiries/${q.id}/file/${i}`} alt={`รูปแนบที่ ${i + 1}`} loading="lazy" />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="d-col">
          <section className="box">
            <h3>ผู้ติดต่อ</h3>
            <div className="kv">
              <span>ชื่อ</span><b>{q.name}</b>
              {q.company && <><span>บริษัท</span><b>{q.company}</b></>}
              <span>โทร</span><b><a className="link" href={`tel:${tel}`}>{formatPhone(q.phone)}</a></b>
              {q.email && <><span>อีเมล</span><b><a className="link" href={`mailto:${q.email}`}>{q.email}</a></b></>}
              {customer && <><span>ลูกค้า</span><b><Link className="link" href={`/admin/customers/${customer.id}`}>{customer.code} · {customer.name}</Link></b></>}
              {qt && <><span>ใบเสนอราคา</span><b><Link className="link" href={`/admin/docs/QUOTATION/${qt.id}${qt.status === "DRAFT" ? "/edit" : ""}`}>{qt.docNo ?? "ฉบับร่าง"}</Link> <span className="sub inl">฿{money(qt.grandSatang)}</span></b></>}
            </div>
          </section>
          <section className="act">
            <h3>สถานะ</h3>
            <div className="inq-st">
              {(Object.keys(INQ_STATUS) as (keyof typeof INQ_STATUS)[]).map((s) => (
                <form key={s} action={setInquiryStatus}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="status" value={s} />
                  <button className={`btn btn-sm ${q.status === s ? "btn-dark" : "btn-outline"}`} type="submit" aria-pressed={q.status === s} disabled={q.status === s}>{INQ_STATUS[s]}</button>
                </form>
              ))}
            </div>
          </section>
          <section className="box inote">
            <h3>โน้ตภายในร้าน <small>ลูกค้าไม่เห็น</small></h3>
            <form action={saveInquiryNote}>
              <input type="hidden" name="id" value={q.id} />
              <div className="field">
                <label className="sr-only" htmlFor="inqNote">โน้ต</label>
                <textarea id="inqNote" name="note" rows={5} maxLength={4000} defaultValue={q.note ?? ""} placeholder="เช่น โทรคุยแล้ว รอวัดพื้นที่ / เสนอราคาส่งทาง LINE" />
              </div>
              <div><button className="btn btn-dark btn-sm" type="submit">บันทึกโน้ต</button></div>
            </form>
          </section>
          {admin.role === "OWNER" && (
            <form action={deleteInquiry} className="box">
              <input type="hidden" name="id" value={q.id} />
              <ConfirmSubmit className="btn btn-danger btn-sm" title="ลบคำขอนี้?" body="ลบถาวร ย้อนกลับไม่ได้ (ถ้าเป็นสแปม ใช้สถานะ “สแปม” ได้)" confirmLabel="ลบคำขอ">ลบคำขอ</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
