// /admin/settings/login — ตั้งค่าหน้าเข้าสู่ระบบหลังบ้าน (เจ้าของร้านเท่านั้น): โซนการตลาด รูป ธีม ข้อความต้อนรับ หมวด/สินค้าแนะนำ
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { parseLoginPage } from "@/lib/login-page";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { LoginPageForm } from "./LoginPageForm";

export default async function LoginPageSettings() {
  await requireOwner();
  const row = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { loginPage: true } });
  const v = parseLoginPage(row?.loginPage);
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/settings">← ตั้งค่าร้าน</Link></p>
          <h1>หน้าเข้าสู่ระบบ</h1>
          <p>ซ้าย = โซนจูงใจ/การตลาด + แอนิเมชันแสง LED · ขวา = ต้อนรับ ฟอร์มเข้าสู่ระบบ หมวดและสินค้าแนะนำ — หน้านี้ใครก็เปิดได้ ใส่เฉพาะข้อมูลที่เผยแพร่ได้</p>
        </div>
      </div>
      <LoginPageForm v={v} images={v.images.map((k) => ({ key: k, url: mediaUrl(k, "sm")! }))} />
    </main>
  );
}
