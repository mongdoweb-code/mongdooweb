// ไม่พบหน้า/สินค้า (เช่น หมวดหรือสินค้าที่ถูกปิด) — แสดงในโครงหน้าร้าน
import { Suspense } from "react";
import { PageHead } from "./_components/PageHead";
import { NotFoundLog } from "./_lot10/NotFoundLog";

export default function ShopNotFound() {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "ไม่พบหน้า" }]} title="ไม่พบหน้าที่คุณต้องการ" />
      <div className="container pg-body">
        <div className="pg-empty">
          <b>สินค้าหรือหน้านี้อาจถูกย้ายหรือปิดการขายแล้ว</b>
          <p style={{ marginTop: 18 }}>
            <a className="btn btn-primary" href="/products">
              ดูสินค้าทั้งหมด
            </a>{" "}
            <a className="btn btn-outline" href="/#finder">
              ให้เราช่วยเลือกไฟ
            </a>
          </p>
        </div>
      </div>
      <Suspense fallback={null}>
        <NotFoundLog />
      </Suspense>
    </main>
  );
}
