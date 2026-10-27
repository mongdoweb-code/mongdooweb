// หน้าแรก — เนื้อหาย้ายมาจาก prototype/mongdoweb-home.html, สไลด์มาจากฐานข้อมูล
// ลำดับส่วน/ซ่อนส่วน + ความน่าเชื่อถือ ผลงาน บทความ ตั้งได้ที่ /admin/home (_lot10/HomeSections.tsx)
import type { Metadata } from "next";
import Script from "next/script";
import { getPublicShopInfo } from "@/lib/settings";
import { getHomeSlides, jsonForScript } from "@/lib/storefront";
import { HomeSections } from "./_lot10/HomeSections";

const OG_IMAGE =
  "https://images.unsplash.com/photo-1517384084767-6bc118943770?auto=format&fit=crop&w=1200&h=630&q=75";

export const metadata: Metadata = {
  title: "มองดูเว็บ — ไฟ LED สระว่ายน้ำ น้ำพุ และภายนอกอาคาร",
  description:
    "ร้านมองดูเว็บ จำหน่ายไฟ LED ใต้น้ำ ไฟสระว่ายน้ำ ไฟน้ำพุ ไฟสนาม และไฟส่องอาคาร กันน้ำ IP67/IP68 รับประกันสินค้า",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "มองดูเว็บ",
    locale: "th_TH",
    url: "/",
    title: "มองดูเว็บ — ไฟ LED สระว่ายน้ำ น้ำพุ และภายนอกอาคาร",
    description: "ไฟใต้น้ำ ไฟสระว่ายน้ำ ไฟน้ำพุ ไฟสวน และไฟส่องอาคาร กันน้ำ IP67–IP68 ใช้ไฟ DC12V ปลอดภัย ส่งไว 2–3 วัน",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "แสงสะท้อนบนผิวน้ำสระว่ายน้ำสีฟ้า" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "มองดูเว็บ — ไฟ LED สระว่ายน้ำ น้ำพุ และภายนอกอาคาร",
    description: "ไฟใต้น้ำ ไฟสระว่ายน้ำ ไฟน้ำพุ ไฟสวน และไฟส่องอาคาร กันน้ำ IP67–IP68 ใช้ไฟ DC12V ปลอดภัย",
    images: [OG_IMAGE],
  },
};

/** ข้อมูลร้านสำหรับ Google (Organization + ช่องค้นหาในผลการค้นหา) — URL ต้องเป็นแบบเต็ม */
function orgLd(info: Awaited<ReturnType<typeof getPublicShopInfo>>) {
  const base = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const tel = info.phone.replace(/\D/g, "");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#org`,
        name: info.name,
        alternateName: "MongdoWeb",
        url: `${base}/`,
        logo: `${base}/img/doc-logo.png`,
        sameAs: [info.lineUrl, info.facebookUrl, info.youtubeUrl, info.tiktokUrl].filter(Boolean),
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer service",
          areaServed: "TH",
          availableLanguage: ["th"],
          ...(tel ? { telephone: `+66-${tel.replace(/^0/, "")}` } : {}),
          ...(info.email ? { email: info.email } : {}),
        },
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: `${base}/`,
        name: info.name,
        inLanguage: "th-TH",
        publisher: { "@id": `${base}/#org` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${base}/search?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export default async function Home() {
  const [slides, info] = await Promise.all([getHomeSlides(), getPublicShopInfo()]);
  return (
    <>
      <main id="main" tabIndex={-1}>
        <HomeSections />
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(orgLd(info)) }} />
      <script id="mdw-slides" type="application/json" dangerouslySetInnerHTML={{ __html: jsonForScript(slides) }} />
      <Script src="/js/home.js" strategy="afterInteractive" />
    </>
  );
}
