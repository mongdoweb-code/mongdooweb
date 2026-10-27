// /admin/customers/new และ /admin/customers/:id — ข้อมูลลูกค้า + ประวัติเอกสาร/ยอดค้างชำระ + สร้างเอกสารให้ลูกค้านี้
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { docDate, money, ymdBkk } from "@/lib/doc-calc";
import { DOC_META, DOC_ST } from "@/lib/doc-render";
import { STATUS_LABEL } from "@/lib/admin-orders";
import { docPath, statusOf } from "@/lib/docs";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { deleteCustomer, mergeCustomer } from "../actions";
import { CustomerForm, type CustomerValues } from "../CustomerForm";
import { CustomerExtras } from "../CustomerExtras";
import "../../../lot12.css";

export const instant = false;

export default async function CustomerPage({ params, searchParams }: PageProps<"/admin/customers/[id]">) {
  const admin = await requireAdmin();
  const owner = admin.role === "OWNER";
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = id === "new" ? null : await prisma.customer.findUnique({ where: { id }, include: { documents: { orderBy: { createdAt: "desc" }, take: 100 }, orders: { orderBy: { createdAt: "desc" }, take: 20, select: { orderNo: true, totalSatang: true, status: true, createdAt: true } } } });
  if (id !== "new" && !c) notFound();
  const ship = (c?.shipTo && typeof c.shipTo === "object" && !Array.isArray(c.shipTo) ? c.shipTo : {}) as { name?: string; phone?: string; address?: Record<string, string> };
  const br = c?.branch ?? "";
  const v: CustomerValues = {
    id: c?.id ?? "", kind: c?.kind ?? "PERSON", name: c?.name ?? "", taxId: c?.taxId ?? "", branchType: /^สาขา/.test(br) ? "branch" : "hq", branchNo: br.replace(/\D/g, ""),
    contactName: c?.contactName ?? "", phone: c?.phone ? formatPhone(c.phone) : "", email: c?.email ?? "", addressLine: c?.addressLine ?? "", subdistrict: c?.subdistrict ?? "",
    district: c?.district ?? "", province: c?.province ?? "", postalCode: c?.postalCode ?? "", note: c?.note ?? "",
    shipName: ship.name ?? "", shipPhone: ship.phone ? formatPhone(ship.phone) : "", shipLine: ship.address?.line ?? "", shipSub: ship.address?.sub ?? "",
    shipDist: ship.address?.dist ?? "", shipProv: ship.address?.prov ?? "", shipZip: ship.address?.zip ?? "",
  };
  const docs = c?.documents ?? [];
  // คำสั่งซื้อเว็บที่เบอร์ตรงกันแต่ยังไม่ผูกกับลูกค้ารายนี้ + รายชื่อที่น่าจะซ้ำ (เบอร์/เลขผู้เสียภาษี/ชื่อเดียวกัน)
  const [phoneOrders, dupes] = c
    ? await Promise.all([
        c.phone ? prisma.order.findMany({ where: { phone: c.phone, OR: [{ customerId: null }, { customerId: { not: c.id } }] }, orderBy: { createdAt: "desc" }, take: 20, select: { orderNo: true, totalSatang: true, status: true, createdAt: true } }) : [],
        prisma.customer.findMany({
          where: { id: { not: c.id }, OR: [...(c.phone ? [{ phone: c.phone }] : []), ...(c.taxId ? [{ taxId: c.taxId }] : []), { name: { equals: c.name, mode: "insensitive" as const } }] },
          take: 10, select: { id: true, code: true, name: true, phone: true, taxId: true },
        }),
      ])
    : [[], []];
  const merged = typeof sp.merged === "string" ? sp.merged.split("|") : null;
  const owe = docs.filter((d) => d.type === "INVOICE" && ["ISSUED", "PARTIAL"].includes(d.status)).reduce((s, d) => s + d.grandSatang - d.paidSatang, 0);
  const paidTotal = docs.filter((d) => d.type === "RECEIPT" && d.status === "ISSUED").reduce((s, d) => s + d.grandSatang, 0);
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/customers">← ลูกค้าทั้งหมด</Link></p>
          <h1>{c ? `${c.code} · ${c.name}` : "เพิ่มลูกค้า"}</h1>
          {c && <p>สร้างเมื่อ {docDate(ymdBkk(c.createdAt), "AD")}{c.note ? ` · ${c.note}` : ""}</p>}
        </div>
        {c && (
          <div className="head-actions">
            <Link className="btn btn-outline" href={`/admin/docs/QUOTATION/new/edit?customer=${c.id}`}>+ ใบเสนอราคา</Link>
            <Link className="btn btn-outline" href={`/admin/docs/INVOICE/new/edit?customer=${c.id}`}>+ ใบแจ้งหนี้</Link>
            <Link className="btn btn-outline" href={`/admin/docs/RECEIPT/new/edit?customer=${c.id}`}>+ ใบเสร็จ</Link>
          </div>
        )}
      </div>
      {merged && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>รวมลูกค้า {merged[0]} เข้ารายนี้แล้ว — ย้ายเอกสาร {merged[1]} ฉบับ และคำสั่งซื้อ {merged[2]} รายการ</div>}
      {sp.merge === "notfound" && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>ไม่พบรหัสลูกค้าปลายทาง</div>}
      {sp.merge === "self" && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>เลือกลูกค้ารายอื่น (รวมกับตัวเองไม่ได้)</div>}
      {sp.err === "inuse" && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>ลบไม่ได้ — ลูกค้ารายนี้มีเอกสารหรือคำสั่งซื้ออยู่ (เอกสารต้องเก็บไว้ตามกฎหมาย)</div>}
      <div className="pform-grid">
        <div className="d-col">
          <div className="box"><h3>ข้อมูลลูกค้า</h3><CustomerForm v={v} saved={sp.saved === "1"} /></div>
          {c && owner && (
            <form action={mergeCustomer} className="box cu-merge" id="mergeBox">
              <h3>รวมรายการซ้ำ</h3>
              <p className="sub">ย้ายเอกสาร คำสั่งซื้อ และคำขอทั้งหมดของ {c.code} ไปไว้ที่ลูกค้ารายหลัก แล้วลบ {c.code} — ช่องที่รายหลักยังว่างจะเติมจากรายนี้ (เอกสารที่ออกแล้วไม่เปลี่ยน)</p>
              <input type="hidden" name="id" value={c.id} />
              {dupes.length > 0 && (
                <ul className="cu-dupes">
                  {dupes.map((d) => (
                    <li key={d.id}><Link className="link" href={`/admin/customers/${d.id}`}>{d.code} · {d.name}</Link><span className="sub">{d.phone ? formatPhone(d.phone) : ""}{d.taxId ? ` · ${d.taxId}` : ""}</span></li>
                  ))}
                </ul>
              )}
              <div className="field">
                <label htmlFor="mergeTarget">รหัสลูกค้ารายหลัก (เก็บไว้)</label>
                <input id="mergeTarget" name="target" maxLength={20} required placeholder={dupes[0]?.code ?? "เช่น 0012"} list="dupeCodes" />
                <datalist id="dupeCodes">{dupes.map((d) => <option key={d.id} value={d.code}>{d.name}</option>)}</datalist>
              </div>
              <ConfirmSubmit className="btn btn-outline" title={`รวม ${c.code} เข้ากับรายหลัก?`} body={`ลูกค้า ${c.code} ${c.name} จะถูกลบหลังย้ายข้อมูลทั้งหมด — ย้อนกลับไม่ได้`} confirmLabel="รวมลูกค้า">รวมเข้ากับรายหลัก</ConfirmSubmit>
            </form>
          )}
          {c && owner && docs.length === 0 && c.orders.length === 0 && (
            <form action={deleteCustomer} className="box">
              <input type="hidden" name="id" value={c.id} />
              <ConfirmSubmit className="btn btn-danger" title="ลบลูกค้ารายนี้?" body="ลบได้เพราะยังไม่มีเอกสารหรือคำสั่งซื้อ — ย้อนกลับไม่ได้" confirmLabel="ลบลูกค้า">ลบลูกค้า</ConfirmSubmit>
            </form>
          )}
        </div>
        {c && (
          <div className="d-col">
            <div className="pay-sum">
              <div><span>ค้างชำระ</span><b className={owe ? "owe num" : "num"}>฿{money(owe)}</b></div>
              <div><span>รับชำระแล้ว (ใบเสร็จ)</span><b className="num">฿{money(paidTotal)}</b></div>
              <div><span>เอกสารทั้งหมด</span><b className="num">{docs.length}</b></div>
            </div>
            <CustomerExtras customerId={c.id} tags={c.tags} />
            <section className="cu-hist">
              <h3>ประวัติเอกสาร</h3>
              {docs.length ? (
                <ul>
                  {docs.map((d) => {
                    const [l, cl] = DOC_ST[statusOf(d)];
                    return (
                      <li key={d.id}>
                        <Link className="link" href={docPath(d)}>{DOC_META[d.type].short} {d.docNo ?? "ฉบับร่าง"}</Link>
                        <span className="sub">{d.issueDate ? docDate(ymdBkk(d.issueDate), "AD") : "—"}</span>
                        <b className="num">{money(d.grandSatang)}</b>
                        <span className={`dst dst-${cl}`}>{l}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="sub">ยังไม่มีเอกสาร</p>}
            </section>
            {c.orders.length > 0 && (
              <section className="cu-hist">
                <h3>คำสั่งซื้อหน้าเว็บ</h3>
                <ul>
                  {c.orders.map((o) => (
                    <li key={o.orderNo}><Link className="link" href={`/admin?tab=ALL&open=${o.orderNo}`}>{o.orderNo}</Link><span className="sub">{docDate(ymdBkk(o.createdAt), "AD")}</span><b className="num">{money(o.totalSatang)}</b><span className="sub">{STATUS_LABEL[o.status]}</span></li>
                  ))}
                </ul>
              </section>
            )}
            {phoneOrders.length > 0 && (
              <section className="cu-hist">
                <h3>คำสั่งซื้อเว็บที่ใช้เบอร์เดียวกัน</h3>
                <ul>
                  {phoneOrders.map((o) => (
                    <li key={o.orderNo}><Link className="link" href={`/admin?tab=ALL&open=${o.orderNo}`}>{o.orderNo}</Link><span className="sub">{docDate(ymdBkk(o.createdAt), "AD")}</span><b className="num">{money(o.totalSatang)}</b><span className="sub">{STATUS_LABEL[o.status]}</span></li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
