// ข้อมูลประกอบฟอร์มข้อความแจ้งเตือน: หมวด + รายการสินค้าทั้งหมด (สำหรับติ๊กเลือก)
import { prisma } from "@/lib/prisma";

export async function noticeFormLists() {
  const [cats, prods] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true } }),
    prisma.product.findMany({ where: { isService: false }, orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }], select: { id: true, sku: true, name: true, categoryId: true, isAccessory: true, noticeIds: true } }),
  ]);
  return {
    categories: cats.map((c) => ({ id: c.id, name: c.nameTh })),
    products: prods.map((p) => ({ id: p.id, label: `${p.sku} · ${p.name}`, catId: p.categoryId, acc: p.isAccessory })),
    raw: prods,
  };
}
