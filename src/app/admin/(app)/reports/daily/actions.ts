"use server";
// ปิดยอดประจำวัน: บันทึกยอดที่ระบบคำนวณ ณ ตอนปิด + ยอดที่ตรวจกับบัญชีจริง (ถ้าไม่ตรง) · เปิดใหม่ได้เฉพาะเจ้าของร้าน
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { money, ymdBkk } from "@/lib/doc-calc";
import { dailyReceipts } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function closeDay(f: FormData) {
  const admin = await requireAdmin();
  const day = str(f, "day", 10);
  if (!ymdRe.test(day) || day > ymdBkk(new Date())) redirect("/admin/reports/daily?err=day");
  const r = await dailyReceipts(day);
  const raw = str(f, "counted", 20).replace(/[,\s฿]/g, "");
  const counted = raw === "" ? null : Math.round(Number(raw) * 100);
  if (counted !== null && !(Number.isFinite(counted) && counted >= 0)) redirect(`/admin/reports/daily?day=${day}&err=counted`);
  const note = str(f, "note", 500) || null;
  if (counted !== null && counted !== r.total && !note) redirect(`/admin/reports/daily?day=${day}&err=note`);
  const data = { totalSatang: r.total, countedSatang: counted === r.total ? null : counted, byMethod: r.byMethod, entryCount: r.entries.length, note, closedBy: admin.displayName, closedAt: new Date() };
  await prisma.dailyClose.upsert({ where: { day }, create: { day, ...data }, update: data });
  await logAdmin(admin.id, "ORDER", `ปิดยอดวันที่ ${day} · ระบบ ฿${money(r.total)}${counted !== null && counted !== r.total ? ` · ตรวจจริง ฿${money(counted)} (ต่าง ฿${money(counted - r.total)})` : " · ตรงกัน"}`);
  redirect(`/admin/reports/daily?day=${day}&closed=1`);
}

export async function reopenDay(f: FormData) {
  const admin = await requireOwner();
  const day = str(f, "day", 10);
  if (!ymdRe.test(day)) redirect("/admin/reports/daily");
  await prisma.dailyClose.deleteMany({ where: { day } });
  await logAdmin(admin.id, "ORDER", `เปิดปิดยอดวันที่ ${day} ใหม่`);
  redirect(`/admin/reports/daily?day=${day}`);
}
