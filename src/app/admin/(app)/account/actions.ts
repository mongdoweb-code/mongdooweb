"use server";
// บัญชีของฉัน: เปลี่ยนรหัสผ่าน (รวมกรณีถูกบังคับเปลี่ยน), ชื่อที่แสดง, ยืนยันตัวตน 2 ขั้น, อุปกรณ์ที่เข้าสู่ระบบ
import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { consumeBackupCode, consumeTotp, requireAdmin, revokeOtherSessions, revokeSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashBackupCode, newBackupCodes, newTotpSecret, passwordProblem } from "@/lib/totp";

export type AccountState = { ok?: string; error?: string; fields?: string[]; codes?: string[] };

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").slice(0, max);

async function checkPassword(adminId: string, pw: string) {
  const row = await prisma.admin.findUniqueOrThrow({ where: { id: adminId } });
  return { row, ok: !!pw && (await bcrypt.compare(pw, row.passwordHash)) };
}

export async function changePassword(_prev: AccountState, f: FormData): Promise<AccountState> {
  const admin = await requireAdmin({ allowPasswordChange: true });
  const current = str(f, "current");
  const next = str(f, "next", 300);
  const problem = passwordProblem(next, admin.username);
  if (problem) return { error: problem, fields: ["next"] };
  if (next !== str(f, "confirm", 300)) return { error: "ยืนยันรหัสผ่านใหม่ไม่ตรงกัน", fields: ["confirm"] };
  const { row, ok } = await checkPassword(admin.id, current);
  if (!ok) {
    await logAdmin(admin.id, "PASSWORD", "เปลี่ยนรหัสผ่านไม่สำเร็จ: รหัสผ่านปัจจุบันไม่ถูกต้อง");
    return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง", fields: ["current"] };
  }
  if (await bcrypt.compare(next, row.passwordHash)) return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม", fields: ["next"] };
  await prisma.admin.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false } });
  // เปลี่ยนรหัสแล้ว ตัดการเข้าสู่ระบบจากเครื่องอื่นทั้งหมด (เผื่อรหัสเดิมรั่ว)
  const cut = await revokeOtherSessions(admin);
  await logAdmin(admin.id, "PASSWORD", `เปลี่ยนรหัสผ่านของตัวเอง${admin.mustChangePassword ? " (ครั้งแรก/หลังรีเซ็ต)" : ""}${cut ? ` · ออกจากระบบเครื่องอื่น ${cut} เครื่อง` : ""}`);
  if (admin.mustChangePassword) redirect("/admin?pw=1");
  refresh();
  return { ok: `เปลี่ยนรหัสผ่านแล้ว${cut ? ` และออกจากระบบเครื่องอื่น ${cut} เครื่อง` : ""}` };
}

export async function updateProfile(_prev: AccountState, f: FormData): Promise<AccountState> {
  const admin = await requireAdmin();
  const name = str(f, "displayName", 80).trim();
  if (name.length < 2) return { error: "ชื่อที่แสดงต้องมีอย่างน้อย 2 ตัวอักษร", fields: ["displayName"] };
  await prisma.admin.update({ where: { id: admin.id }, data: { displayName: name } });
  await logAdmin(admin.id, "ADMIN_USER", `เปลี่ยนชื่อที่แสดงเป็น "${name}"`);
  refresh();
  return { ok: "บันทึกชื่อที่แสดงแล้ว" };
}

// ---------- ยืนยันตัวตน 2 ขั้น ----------

/** เริ่มตั้งค่า: สร้าง secret ใหม่ (ยังไม่เปิดใช้จนกว่าจะยืนยันรหัสจากแอปได้) */
export async function startTotp() {
  const admin = await requireAdmin();
  if (admin.totpEnabled) redirect("/admin/account");
  await prisma.admin.update({ where: { id: admin.id }, data: { totpSecret: newTotpSecret(), totpEnabled: false } });
  redirect("/admin/account#twofa");
}

export async function cancelTotp() {
  const admin = await requireAdmin();
  await prisma.admin.updateMany({ where: { id: admin.id, totpEnabled: false }, data: { totpSecret: null } });
  redirect("/admin/account#twofa");
}

export async function enableTotp(_prev: AccountState, f: FormData): Promise<AccountState> {
  const admin = await requireAdmin();
  const row = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
  if (row.totpEnabled) return { error: "เปิดใช้อยู่แล้ว" };
  if (!row.totpSecret) return { error: "กด \"เริ่มตั้งค่า\" ใหม่อีกครั้ง" };
  if (!(await consumeTotp(admin.id, row.totpSecret, str(f, "code", 10)))) return { error: "รหัสไม่ถูกต้อง — ตรวจว่าเวลาในโทรศัพท์ตั้งเป็นอัตโนมัติ แล้วกรอกรหัสล่าสุดจากแอป", fields: ["code"] };
  const codes = newBackupCodes();
  await prisma.admin.update({ where: { id: admin.id }, data: { totpEnabled: true, backupCodes: codes.map(hashBackupCode) } });
  await logAdmin(admin.id, "TWO_FACTOR", "เปิดใช้การยืนยันตัวตน 2 ขั้น");
  refresh();
  return { ok: "เปิดใช้การยืนยันตัวตน 2 ขั้นแล้ว — เก็บรหัสสำรองด้านล่างไว้ในที่ปลอดภัย", codes };
}

export async function regenerateBackupCodes(_prev: AccountState, f: FormData): Promise<AccountState> {
  const admin = await requireAdmin();
  const { row, ok } = await checkPassword(admin.id, str(f, "password"));
  if (!row.totpEnabled) return { error: "ยังไม่ได้เปิดใช้การยืนยันตัวตน 2 ขั้น" };
  if (!ok) return { error: "รหัสผ่านไม่ถูกต้อง", fields: ["password"] };
  const codes = newBackupCodes();
  await prisma.admin.update({ where: { id: admin.id }, data: { backupCodes: codes.map(hashBackupCode) } });
  await logAdmin(admin.id, "TWO_FACTOR", "สร้างรหัสสำรองชุดใหม่ (ชุดเดิมใช้ไม่ได้แล้ว)");
  refresh();
  return { ok: "สร้างรหัสสำรองชุดใหม่แล้ว — ชุดเดิมใช้ไม่ได้อีก", codes };
}

export async function disableTotp(_prev: AccountState, f: FormData): Promise<AccountState> {
  const admin = await requireAdmin();
  const { row, ok } = await checkPassword(admin.id, str(f, "password"));
  if (!row.totpEnabled || !row.totpSecret) return { error: "ยังไม่ได้เปิดใช้" };
  if (!ok) return { error: "รหัสผ่านไม่ถูกต้อง", fields: ["password"] };
  const code = str(f, "code", 20).trim();
  const valid = /^\d{6}$/.test(code) ? await consumeTotp(admin.id, row.totpSecret, code) : (await consumeBackupCode(admin.id, code)) !== null;
  if (!valid) return { error: "รหัสยืนยันไม่ถูกต้อง", fields: ["code"] };
  await prisma.admin.update({ where: { id: admin.id }, data: { totpEnabled: false, totpSecret: null, backupCodes: [] } });
  await logAdmin(admin.id, "TWO_FACTOR", "ปิดการยืนยันตัวตน 2 ขั้น");
  refresh();
  return { ok: "ปิดการยืนยันตัวตน 2 ขั้นแล้ว" };
}

// ---------- อุปกรณ์ที่เข้าสู่ระบบ ----------

export async function revokeMySession(f: FormData) {
  const admin = await requireAdmin({ allowPasswordChange: true });
  const key = str(f, "key", 20);
  if (key === admin.sessionKey) redirect("/admin/account?err=current#sessions");
  const s = await revokeSession(admin, key);
  redirect(`/admin/account?${s ? "revoked=1" : "err=notfound"}#sessions`);
}

export async function revokeMyOtherSessions() {
  const admin = await requireAdmin({ allowPasswordChange: true });
  const n = await revokeOtherSessions(admin);
  await logAdmin(admin.id, "SESSION_REVOKE", `ออกจากระบบทุกเครื่อง ยกเว้นเครื่องนี้ (${n} เครื่อง)`);
  redirect(`/admin/account?revoked=${n}#sessions`);
}
