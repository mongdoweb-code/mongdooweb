"use server";
// บันทึกตัวอักษร (เจ้าของร้านเท่านั้น): ค่ารวม + ส่วนต่างๆ ของหลังบ้าน/หน้าร้าน → ShopSetting.typography
// ตรวจซ้ำด้วย parseTypography (ฟอนต์ต้องอยู่ในรายการ · สี/ขนาดถูกจำกัด) · ค่าเหมือนค่าเริ่มต้น = เก็บเป็นว่าง (หน้าตาเดิม)
import { refresh } from "next/cache";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDefaultScope, parseTypography, type Kind, type Scope } from "@/lib/typography";

export type TypoState = { ok?: string; error?: string; at?: number };

const brief = (s: Scope | null, k: Kind) => (isDefaultScope(s, k) ? "ค่าเดิม" : `${s!.base.thai}${s!.base.latin ? ` + ${s!.base.latin}` : ""} ${s!.base.size}px · ปรับแยก ${Object.keys(s!.areas).length} ส่วน`);

export async function saveTypography(_: TypoState, f: FormData): Promise<TypoState> {
  const admin = await requireOwner();
  const raw = String(f.get("typography") ?? "");
  if (raw.length > 20000) return { error: "ข้อมูลยาวเกินไป" };
  const t = parseTypography(raw);
  const store = {
    ...(isDefaultScope(t.admin, "admin") ? {} : { admin: t.admin }),
    ...(isDefaultScope(t.shop, "shop") ? {} : { shop: t.shop }),
  };
  const before = parseTypography((await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { typography: true } }))?.typography);
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { typography: store } });
  await logAdmin(admin.id, "SETTINGS", `ตัวอักษร: หลังบ้าน ${brief(before.admin, "admin")} → ${brief(t.admin, "admin")} · หน้าร้าน ${brief(before.shop, "shop")} → ${brief(t.shop, "shop")}`);
  refreshStorefront();
  refresh();
  return { ok: "บันทึกตัวอักษรแล้ว — หลังบ้านและหน้าร้านใช้ค่าใหม่ทันที", at: Date.now() };
}
