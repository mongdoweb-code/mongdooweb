// ติดตามคำสั่งซื้อ / พัสดุ / ใบเสร็จ (ยืนยันด้วยเลขที่คำสั่งซื้อ + เบอร์โทร)
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHead } from "../_components/PageHead";
import { TrackForm } from "./TrackForm";
import "../_lot11/lot11.css";

export const metadata: Metadata = {
  title: "ติดตามคำสั่งซื้อ — มองดูเว็บ",
  description: "ตรวจสถานะคำสั่งซื้อ เลขพัสดุ แนบสลิป และดาวน์โหลดใบเสร็จ ด้วยเลขที่คำสั่งซื้อและเบอร์โทร",
  alternates: { canonical: "/track" },
};

export default function TrackPage() {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "ติดตามคำสั่งซื้อ" }]}
        eyebrow="ช่วยเหลือ"
        title="ติดตามคำสั่งซื้อ"
        sub="กรอกเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่งซื้อ เพื่อดูสถานะ เลขพัสดุ แนบสลิป และดาวน์โหลดใบเสร็จ"
      />
      <div className="container pg-body">
        <Suspense fallback={<p className="sec-sub">กำลังโหลด…</p>}>
          <TrackForm />
        </Suspense>
      </div>
    </main>
  );
}
