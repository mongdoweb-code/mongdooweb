// หน้าแรก — เนื้อหาย้ายมาจาก prototype/mongdoweb-home.html, สไลด์มาจากฐานข้อมูล
import type { Metadata } from "next";
import Script from "next/script";
import { getHomeSlides, jsonForScript } from "@/lib/storefront";
import { HOME_MAIN } from "./_markup/home";

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

// TODO: logo และเบอร์โทรใน contactPoint ใส่ค่าจริงก่อนขึ้นระบบ
const ORG_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "/#org",
      name: "มองดูเว็บ",
      alternateName: "MongdoWeb",
      url: "/",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        areaServed: "TH",
        availableLanguage: ["th"],
        email: "contact@mongdoweb.com",
      },
    },
    {
      "@type": "WebSite",
      "@id": "/#website",
      url: "/",
      name: "มองดูเว็บ",
      inLanguage: "th-TH",
      publisher: { "@id": "/#org" },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: "/search?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default async function Home() {
  const slides = await getHomeSlides();
  return (
    <>
      <main id="main" tabIndex={-1} dangerouslySetInnerHTML={{ __html: HOME_MAIN }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ORG_LD) }} />
      <script id="mdw-slides" type="application/json" dangerouslySetInnerHTML={{ __html: jsonForScript(slides) }} />
      <Script src="/js/home.js" strategy="afterInteractive" />
    </>
  );
}
