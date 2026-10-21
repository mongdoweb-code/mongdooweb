// เกี่ยวกับเรา — เนื้อหาแก้ได้ในหลังบ้าน (Page "about")
import type { Metadata } from "next";
import { getPage } from "@/lib/content";
import { ContentPage, pageDescription } from "../_lot2/ContentPage";

export async function generateMetadata(): Promise<Metadata> {
  const [page, description] = await Promise.all([getPage("about"), pageDescription("about")]);
  return { title: `${page.title} — มองดูเว็บ`, description, alternates: { canonical: "/about" } };
}

export default function AboutPage() {
  return (
    <ContentPage slug="about" eyebrow="มองดูเว็บ">
      <p className="prose-cta">
        <a className="btn btn-primary" href="/products">ดูสินค้าทั้งหมด</a>
        <a className="btn btn-outline" href="/contact">ติดต่อเรา</a>
      </p>
    </ContentPage>
  );
}
