"use server";
// บันทึกแถบเมนูด่วนของผู้ใช้ที่ล็อกอินอยู่ (แต่ละคนตั้งเอง) — ตรวจคีย์/สิทธิ์/จำนวนที่เซิร์ฟเวอร์อีกครั้ง
import { refresh } from "next/cache";
import { Prisma } from "../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QUICK_MAX, parseQuickMenu } from "@/lib/quick-menu";

export type QuickMenuResult = { ok?: string; error?: string };

/** keys = ลำดับเมนูที่เลือก · null = คืนค่าเริ่มต้น */
export async function saveQuickMenu(keys: string[] | null): Promise<QuickMenuResult> {
  const admin = await requireAdmin();
  const owner = admin.role === "OWNER";
  if (keys !== null && !Array.isArray(keys)) return { error: "ข้อมูลไม่ถูกต้อง" };
  if (keys && keys.length > QUICK_MAX) return { error: `เลือกได้สูงสุด ${QUICK_MAX} เมนู` };
  const clean = keys === null ? null : parseQuickMenu(keys, owner);
  await prisma.admin.update({ where: { id: admin.id }, data: { quickMenu: clean === null ? Prisma.DbNull : clean } });
  refresh(); // โหลดโครงหลังบ้านใหม่ → แถบเมนูด่วนเปลี่ยนทันที
  return { ok: clean === null ? "คืนค่าเริ่มต้นแล้ว" : "บันทึกเมนูด่วนแล้ว" };
}
