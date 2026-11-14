// หลังบ้าน: CSS จากต้นแบบ mongdoweb-admin.html — ทุกหน้าอ่าน session จาก cookie จึงไม่ทำเป็นหน้า static
import type { Metadata } from "next";
import "./admin.css";
import "./admin-theme.css";
import "./admin-dark.generated.css";

export const instant = false;

export const metadata: Metadata = { title: "หลังร้าน — มองดูเว็บ", robots: { index: false, follow: false } };

// ตั้งธีมก่อนหน้าแสดง (ไม่กะพริบ): คุกกี้ mdw_admin_theme = light | dark | system (ค่าเริ่มต้น) · หน้าพิมพ์สว่างเสมอ
const THEME_BOOT = `(function(){try{var h=document.documentElement;if(location.pathname.indexOf("/admin/print")===0){h.removeAttribute("data-adm-theme");return}var m=(document.cookie.match(/(?:^|; )mdw_admin_theme=(light|dark|system)/)||[])[1]||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);h.setAttribute("data-adm-theme",d?"dark":"light");h.setAttribute("data-adm-mode",m)}catch(e){}})()`;

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      {children}
    </>
  );
}
