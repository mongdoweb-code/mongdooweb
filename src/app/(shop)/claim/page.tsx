// /claim — แจ้งเคลมประกัน (1 ปี) / ขอคืน-เปลี่ยนสินค้าเสียหายจากขนส่ง (7 วัน) — แทนการแจ้งเคลมทาง LINE/กล่องคำขอเดิม
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHead } from "../_components/PageHead";
import { ClaimForm } from "./ClaimForm";
import "../_lot11/lot11.css";

export const metadata: Metadata = {
  title: "แจ้งเคลม / คืนสินค้า — มองดูเว็บ",
  description: "แจ้งเคลมประกันสินค้า 1 ปี หรือขอคืน/เปลี่ยนสินค้าที่เสียหายจากการขนส่งภายใน 7 วัน ด้วยเลขที่คำสั่งซื้อและเบอร์โทร พร้อมแนบรูป",
  alternates: { canonical: "/claim" },
};

export default function ClaimPage() {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "แจ้งเคลม / คืนสินค้า" }]}
        eyebrow="บริการหลังการขาย"
        title="แจ้งเคลม / คืนสินค้า"
        sub="รับประกันสินค้า 1 ปีนับจากวันที่ชำระเงิน · สินค้าเสียหายจากการขนส่ง แจ้งคืน/เปลี่ยนได้ภายใน 7 วันหลังจัดส่ง"
      />
      <div className="container pg-body">
        <Suspense fallback={<p className="sec-sub">กำลังโหลด…</p>}>
          <ClaimForm />
        </Suspense>
      </div>
    </main>
  );
}
