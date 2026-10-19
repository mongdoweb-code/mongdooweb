// ติดตามคำสั่งซื้อ / พัสดุ
import type { Metadata } from "next";
import { PageHead } from "../_components/PageHead";
import { TrackForm } from "./TrackForm";

export const metadata: Metadata = {
  title: "ติดตามคำสั่งซื้อ — มองดูเว็บ",
  description: "ตรวจสถานะคำสั่งซื้อและเลขพัสดุด้วยเลขที่คำสั่งซื้อและเบอร์โทร",
  alternates: { canonical: "/track" },
};

export default function TrackPage() {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "ติดตามคำสั่งซื้อ" }]}
        eyebrow="ช่วยเหลือ"
        title="ติดตามคำสั่งซื้อ"
        sub="กรอกเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่งซื้อ เพื่อดูสถานะการตรวจสลิปและเลขพัสดุ"
      />
      <div className="container pg-body">
        <TrackForm />
      </div>
    </main>
  );
}
