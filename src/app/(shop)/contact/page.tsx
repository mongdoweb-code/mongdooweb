// ติดต่อเรา — ข้อมูลจากตั้งค่าร้าน (ที่อยู่ เวลาทำการ โทร LINE อีเมล แผนที่) + ฟอร์มติดต่อ (Inquiry CONTACT)
import type { Metadata } from "next";
import { formatPhone } from "@/lib/format";
import { getPublicShopInfo } from "@/lib/settings";
import { InquiryForm } from "../_lot2/InquiryForm";
import { PageHead } from "../_components/PageHead";

export const metadata: Metadata = {
  title: "ติดต่อเรา — มองดูเว็บ",
  description: "ติดต่อร้านมองดูเว็บ ที่อยู่ เวลาทำการ เบอร์โทร LINE อีเมล แผนที่ และแบบฟอร์มส่งข้อความถึงร้าน",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const s = await getPublicShopInfo();
  const tel = s.phone.replace(/[^\d+]/g, "");
  const map = s.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.address}`)}` : null;
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "ติดต่อเรา" }]} eyebrow="ช่วยเหลือ" title="ติดต่อเรา" sub="สอบถามสินค้า ปรึกษาการติดตั้ง หรือแจ้งปัญหาการใช้งาน ทีมงานยินดีช่วย" />
      <div className="container pg-body">
        <div className="l2-cols">
          <div>
            <h2 className="trk-sec-h" style={{ fontSize: 20, marginBottom: 16 }}>
              ส่งข้อความถึงร้าน
            </h2>
            <InquiryForm kind="CONTACT" />
          </div>
          <div>
            <aside className="l2-aside" aria-labelledby="ct-h">
              <h2 id="ct-h">{s.name}</h2>
              <ul>
                {s.address && (
                  <li>
                    <span>ที่อยู่</span>
                    {s.address}
                    {map && (
                      <>
                        <br />
                        <a href={map} target="_blank" rel="noopener">
                          เปิดแผนที่ Google Maps
                        </a>
                      </>
                    )}
                  </li>
                )}
                {s.businessHours && (
                  <li>
                    <span>เวลาทำการ</span>
                    {s.businessHours}
                  </li>
                )}
                {tel && (
                  <li>
                    <span>โทร</span>
                    <a href={`tel:${tel}`}>{formatPhone(s.phone)}</a>
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
                {s.email && (
                  <li>
                    <span>อีเมล</span>
                    <a href={`mailto:${s.email}`}>{s.email}</a>
                  </li>
                )}
              </ul>
              <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">
                แชทกับร้านทาง LINE
              </a>
            </aside>
            <aside className="l2-aside" aria-labelledby="ct-q">
              <h2 id="ct-q">ลิงก์ที่ใช้บ่อย</h2>
              <ul>
                <li>
                  <a href="/track">ติดตามคำสั่งซื้อ / แนบสลิป</a>
                </li>
                <li>
                  <a href="/quote">ขอใบเสนอราคางานโครงการ</a>
                </li>
                <li>
                  <a href="/warranty">การรับประกันและเคลมสินค้า</a>
                </li>
                <li>
                  <a href="/how-to-order">วิธีสั่งซื้อและชำระเงิน</a>
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
