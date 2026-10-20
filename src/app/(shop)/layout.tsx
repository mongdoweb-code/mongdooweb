// โครงหน้าร้าน: แถบประกาศ + ส่วนหัว + ตะกร้า (บน) และท้ายเว็บ + ปุ่มลอย + แบนเนอร์คุกกี้ (ล่าง)
// HTML/CSS/JS ย้ายมาจากต้นแบบแบบตรงๆ ก่อน (ขั้นต่อไปค่อยแยกเป็น React component)
import Script from "next/script";
import { getShopData, jsonForScript } from "@/lib/storefront";
import { getPublicShopInfo } from "@/lib/settings";
import { renderFooter } from "./_markup/footer";
import { SHELL_TOP } from "./_markup/shell";
import "./shop.css";
import "./pages.css";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const [data, info] = await Promise.all([getShopData(), getPublicShopInfo()]);
  return (
    <>
      {/* display: contents → wrapper ไม่สร้างกล่อง ทำให้ header ยัง sticky ตาม body เหมือนต้นแบบ */}
      <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: SHELL_TOP }} />
      {children}
      <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: renderFooter(info) }} />
      <script id="mdw-data" type="application/json" dangerouslySetInnerHTML={{ __html: jsonForScript(data) }} />
      <Script src="/js/shell.js" strategy="afterInteractive" />
    </>
  );
}
