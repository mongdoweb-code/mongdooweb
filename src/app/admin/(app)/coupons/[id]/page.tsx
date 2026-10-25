// /admin/coupons/:id — แก้คูปอง + รายงานการใช้ (คำสั่งซื้อ, ส่วนลดรวม, ยอดขายที่ชำระแล้ว)
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_LABEL } from "@/lib/admin-orders";
import { requireAdmin } from "@/lib/auth";
import { couponLabel, ymdOfEnd, ymdOfStart } from "@/lib/coupon-calc";
import { couponUsage } from "@/lib/coupons";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { CouponForm } from "../CouponForm";
import { deleteCoupon, toggleCoupon } from "../actions";
import "../coupons.css";

const baht = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 });
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function CouponDetailPage({ params, searchParams }: PageProps<"/admin/coupons/[id]">) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await prisma.coupon.findUnique({ where: { id } });
  if (!c) notFound();
  const [u, cats] = await Promise.all([couponUsage(c.id), prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true } })]);
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/coupons">← คูปองทั้งหมด</Link></p>
          <h1 className="num">{c.code}</h1>
          <p>{couponLabel(c)} · {c.isActive ? "เปิดใช้งาน" : "ปิดอยู่"}</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href={`/admin/coupons/export.csv?id=${c.id}`}>ส่งออก CSV</a>
          <form action={toggleCoupon}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="ret" value="detail" />
            <button className="btn btn-outline" type="submit">{c.isActive ? "ปิดคูปอง" : "เปิดคูปอง"}</button>
          </form>
          {u.orders === 0 && (
            <form action={deleteCoupon}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmSubmit className="btn btn-danger" title="ลบคูปองนี้?" body="ยังไม่มีการใช้ ลบได้ถาวร" confirmLabel="ลบ">ลบ</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
      {sp.saved === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>บันทึกคูปองแล้ว</div>}
      {sp.err === "used" && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>คูปองนี้ถูกใช้แล้ว ลบไม่ได้ — ปิดใช้งานแทน</div>}
      <div className="cp-kpis kpis" id="couponKpis">
        <div className="kpi"><span>ใช้ไปแล้ว</span><b className="num">{c.usedCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ""}</b><small>คำสั่งซื้อ</small></div>
        <div className="kpi"><span>ส่วนลดรวม</span><b className="num">{baht(u.discountSatang)}</b><small>{u.orders} คำสั่งซื้อ</small></div>
        <div className="kpi"><span>ยอดขาย (ชำระแล้ว)</span><b className="num">{baht(u.salesSatang)}</b><small>คำสั่งซื้อที่ใช้คูปองนี้</small></div>
      </div>
      <CouponForm
        categories={cats.map((x) => ({ id: x.id, name: x.nameTh }))}
        v={{
          id: c.id, code: c.code, kind: c.kind, value: String(c.value / 100), minOrder: c.minOrderSatang ? String(c.minOrderSatang / 100) : "",
          maxDiscount: c.maxDiscountSatang != null ? String(c.maxDiscountSatang / 100) : "", startsAt: ymdOfStart(c.startsAt), endsAt: ymdOfEnd(c.endsAt),
          usageLimit: c.usageLimit != null ? String(c.usageLimit) : "", perPhoneLimit: c.perPhoneLimit != null ? String(c.perPhoneLimit) : "",
          categoryIds: c.categoryIds, isActive: c.isActive, note: c.note ?? "",
        }}
      />
      <h2 className="cp-h">การใช้คูปอง</h2>
      <section className="panel">
        <table className="tbl" id="couponUsage">
          <thead><tr><th>คำสั่งซื้อ</th><th>ลูกค้า</th><th>เบอร์</th><th className="r">ส่วนลด</th><th className="r">ยอดชำระ</th><th>สถานะ</th><th>เวลา</th></tr></thead>
          <tbody>
            {u.rows.map((r) => (
              <tr key={r.id}>
                <td><Link className="link" href={`/admin?tab=ALL&open=${r.order.orderNo}`}>{r.order.orderNo}</Link></td>
                <td>{r.order.customerName}</td>
                <td className="num">{formatPhone(r.phone)}</td>
                <td className="r num">{baht(r.discountSatang)}</td>
                <td className="r num">{baht(r.order.totalSatang)}</td>
                <td>{STATUS_LABEL[r.order.status]}</td>
                <td>{fmt(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!u.rows.length && <div className="empty"><b>ยังไม่มีการใช้คูปองนี้</b></div>}
      </section>
    </main>
  );
}
