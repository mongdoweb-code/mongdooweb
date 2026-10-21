// ขอใบเสนอราคา / ปรึกษางาน — บันทึกเป็น Inquiry (QUOTE) + แจ้ง LINE ร้าน
import type { Metadata } from "next";
import { formatPhone } from "@/lib/format";
import { getPublicShopInfo } from "@/lib/settings";
import { InquiryForm } from "../_lot2/InquiryForm";
import { PageHead } from "../_components/PageHead";

export const metadata: Metadata = {
  title: "ขอใบเสนอราคา / ปรึกษางานไฟ — มองดูเว็บ",
  description: "ขอใบเสนอราคาไฟ LED ใต้น้ำ สระว่ายน้ำ น้ำพุ สวน และอาคาร แนบรูปหน้างานและรายการสินค้าจากตะกร้าได้ ทีมงานติดต่อกลับพร้อมราคา",
  alternates: { canonical: "/quote" },
};

export default async function QuotePage() {
  const s = await getPublicShopInfo();
  const tel = s.phone.replace(/[^\d+]/g, "");
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "ขอใบเสนอราคา" }]}
        eyebrow="งานโครงการ · สั่งจำนวนมาก"
        title="ขอใบเสนอราคา / ปรึกษางาน"
        sub="เล่ารายละเอียดงานและแนบรูปพื้นที่ ทีมงานช่วยเลือกรุ่น จำนวนโคม หม้อแปลง และส่งใบเสนอราคาให้"
      />
      <div className="container pg-body">
        <div className="l2-cols">
          <InquiryForm kind="QUOTE" />
          <div>
            <aside className="l2-aside" aria-labelledby="qa-h">
              <h2 id="qa-h">ข้อมูลที่ช่วยให้เสนอราคาได้แม่นยำ</h2>
              <ul>
                <li>ประเภทงาน เช่น สระว่ายน้ำ น้ำพุ บ่อปลา สวน หรือส่องอาคาร</li>
                <li>ขนาดพื้นที่หรือขนาดสระ และจำนวนจุดที่ต้องการติดไฟ</li>
                <li>สีแสงที่ต้องการ (ขาว / วอร์ม / RGB เปลี่ยนสี)</li>
                <li>ระยะสายจากตู้ไฟถึงจุดติดตั้ง และจังหวัดที่จัดส่ง</li>
                <li>ต้องการใบกำกับภาษีในนามบริษัทหรือไม่</li>
              </ul>
            </aside>
            <aside className="l2-aside" aria-labelledby="qc-h">
              <h2 id="qc-h">ต้องการคุยเลย?</h2>
              <ul>
                {tel && (
                  <li>
                    <span>โทร</span>
                    <a href={`tel:${tel}`}>{formatPhone(s.phone)}</a>
                    {s.businessHours ? ` · ${s.businessHours}` : ""}
                  </li>
                )}
                {s.lineId && (
                  <li>
                    <span>LINE</span>
                    <a href="#" data-line target="_blank" rel="noopener">
                      {s.lineId}
                    </a>
                  </li>
                )}
              </ul>
              <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">
                ส่งรูปหน้างานทาง LINE
              </a>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
