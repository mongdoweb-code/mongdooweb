// การรับประกัน เคลม และการคืน/เปลี่ยนสินค้า — เนื้อหาแก้ได้ในหลังบ้าน (Page "warranty")
import type { Metadata } from "next";
import { getPage } from "@/lib/content";
import { ContentPage, pageDescription } from "../_lot2/ContentPage";

export async function generateMetadata(): Promise<Metadata> {
  const [page, description] = await Promise.all([getPage("warranty"), pageDescription("warranty")]);
  return { title: `${page.title} — มองดูเว็บ`, description, alternates: { canonical: "/warranty" } };
}

export default function WarrantyPage() {
  return (
    <ContentPage slug="warranty" eyebrow="ช่วยเหลือ" showUpdated>
      <p className="prose-cta">
        <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">แจ้งเคลมทาง LINE</a>
        <a className="btn btn-outline" href="/contact">ส่งข้อความถึงร้าน</a>
      </p>
    </ContentPage>
  );
}
