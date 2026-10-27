// /privacy/request — คำขอใช้สิทธิ์ของเจ้าของข้อมูลส่วนบุคคล (PDPA ม.30–36): ขอดู/สำเนา ลบ แก้ไข คัดค้าน (U28)
import type { Metadata } from "next";
import { PageHead } from "../../_components/PageHead";
import { DataRequestForm } from "./DataRequestForm";
import "./request.css";

export const metadata: Metadata = {
  title: "คำขอเกี่ยวกับข้อมูลส่วนบุคคล — มองดูเว็บ",
  description: "ขอดู ขอสำเนา ขอแก้ไข ขอลบ หรือคัดค้านการใช้ข้อมูลส่วนบุคคลของคุณกับร้านมองดูเว็บ ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562",
  alternates: { canonical: "/privacy/request" },
};

export default function DataRequestPage() {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "นโยบายความเป็นส่วนตัว", href: "/privacy" }, { label: "คำขอข้อมูลส่วนบุคคล" }]}
        eyebrow="PDPA" title="คำขอเกี่ยวกับข้อมูลส่วนบุคคล" selfHref="/privacy/request"
        sub="ใช้สิทธิ์ขอดู ขอสำเนา แก้ไข ลบ หรือคัดค้านการใช้ข้อมูลของคุณ — ร้านจะดำเนินการภายใน 30 วัน"
      />
      <div className="container pg-body">
        <div className="l2-cols">
          <div><DataRequestForm /></div>
          <aside className="l2-aside" aria-labelledby="dr-h">
            <h2 id="dr-h">ขั้นตอน</h2>
            <ul>
              <li><span>1</span>ส่งคำขอผ่านแบบฟอร์มนี้ ด้วยเบอร์โทรที่ใช้สั่งซื้อ</li>
              <li><span>2</span>ร้านยืนยันตัวตน (โทรกลับ/ถามเลขคำสั่งซื้อ) เพื่อไม่ให้ผู้อื่นขอข้อมูลของคุณ</li>
              <li><span>3</span>ร้านดำเนินการและแจ้งผลภายใน 30 วัน — ขอสำเนาจะได้ไฟล์ข้อมูลทั้งหมดที่ร้านมี</li>
              <li><span>!</span>ขอลบ: ใบเสร็จ/ใบกำกับภาษีต้องเก็บ 5 ปีตามกฎหมาย ร้านจะลบข้อมูลส่วนที่ไม่บังคับ (เบอร์ อีเมล ที่อยู่จัดส่ง รีวิว คำขอ ฯลฯ)</li>
            </ul>
            <p style={{ marginTop: 12 }}><a href="/privacy">อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม</a> · <button type="button" className="link" data-open-consent>ตั้งค่าคุกกี้</button></p>
          </aside>
        </div>
      </div>
    </main>
  );
}
