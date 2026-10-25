// /admin/docs/slips — คิวสลิปที่ลูกค้าแนบผ่านลิงก์ใบแจ้งหนี้ (A20) เรียงเก่าสุดก่อน → เปิดใบแจ้งหนี้เพื่ออนุมัติ/ปฏิเสธ
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { docDateTime, money } from "@/lib/doc-calc";
import { asSnap } from "@/lib/docs";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export default async function DocSlipQueuePage({ searchParams }: PageProps<"/admin/docs/slips">) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const [pending, recent] = await Promise.all([
    prisma.docSlip.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 200, include: { document: { select: { id: true, docNo: true, customerSnapshot: true, grandSatang: true, paidSatang: true } } } }),
    prisma.docSlip.findMany({ where: { status: { not: "PENDING" } }, orderBy: { createdAt: "desc" }, take: 20, include: { document: { select: { id: true, docNo: true, customerSnapshot: true } } } }),
  ]);
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>สลิปจากลิงก์ใบแจ้งหนี้</h1>
          <p>ลูกค้าแนบสลิปผ่านลิงก์ลับของใบแจ้งหนี้ — อนุมัติแล้วระบบบันทึกรับชำระและออกใบเสร็จให้อัตโนมัติ</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href="/admin/docs/INVOICE">ใบแจ้งหนี้ทั้งหมด</Link>
        </div>
      </div>
      {typeof sp.paid === "string" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ออกใบเสร็จ {sp.paid.slice(0, 40)} แล้ว</div>}
      {typeof sp.err === "string" && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{sp.err.slice(0, 200)}</div>}
      <section className="panel">
        <table className="tbl" id="docSlipQueue">
          <thead>
            <tr><th>ใบแจ้งหนี้</th><th>ลูกค้า</th><th className="r">ยอดในสลิป</th><th className="r">ค้างชำระ</th><th>แนบเมื่อ</th><th /></tr>
          </thead>
          <tbody>
            {pending.map((x) => (
              <tr key={x.id}>
                <td><Link className="link" href={`/admin/docs/INVOICE/${x.document.id}#docSlips`}>{x.document.docNo}</Link></td>
                <td>{asSnap(x.document.customerSnapshot).name ?? "—"}</td>
                <td className="r num">฿{money(x.amountSatang)}</td>
                <td className="r num">฿{money(x.document.grandSatang - x.document.paidSatang)}</td>
                <td>{docDateTime(x.createdAt, s.dateEra)}</td>
                <td><Link className="btn btn-outline btn-sm" href={`/admin/docs/INVOICE/${x.document.id}#docSlips`}>ตรวจ</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pending.length && <div className="empty"><b>ไม่มีสลิปรอตรวจ</b></div>}
      </section>
      {recent.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, padding: "12px 16px 0" }}>ตรวจล่าสุด</h2>
          <table className="tbl">
            <tbody>
              {recent.map((x) => (
                <tr key={x.id}>
                  <td><Link className="link" href={`/admin/docs/INVOICE/${x.document.id}`}>{x.document.docNo}</Link></td>
                  <td>{asSnap(x.document.customerSnapshot).name ?? "—"}</td>
                  <td className="r num">฿{money(x.amountSatang)}</td>
                  <td>{x.status === "ACCEPTED" ? "อนุมัติ" : `ไม่ผ่าน — ${x.rejectReason ?? ""}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
