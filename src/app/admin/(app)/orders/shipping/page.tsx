// /admin/orders/shipping — จัดส่งหลายรายการ: ดาวน์โหลดรายการรอจัดส่ง, อัปโหลด CSV เลขพัสดุ (ตรวจก่อนบันทึก)
import Link from "next/link";
import { CARRIERS } from "@/lib/admin-orders";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShipCsvForm } from "../OrderForms";
import "../../../lot3.css";

export default async function BulkShippingPage() {
  await requireAdmin();
  const waiting = await prisma.order.count({ where: { status: "PAID" } });
  return (
    <main className="main" id="page-bulk-ship">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin?tab=PAID">← รอจัดส่ง</Link></p>
          <h1>ใส่เลขพัสดุหลายรายการ</h1>
          <p>รอจัดส่ง {waiting} รายการ</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/admin/orders/shipping/template" download>ดาวน์โหลดรายการรอจัดส่ง (CSV)</a>
          {waiting > 0 && <a className="btn btn-outline" href="/admin/print/labels?status=PAID&auto=1" target="_blank" rel="noopener">พิมพ์ใบปะหน้าทั้งหมด</a>}
        </div>
      </div>
      <div className="l3-cols">
        <ShipCsvForm />
        <section className="l3-panel">
          <h2>รูปแบบไฟล์</h2>
          <p className="l3-note" style={{ margin: "6px 0 10px" }}>3 คอลัมน์ บรรทัดแรกเป็นหัวคอลัมน์ — ไฟล์จากปุ่ม &quot;ดาวน์โหลดรายการรอจัดส่ง&quot; มีเลขที่ครบแล้ว เติมขนส่งและเลขพัสดุแล้วอัปโหลดกลับ</p>
          <pre className="l3-pre">{"orderNo,carrier,trackingNo\nMDW-261020-1234,Kerry,KEX123456789\nMDW-261020-5678,Flash,TH01234567890"}</pre>
          <ul style={{ margin: "10px 0 0 18px", fontSize: 13.5, lineHeight: 1.7 }}>
            <li>ขนส่งที่รองรับ: {CARRIERS.join(", ")} (พิมพ์ย่อได้ เช่น Kerry, Flash, EMS, J&amp;T)</li>
            <li>เลขพัสดุ: ตัวอักษร A–Z ตัวเลข และ - อย่างน้อย 6 ตัว</li>
            <li>ใส่ได้เฉพาะคำสั่งซื้อสถานะ &quot;ชำระแล้ว · รอส่ง&quot; — แถวที่ผิดจะแสดงเหตุผลและไม่ถูกบันทึก</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
