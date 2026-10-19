// หลังบ้าน: CSS จากต้นแบบ mongdoweb-admin.html — ทุกหน้าอ่าน session จาก cookie จึงไม่ทำเป็นหน้า static
import type { Metadata } from "next";
import "./admin.css";

export const instant = false;

export const metadata: Metadata = { title: "หลังร้าน — มองดูเว็บ", robots: { index: false, follow: false } };

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
