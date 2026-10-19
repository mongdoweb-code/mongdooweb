// หน้าชำระเงิน — ชั่วคราว จนกว่าจะย้ายต้นแบบ checkout + API คำสั่งซื้อในขั้นที่ 3
import type { Metadata } from "next";
import { PageHead } from "../_components/PageHead";

export const metadata: Metadata = { title: "ชำระเงิน — มองดูเว็บ", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "ชำระเงิน" }]} title="ชำระเงิน" />
      <div className="container pg-body">
        <div className="pg-empty">
          <b>ระบบสั่งซื้อออนไลน์กำลังจะเปิดให้บริการ</b>
          ระหว่างนี้สั่งซื้อหรือขอใบเสนอราคาได้ทาง LINE — สินค้าในตะกร้ายังเก็บไว้ให้
          <p style={{ marginTop: 18 }}>
            <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">
              สั่งซื้อทาง LINE
            </a>{" "}
            <a className="btn btn-outline" href="/#cart">
              กลับไปที่ตะกร้า
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
