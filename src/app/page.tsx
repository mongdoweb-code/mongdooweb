// หน้าแรกชั่วคราว (ขั้นที่ 1) — แสดงหมวดหมู่จากฐานข้อมูลเพื่อยืนยันว่าต่อ DB ได้
// ขั้นที่ 2 จะย้าย HTML/CSS จาก prototype/mongdoweb-home.html มาแทน
import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

async function CategoryList() {
  await connection(); // อ่านข้อมูลจาก DB ทุกครั้งที่เปิดหน้า (ไม่ทำเป็นหน้า static ตอน build)
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, nameTh: true, nameEn: true },
  });

  return (
    <ul>
      {categories.map((c) => (
        <li key={c.id}>
          {c.nameTh} <span style={{ color: "var(--c-muted)" }}>({c.nameEn})</span>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "48px 16px" }}>
      <h1>มองดูเว็บ</h1>
      <p style={{ color: "var(--c-muted)" }}>กำลังพัฒนา — หมวดหมู่สินค้าจากฐานข้อมูล</p>
      <Suspense fallback={<p>กำลังโหลด…</p>}>
        <CategoryList />
      </Suspense>
    </main>
  );
}
