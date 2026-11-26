// หน้าชำระเงินมีหัวเว็บและ CSS ของตัวเอง (ตามต้นแบบ) จึงแยกจากโครงหน้าร้าน · ธีมกลางวัน/กลางคืนใช้ค่าเดียวกับหน้าร้าน
import { SHOP_THEME_BOOT } from "@/lib/shop-theme";
import { getStorefrontExtras } from "@/lib/shop-public";
import { TypographyStyle } from "@/components/TypographyStyle";
import "./checkout.css";
import "../(shop)/shop-theme.css";
import "./checkout-dark.generated.css";

export default async function CheckoutLayout({ children }: LayoutProps<"/">) {
  // ตัวอักษรเดียวกับหน้าร้าน (ตั้งค่า → ตัวอักษร → หน้าร้าน)
  const extras = await getStorefrontExtras();
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SHOP_THEME_BOOT }} />
      <TypographyStyle css={extras.typoCss} url={extras.typoUrl} />
      {children}
    </>
  );
}
