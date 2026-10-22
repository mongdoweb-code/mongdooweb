"use server";
// ศูนย์แจ้งเตือน: ทำเครื่องหมายว่าอ่านแล้วทั้งหมด (ต่อผู้ใช้ — Admin.notifSeenAt)
import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";

export async function markAllReadAction() {
  const admin = await requireAdmin();
  await markAllRead(admin.id);
  refresh();
}
