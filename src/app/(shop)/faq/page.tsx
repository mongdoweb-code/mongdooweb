// คำถามที่พบบ่อย — จาก ShopSetting.faq ที่แก้ในหลังบ้าน + FAQPage JSON-LD · ไม่มีเนื้อหา = 404 (และเมนูถูกซ่อน)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageVars, plainText, renderBody } from "@/lib/content";
import { getPublicShopInfo } from "@/lib/settings";
import { getStorefrontExtras } from "@/lib/shop-public";
import { jsonForScript } from "@/lib/storefront";
import { PageHead } from "../_components/PageHead";

export async function generateMetadata(): Promise<Metadata> {
  const { faq } = await getStorefrontExtras();
  return {
    title: "คำถามที่พบบ่อย — มองดูเว็บ",
    description: faq.length
      ? `คำตอบเรื่อง${faq.slice(0, 3).map((f) => f.q.replace(/[?？]$/, "")).join(" · ")} และอื่นๆ จากร้านมองดูเว็บ`.slice(0, 155)
      : "คำถามที่พบบ่อยเกี่ยวกับการสั่งซื้อ การชำระเงิน การจัดส่ง และการรับประกันไฟ LED",
    alternates: { canonical: "/faq" },
    ...(faq.length ? {} : { robots: { index: false } }),
  };
}

export default async function FaqPage() {
  const [{ faq }, info] = await Promise.all([getStorefrontExtras(), getPublicShopInfo()]);
  if (!faq.length) notFound();
  const vars = pageVars(info);
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: plainText(f.a, vars) } })),
  };
  return (
    <main id="main" tabIndex={-1}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
      <PageHead crumbs={[{ label: "คำถามที่พบบ่อย" }]} eyebrow="ช่วยเหลือ" title="คำถามที่พบบ่อย" sub="รวมคำตอบเรื่องการเลือกไฟ การสั่งซื้อ การชำระเงิน และการรับประกัน" />
      <div className="container pg-body">
        <div className="faq-list">
          {faq.map((f, i) => (
            <details key={i} open={i === 0}>
              <summary>{f.q}</summary>
              <div className="faq-a" dangerouslySetInnerHTML={{ __html: renderBody(f.a, vars) }} />
            </details>
          ))}
        </div>
        <div className="faq-more">
          <span>ไม่พบคำตอบที่ต้องการ? ทีมงานยินดีช่วยเลือกสินค้าให้เหมาะกับงานของคุณ</span>
          <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">ถามทาง LINE</a>
            <a className="btn btn-outline" href="/contact">ส่งข้อความถึงร้าน</a>
          </span>
        </div>
      </div>
    </main>
  );
}
