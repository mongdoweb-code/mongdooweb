// วิธีสั่งซื้อและชำระเงิน — เนื้อหาแก้ได้ในหลังบ้าน (Page "how-to-order")
import type { Metadata } from "next";
import { getPage } from "@/lib/content";
import { ContentPage, pageDescription } from "../_lot2/ContentPage";

export async function generateMetadata(): Promise<Metadata> {
  const [page, description] = await Promise.all([getPage("how-to-order"), pageDescription("how-to-order")]);
  return { title: `${page.title} — มองดูเว็บ`, description, alternates: { canonical: "/how-to-order" } };
}

export default function HowToOrderPage() {
  return (
    <ContentPage slug="how-to-order" eyebrow="ช่วยเหลือ">
      <p className="prose-cta">
        <a className="btn btn-primary" href="/products">เริ่มเลือกสินค้า</a>
        <a className="btn btn-outline" href="/track">ติดตามคำสั่งซื้อ / แนบสลิป</a>
        <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">สั่งซื้อทาง LINE</a>
      </p>
    </ContentPage>
  );
}
