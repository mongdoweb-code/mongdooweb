"use server";
// ทดสอบเขียน/อ่านไฟล์ในที่เก็บไฟล์จริง (local หรือ S3) — เจ้าของร้านเท่านั้น
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireOwner } from "@/lib/auth";
import { storage } from "@/lib/storage";

export async function testStorageWrite() {
  const admin = await requireOwner();
  const t0 = Date.now();
  const now = new Date();
  const key = `system/healthcheck-${now.toISOString().slice(0, 10)}-${randomBytes(6).toString("hex")}.json`;
  const body = Buffer.from(JSON.stringify({ at: now.toISOString(), by: admin.username }));
  let result: string;
  try {
    await storage().put(key, body);
    const back = await storage().get(key);
    if (!back || !back.equals(body)) throw new Error("อ่านไฟล์กลับมาได้ไม่ตรงกับที่เขียน");
    result = `ok=${encodeURIComponent(`เขียนและอ่านไฟล์ทดสอบสำเร็จ (${Date.now() - t0} ms)`)}`;
    await logAdmin(admin.id, "SYSTEM", `ทดสอบเขียนไฟล์สำเร็จ (${process.env.STORAGE_DRIVER ?? "local"}, ${Date.now() - t0} ms)`);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    result = `err=${encodeURIComponent(`เขียนไฟล์ไม่สำเร็จ: ${msg}`)}`;
    await logAdmin(admin.id, "SYSTEM", `ทดสอบเขียนไฟล์ไม่สำเร็จ: ${msg}`);
  }
  redirect(`/admin/system?${result}`);
}
