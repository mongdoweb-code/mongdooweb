"use server";
// คลังข้อความแจ้งเตือนหน้าสินค้า (/admin/notices + สร้างด่วนในหน้าแก้ไขสินค้า)
// บันทึก (ตรวจที่ server ด้วย cleanNotice) · เลือกสินค้าที่ใช้ข้อความ (เฉพาะ "เลือกเอง") · เปิด/ปิด · ลากเรียง · ลบ (ถอดออกจากทุกสินค้า)
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { cleanNotice, type NoticeInput, type NoticeRow } from "@/lib/notices";
import { prisma } from "@/lib/prisma";

export type NoticeResult = { ok?: string; error?: string; fields?: string[]; notice?: NoticeRow };
export type NoticePayload = NoticeInput & { id?: string; productIds?: string[] };

const toRow = (n: Awaited<ReturnType<typeof prisma.productNotice.create>>): NoticeRow => ({
  id: n.id, name: n.name, text: n.text, tone: n.tone, icon: n.icon, scope: n.scope,
  categoryIds: n.categoryIds, skipAccessory: n.skipAccessory, isActive: n.isActive, sortOrder: n.sortOrder,
});

export async function saveNotice(p: NoticePayload): Promise<NoticeResult> {
  const admin = await requireAdmin();
  if (!p || typeof p !== "object") return { error: "ข้อมูลไม่ถูกต้อง ลองโหลดหน้าใหม่" };
  const id = typeof p.id === "string" ? p.id.slice(0, 40) : "";
  const old = id ? await prisma.productNotice.findUnique({ where: { id } }) : null;
  if (id && !old) return { error: "ไม่พบข้อความนี้ (อาจถูกลบไปแล้ว)" };
  const cats = new Set((await prisma.category.findMany({ select: { id: true } })).map((c) => c.id));
  const r = cleanNotice(p, cats);
  if (!r.data) return { error: r.error, fields: r.fields };
  const data = r.data;

  const saved = await prisma.$transaction(async (tx) => {
    const n = old
      ? await tx.productNotice.update({ where: { id: old.id }, data })
      : await tx.productNotice.create({ data: { ...data, sortOrder: ((await tx.productNotice.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 10 } });
    // เลือกสินค้าที่ใช้ข้อความนี้ (ส่งมาจากหน้าคลังเท่านั้น) — เพิ่มให้ตัวที่ติ๊ก · ถอดจากตัวที่ไม่ติ๊ก
    if (Array.isArray(p.productIds)) {
      const ids = [...new Set(p.productIds.filter((x): x is string => typeof x === "string"))].slice(0, 5000);
      await tx.$executeRaw`UPDATE "Product" SET "noticeIds" = array_remove("noticeIds", ${n.id}) WHERE ${n.id} = ANY("noticeIds") AND NOT ("id" = ANY(${ids}::text[]))`;
      await tx.$executeRaw`UPDATE "Product" SET "noticeIds" = array_append("noticeIds", ${n.id}) WHERE "id" = ANY(${ids}::text[]) AND NOT (${n.id} = ANY("noticeIds"))`;
    }
    return n;
  });
  await logAdmin(admin.id, "NOTICE", `${old ? "แก้ไข" : "เพิ่ม"}ข้อความแจ้งเตือน: ${saved.name}`, { entity: `ProductNotice:${saved.id}` });
  refreshStorefront();
  return { ok: old ? "บันทึกแล้ว — หน้าสินค้าเปลี่ยนทันที" : "เพิ่มข้อความแล้ว", notice: toRow(saved) };
}

/** เปิด/ปิดใช้งาน (ปุ่มในตาราง) */
export async function toggleNotice(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id") ?? "").slice(0, 40);
  const n = await prisma.productNotice.findUnique({ where: { id }, select: { name: true, isActive: true } });
  if (!n) return;
  await prisma.productNotice.update({ where: { id }, data: { isActive: !n.isActive } });
  await logAdmin(admin.id, "NOTICE", `${n.isActive ? "ปิด" : "เปิด"}ใช้งานข้อความ: ${n.name}`, { entity: `ProductNotice:${id}` });
  refreshStorefront();
  refresh();
}

/** ลบข้อความ + ถอดออกจากสินค้าทุกตัว */
export async function deleteNotice(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id") ?? "").slice(0, 40);
  const n = await prisma.productNotice.findUnique({ where: { id } });
  if (!n) redirect("/admin/notices");
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Product" SET "noticeIds" = array_remove("noticeIds", ${id}), "noticeOff" = array_remove("noticeOff", ${id}) WHERE ${id} = ANY("noticeIds") OR ${id} = ANY("noticeOff")`,
    prisma.productNotice.delete({ where: { id } }),
  ]);
  await logAdmin(admin.id, "NOTICE", `ลบข้อความแจ้งเตือน: ${n.name}`, { entity: `ProductNotice:${id}` });
  refreshStorefront();
  redirect("/admin/notices?deleted=1");
}

/** ลากเรียง = ลำดับที่แสดงในหน้าสินค้า */
export async function saveNoticeOrder(ids: string[]): Promise<{ ok?: string; error?: string }> {
  const admin = await requireAdmin();
  const all = await prisma.productNotice.findMany({ select: { id: true } });
  if (!Array.isArray(ids) || ids.length !== all.length || new Set(ids).size !== ids.length || !all.every((n) => ids.includes(n.id)))
    return { error: "รายการเปลี่ยนไประหว่างลาก — รีเฟรชหน้าแล้วลองใหม่" };
  await prisma.$transaction(ids.map((id, k) => prisma.productNotice.update({ where: { id }, data: { sortOrder: (k + 1) * 10 } })));
  await logAdmin(admin.id, "NOTICE", "จัดลำดับข้อความแจ้งเตือนใหม่ (ลากวาง)");
  refreshStorefront();
  return { ok: "บันทึกลำดับแล้ว — หน้าสินค้าแสดงตามลำดับนี้" };
}
