// /admin/claims/:id — รายละเอียดเคลม: คำสั่งซื้อ, สินค้า, อาการ, รูป, สิทธิ์ประกัน/คืน, เปลี่ยนสถานะ + ข้อความถึงลูกค้า
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { CLAIM_KIND, CLAIM_STATUS, claimWindows, parseClaimItems } from "@/lib/claims";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { updateClaim } from "../actions";
import "../../coupons/coupons.css";

const fmt = (d: Date | null) => (d ? d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "—");

export default async function ClaimDetailPage({ params, searchParams }: PageProps<"/admin/claims/[id]">) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await prisma.claim.findUnique({ where: { id }, include: { order: { select: { orderNo: true, paidAt: true, shippedAt: true, status: true, totalSatang: true } } } });
  if (!c) notFound();
  const w = c.order ? claimWindows(c.order, c.createdAt) : null;
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/claims">← เคลมทั้งหมด</Link></p>
          <h1 className="num">{c.claimNo}</h1>
          <p>{CLAIM_KIND[c.kind]} · {CLAIM_STATUS[c.status]} · แจ้งเมื่อ {fmt(c.createdAt)}</p>
        </div>
      </div>
      {sp.saved === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>บันทึกแล้ว</div>}
      {sp.err === "resolution" && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>กรุณากรอกข้อความถึงลูกค้าก่อนเปลี่ยนเป็นสถานะนี้</div>}
      <div className="cl-grid">
        <div>
          <div className="box">
            <h3>ลูกค้าและคำสั่งซื้อ</h3>
            <div className="kv">
              <span>ชื่อ</span><b>{c.name}</b>
              <span>โทร</span><a href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a>
              <span>คำสั่งซื้อ</span>{c.order ? <Link className="link" href={`/admin?tab=ALL&open=${c.order.orderNo}`}>{c.order.orderNo}</Link> : <span>—</span>}
              <span>ชำระเมื่อ</span><span>{fmt(c.order?.paidAt ?? null)}</span>
              <span>จัดส่งเมื่อ</span><span>{fmt(c.order?.shippedAt ?? null)}</span>
              <span>ประกันถึง</span><span>{fmt(w?.warrantyUntil ?? null)}</span>
              <span>คืนได้ถึง</span><span>{fmt(w?.returnUntil ?? null)}</span>
              <span>สิทธิ์ ณ วันแจ้ง</span>
              <b id="claimRight">{c.inWarranty == null ? "—" : c.kind === "RETURN" ? (c.inWarranty ? "อยู่ในกำหนด 7 วัน" : "เลยกำหนด 7 วัน") : c.inWarranty ? "อยู่ในประกัน 1 ปี" : "หมดประกันแล้ว"}</b>
            </div>
          </div>
          <div className="box">
            <h3>สินค้าที่เคลม</h3>
            <ul>{parseClaimItems(c.items).map((i) => <li key={i.itemId}>{i.name} × {i.qty}</li>)}</ul>
            <h3 style={{ marginTop: 12 }}>อาการ / ปัญหา</h3>
            <p style={{ whiteSpace: "pre-wrap" }} id="claimIssue">{c.issue}</p>
          </div>
          {c.images.length > 0 && (
            <div className="box">
              <h3>รูปจากลูกค้า ({c.images.length})</h3>
              <div className="cl-photos">
                {c.images.map((_, i) => (
                  <a key={i} href={`/admin/claims/${c.id}/photo/${i}`} target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/admin/claims/${c.id}/photo/${i}`} alt={`รูปที่ ${i + 1}`} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <form action={updateClaim} className="box cp-form" id="claimUpdate">
          <h3>ดำเนินการ</h3>
          <input type="hidden" name="id" value={c.id} />
          <div className="field">
            <label htmlFor="clStatus">สถานะ</label>
            <select id="clStatus" name="status" defaultValue={c.status}>
              {Object.entries(CLAIM_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="clResolution">ข้อความถึงลูกค้า (แสดงในหน้าติดตามคำสั่งซื้อ)</label>
            <textarea id="clResolution" name="resolution" rows={4} maxLength={2000} defaultValue={c.resolution ?? ""} placeholder="เช่น อนุมัติเปลี่ยนสินค้าใหม่ จะจัดส่งภายใน 3 วันทำการ" />
          </div>
          <div className="field">
            <label htmlFor="clNote">โน้ตภายใน (ลูกค้าไม่เห็น)</label>
            <textarea id="clNote" name="note" rows={3} maxLength={2000} defaultValue={c.note ?? ""} />
          </div>
          <button className="btn btn-primary" type="submit">บันทึก</button>
        </form>
      </div>
    </main>
  );
}
