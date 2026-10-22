"use server";
// สำรองข้อมูล (A26) — เจ้าของร้านเท่านั้น: สำรองตอนนี้, ตั้งจำนวนวันที่เก็บย้อนหลัง
import { redirect } from "next/navigation";
import { diffOf, logAdmin } from "@/lib/admin-log";
import { requireOwner } from "@/lib/auth";
import { runBackup } from "@/lib/backup";
import { prisma } from "@/lib/prisma";

export async function backupNow() {
  const admin = await requireOwner();
  const r = await runBackup(`${admin.displayName} (${admin.username})`);
  if (r.ok) {
    await logAdmin(admin.id, "BACKUP", `สำรองข้อมูลด้วยตนเอง ${r.key} (${(r.sizeBytes / 1024).toFixed(0)} KB, ${r.tables} ตาราง${r.expired ? `, ลบไฟล์เก่า ${r.expired}` : ""})`);
    redirect("/admin/backups?done=1");
  }
  if ("skipped" in r) redirect("/admin/backups?busy=1");
  await logAdmin(admin.id, "BACKUP", `สำรองข้อมูลไม่สำเร็จ: ${r.error}`);
  redirect("/admin/backups?failed=1");
}

export async function saveRetention(f: FormData) {
  const admin = await requireOwner();
  const days = Math.floor(Number(f.get("days")));
  if (!(days >= 1 && days <= 90)) redirect("/admin/backups?bad=1");
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { backupRetentionDays: true } });
  const diff = diffOf(s, { backupRetentionDays: days });
  if (diff) {
    await prisma.shopSetting.update({ where: { id: "shop" }, data: { backupRetentionDays: days } });
    await logAdmin(admin.id, "SETTINGS", `ตั้งเก็บสำรองข้อมูลย้อนหลัง ${days} วัน`, { entity: "ShopSetting", diff });
  }
  redirect("/admin/backups?saved=1");
}
