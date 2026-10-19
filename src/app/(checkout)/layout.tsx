// หน้าชำระเงินมีหัวเว็บและ CSS ของตัวเอง (ตามต้นแบบ) จึงแยกจากโครงหน้าร้าน
import "./checkout.css";

export default function CheckoutLayout({ children }: LayoutProps<"/">) {
  return children;
}
