// นโยบายความเป็นส่วนตัว (PDPA) — เนื้อหาแก้ได้ในหลังบ้าน (Page "privacy") · เจ้าของร้านควรให้ที่ปรึกษากฎหมายทบทวนเป็นระยะ
import type { Metadata } from "next";
import { getPage } from "@/lib/content";
import { ContentPage, pageDescription } from "../_lot2/ContentPage";

export async function generateMetadata(): Promise<Metadata> {
  const [page, description] = await Promise.all([getPage("privacy"), pageDescription("privacy")]);
  return { title: `${page.title} — มองดูเว็บ`, description, alternates: { canonical: "/privacy" } };
}

export default function PrivacyPage() {
  return <ContentPage slug="privacy" eyebrow="PDPA" showUpdated />;
}
