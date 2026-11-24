// คลังข้อความแจ้งเตือนหน้าสินค้าจากฐานข้อมูล (ฝั่ง server) — กฎการแสดงอยู่ใน src/lib/notices.ts
import { prisma } from "@/lib/prisma";
import type { NoticeRow } from "@/lib/notices";

export async function getNoticeLibrary(): Promise<NoticeRow[]> {
  const rows = await prisma.productNotice.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((n) => ({
    id: n.id, name: n.name, text: n.text, tone: n.tone, icon: n.icon, scope: n.scope,
    categoryIds: n.categoryIds, skipAccessory: n.skipAccessory, isActive: n.isActive, sortOrder: n.sortOrder,
  }));
}
