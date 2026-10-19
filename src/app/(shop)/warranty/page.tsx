// การรับประกันและเคลม — ร่าง ต้องให้เจ้าของร้านยืนยันเงื่อนไขจริง
import type { Metadata } from "next";
import { PageHead } from "../_components/PageHead";

export const metadata: Metadata = {
  title: "การรับประกันและเคลมสินค้า — มองดูเว็บ",
  alternates: { canonical: "/warranty" },
};

export default function WarrantyPage() {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "การรับประกันและเคลม" }]} eyebrow="ช่วยเหลือ" title="การรับประกันและเคลมสินค้า" />
      <div className="container pg-body">
        <article className="prose">
          {/* TODO: เจ้าของร้านยืนยันระยะเวลาและเงื่อนไขรับประกันจริง */}
          <p className="todo-box">
            <b>ร่าง</b> — เงื่อนไขด้านล่างเป็นค่าตัวอย่าง (อ้างอิง &quot;รับประกัน 1 ปี&quot; จากหน้าแรก) รอเจ้าของร้านยืนยัน
          </p>
          <h2>ระยะเวลารับประกัน</h2>
          <p>สินค้าไฟ LED รับประกัน 1 ปี นับจากวันที่ได้รับสินค้า กรณีสินค้าเสียจากการผลิต</p>
          <h2>ไม่อยู่ในการรับประกัน</h2>
          <ul>
            <li>ต่อไฟบ้าน 220V เข้ากับโคมที่ใช้ไฟ DC12V โดยตรง หรือใช้หม้อแปลงผิดสเปก</li>
            <li>รอยต่อสายไฟไม่ได้ปิดด้วยท่อหดกันน้ำ ทำให้น้ำเข้า</li>
            <li>ใช้งานลึกกว่าระดับกันน้ำที่กำหนด (IP67 ไม่เกิน 90 ซม.)</li>
            <li>ความเสียหายจากการตก กระแทก ดัดแปลง หรือภัยธรรมชาติ</li>
          </ul>
          <h2>ขั้นตอนเคลม</h2>
          <ul>
            <li>แจ้งเลขที่คำสั่งซื้อ พร้อมรูปหรือวิดีโออาการเสีย ทาง LINE ของร้าน</li>
            <li>ทีมงานตรวจสอบและแจ้งวิธีส่งสินค้ากลับ</li>
            <li>ร้านซ่อมหรือเปลี่ยนสินค้าใหม่ และส่งกลับให้ภายในเวลาที่แจ้ง</li>
          </ul>
          <p>
            <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">
              แจ้งเคลมทาง LINE
            </a>
          </p>
        </article>
      </div>
    </main>
  );
}
