// หน้าชำระเงินมีหัวเว็บและ CSS ของตัวเอง (ตามต้นแบบ) จึงแยกจากโครงหน้าร้าน · ธีมกลางวัน/กลางคืนใช้ค่าเดียวกับหน้าร้าน
import { SHOP_THEME_BOOT } from "@/lib/shop-theme";
import "./checkout.css";
import "../(shop)/shop-theme.css";
import "./checkout-dark.generated.css";

export default function CheckoutLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SHOP_THEME_BOOT }} />
      {children}
    </>
  );
}
