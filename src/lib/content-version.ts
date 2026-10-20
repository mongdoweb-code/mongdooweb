// เก็บสำเนาสไลด์/หมวดหมู่ทุกครั้งที่บันทึก (ContentVersion) เพื่อ "ย้อนกลับเป็นเวอร์ชันก่อนหน้า"
import "server-only";
import type { ContentKind } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";

const KEEP = 30;

export async function snapshot(kind: ContentKind, publishedBy: string) {
  const data =
    kind === "SLIDES"
      ? await prisma.heroSlide.findMany({ orderBy: { sortOrder: "asc" } })
      : await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  await prisma.contentVersion.create({ data: { kind, snapshot: JSON.parse(JSON.stringify(data)), publishedBy } });
  // เก็บแค่ 30 เวอร์ชันล่าสุด
  const old = await prisma.contentVersion.findMany({ where: { kind }, orderBy: { publishedAt: "desc" }, skip: KEEP, select: { id: true } });
  if (old.length) await prisma.contentVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

export async function listVersions(kind: ContentKind, take = 10) {
  return prisma.contentVersion.findMany({ where: { kind }, orderBy: { publishedAt: "desc" }, take, select: { id: true, publishedAt: true, publishedBy: true, snapshot: true } });
}

/** ก่อนแก้ครั้งแรก เก็บสภาพเดิมไว้ก่อน เพื่อให้ย้อนกลับไปค่าเริ่มต้นได้ */
export async function baseline(kind: ContentKind, by: string) {
  if (!(await prisma.contentVersion.count({ where: { kind } }))) await snapshot(kind, `${by} (ก่อนแก้ไข)`);
}
