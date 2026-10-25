// /wishlist — รายการโปรด (U7): เก็บในเครื่อง แชร์ลิงก์ได้ ส่งให้ร้านทาง LINE หรือขอใบเสนอราคา
import type { Metadata } from "next";
import { getPublicShopInfo } from "@/lib/settings";
import { lineMessageUrl } from "@/lib/storefront";
import { PageHead } from "../_components/PageHead";
import { WishlistClient } from "./WishlistClient";

export const metadata: Metadata = {
  title: "รายการโปรด — มองดูเว็บ",
  description: "สินค้าที่คุณเก็บไว้ดูภายหลัง แชร์ลิงก์ให้ทีมงานหรือส่งให้ร้านทาง LINE เพื่อขอใบเสนอราคาได้",
  alternates: { canonical: "/wishlist" },
  robots: { index: false, follow: true },
};

export default async function WishlistPage() {
  const info = await getPublicShopInfo();
  // ลิงก์แชท LINE ของร้าน (ข้อความรายการสินค้าต่อท้ายฝั่งเบราว์เซอร์)
  const lineBase = lineMessageUrl(info.lineId, "", info.lineUrl);
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "รายการโปรด" }]}
        selfHref="/wishlist"
        eyebrow="เก็บไว้ในเครื่องของคุณ"
        title="รายการโปรด"
        sub="ไม่ต้องสมัครสมาชิก · แชร์ลิงก์ให้ทีมงาน หรือส่งรายการให้ร้านทาง LINE เพื่อขอใบเสนอราคา"
      />
      <div className="container pg-body">
        <WishlistClient lineBase={lineBase} />
      </div>
    </main>
  );
}
