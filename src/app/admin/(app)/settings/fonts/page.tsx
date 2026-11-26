// /admin/settings/fonts — ตัวอักษร (ฟอนต์) หลังบ้าน + หน้าร้าน (เจ้าของร้านเท่านั้น): ชุดสำเร็จรูป · ค่ารวม · ปรับแยกแต่ละส่วน · ตัวอย่างสด
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseTypography } from "@/lib/typography";
import { TypographyEditor } from "./TypographyEditor";

export default async function FontSettingsPage() {
  await requireOwner();
  const row = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { typography: true } });
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link back-btn" href="/admin/settings">← ตั้งค่าร้าน</Link></p>
          <h1>ตัวอักษร (ฟอนต์)</h1>
          <p>ใช้กับทั้งร้าน (ทุกคนเห็นเหมือนกัน) · ค่ารวม + ปรับแยกแต่ละส่วนได้ · ดูผลทันทีด้านขวา · เอกสารพิมพ์ A4 ใช้ฟอนต์เดิมเสมอ</p>
        </div>
      </div>
      <TypographyEditor init={parseTypography(row?.typography)} />
    </main>
  );
}
