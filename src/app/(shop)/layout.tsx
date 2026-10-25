// โครงหน้าร้าน: แถบประกาศ + ส่วนหัว + ตะกร้า (บน) และท้ายเว็บ + ปุ่มลอย + แบนเนอร์คุกกี้ (ล่าง)
// HTML/CSS/JS ย้ายมาจากต้นแบบแบบตรงๆ ก่อน (ขั้นต่อไปค่อยแยกเป็น React component)
import Script from "next/script";
import { getPublicShopInfo } from "@/lib/settings";
import { getStorefrontExtras } from "@/lib/shop-public";
import { getShopData, jsonForScript } from "@/lib/storefront";
import { renderFooter } from "./_markup/footer";
import { renderShellTop } from "./_markup/top";
import "./shop.css";
import "./pages.css";
import "./lot2.css";
import "./lot9.css";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const [data, info, extras] = await Promise.all([getShopData(), getPublicShopInfo(), getStorefrontExtras()]);
  const freeShipMinBaht = info.freeShipMinSatang != null ? info.freeShipMinSatang / 100 : null;
  const hasFaq = extras.faq.length > 0;
  // ค่าที่ตะกร้าใช้คำนวณค่าส่งโดยประมาณ (ขั้นค่าส่งชุดเดียวกับที่ server ใช้ตอนสั่งซื้อ)
  const shop = { tiers: info.tiers.map((t) => ({ min: t.minSatang / 100, fee: t.feeSatang / 100 })), freeShipMin: freeShipMinBaht };
  return (
    <>
      {!extras.announcement && <style>{":root{--tb-h:0px}"}</style>}
      {/* display: contents → wrapper ไม่สร้างกล่อง ทำให้ header ยัง sticky ตาม body เหมือนต้นแบบ */}
      <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: renderShellTop({ announcement: extras.announcement, freeShipMinBaht, hasFaq }) }} />
      {children}
      <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: renderFooter(info, { hasFaq }) }} />
      <script id="mdw-data" type="application/json" dangerouslySetInnerHTML={{ __html: jsonForScript(data) }} />
      <script id="mdw-shop" type="application/json" dangerouslySetInnerHTML={{ __html: jsonForScript(shop) }} />
      <script
        id="mdw-analytics"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: jsonForScript({ ga4: extras.ga4Id, pixel: extras.metaPixelId }) }}
      />
      <Script src="/js/analytics.js" strategy="afterInteractive" />
      <Script src="/js/shell.js" strategy="afterInteractive" />
    </>
  );
}
