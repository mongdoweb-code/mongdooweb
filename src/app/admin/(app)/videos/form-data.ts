// ข้อมูลประกอบฟอร์มคลิป (ใช้ทั้งหน้ารายการ/หน้าแก้ไข): รายการสินค้าให้ผูก · หัวข้อที่เคยใช้ + หัวข้อแนะนำ + ชื่อหมวดสินค้า
import "server-only";
import { prisma } from "@/lib/prisma";
import { VIDEO_TOPICS } from "@/lib/video-links";

export async function videoFormLists() {
  const [products, used, cats] = await Promise.all([
    prisma.product.findMany({ where: { isService: false }, orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, sku: true, name: true, isActive: true }, take: 5000 }),
    prisma.video.findMany({ where: { topic: { not: null } }, distinct: ["topic"], select: { topic: true } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { nameTh: true } }),
  ]);
  return {
    products: products.map((p) => ({ id: p.id, label: `${p.sku} · ${p.name}${p.isActive ? "" : " (ปิดขาย)"}` })),
    topics: [...new Set([...used.map((u) => u.topic!), ...VIDEO_TOPICS, ...cats.map((c) => c.nameTh)])],
  };
}

/** Date → "YYYY-MM-DDTHH:mm" เวลาไทย (ช่อง datetime-local) */
export const bkkInput = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 16) : "");
