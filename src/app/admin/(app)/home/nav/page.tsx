// /admin/home/nav — เมนูหลักหน้าร้าน (Navbar): เลือกเมนูที่แสดง เรียงลำดับ เปลี่ยนชื่อ เพิ่มลิงก์เอง เปิด/ปิดไอคอนด้านขวา
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { parseNavMenu } from "@/lib/nav-menu";
import { prisma } from "@/lib/prisma";
import { saveNavMenu } from "../actions";
import { NavEditor } from "./NavEditor";
import "./nav.css";

export const instant = false;

export default async function NavMenuPage() {
  await requireAdmin();
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { navMenu: true } });
  const raw = s?.navMenu;
  const custom = !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length > 0;
  return (
    <main className="main" id="page-nav">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/home">← หน้าแรกและความน่าเชื่อถือ</Link></p>
          <h1>เมนูหน้าร้าน (Navbar)</h1>
          <p>เลือกเมนูที่แสดงบนแถบด้านบนของหน้าร้าน เรียงลำดับ เปลี่ยนชื่อ เพิ่มลิงก์เอง และเปิด/ปิดไอคอนด้านขวา</p>
        </div>
        <div className="head-actions"><a className="btn btn-outline" href="/" target="_blank" rel="noopener">ดูหน้าร้าน</a></div>
      </div>
      <NavEditor initial={parseNavMenu(raw)} custom={custom} action={saveNavMenu} />
    </main>
  );
}
