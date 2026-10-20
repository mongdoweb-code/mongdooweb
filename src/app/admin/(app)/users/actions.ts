"use server";
// จัดการผู้ใช้หลังบ้าน (เจ้าของร้านเท่านั้น): เพิ่มผู้ใช้, เปลี่ยนสิทธิ์/ปิดบัญชี, รีเซ็ตรหัสผ่าน (รหัสชั่วคราว + บังคับเปลี่ยน),
// ล้างการยืนยันตัวตน 2 ขั้น (กรณีโทรศัพท์หาย), ออกจากระบบอุปกรณ์ของผู้ใช้
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireOwner, revokeOtherSessions, revokeSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { passwordProblem } from "@/lib/totp";

export type UserState = { ok?: string; error?: string; fields?: string[]; temp?: { username: string; password: string } };

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

/** รหัสผ่านชั่วคราว 12 ตัว อ่านง่าย (ไม่มี 0/O/1/l) — ผู้ใช้ต้องเปลี่ยนตอนเข้าสู่ระบบครั้งแรก */
function tempPassword() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (b) => abc[b % abc.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

async function ownersLeft(exceptId: string) {
  return prisma.admin.count({ where: { role: "OWNER", isActive: true, id: { not: exceptId } } });
}

export async function createUser(_prev: UserState, f: FormData): Promise<UserState> {
  const me = await requireOwner();
  const username = str(f, "username", 40).toLowerCase();
  const displayName = str(f, "displayName", 80);
  const role = f.get("role") === "OWNER" ? "OWNER" : "STAFF";
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: "ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - อย่างน้อย 3 ตัว", fields: ["username"] };
  if (await prisma.admin.findUnique({ where: { username } })) return { error: "มีชื่อผู้ใช้นี้แล้ว", fields: ["username"] };
  let password = String(f.get("password") ?? "");
  const generated = !password;
  if (generated) password = tempPassword();
  else {
    const p = passwordProblem(password, username);
    if (p) return { error: p, fields: ["password"] };
  }
  await prisma.admin.create({
    data: { username, displayName: displayName || username, role, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true },
  });
  await logAdmin(me.id, "ADMIN_USER", `เพิ่มผู้ใช้ ${username} (${role === "OWNER" ? "เจ้าของร้าน" : "พนักงาน"}) — ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก`);
  refresh();
  return { ok: `เพิ่มผู้ใช้ ${username} แล้ว`, temp: generated ? { username, password } : undefined };
}

export async function updateUser(_prev: UserState, f: FormData): Promise<UserState> {
  const me = await requireOwner();
  const id = str(f, "id", 40);
  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) return { error: "ไม่พบผู้ใช้" };
  const role = f.get("role") === "OWNER" ? "OWNER" : "STAFF";
  const isActive = f.get("isActive") === "on";
  const displayName = str(f, "displayName", 80) || target.displayName;
  if (id === me.id && (!isActive || role !== "OWNER")) return { error: "ปิดบัญชีหรือลดสิทธิ์ของตัวเองไม่ได้" };
  if (target.role === "OWNER" && (role !== "OWNER" || !isActive) && (await ownersLeft(id)) === 0) return { error: "ต้องมีเจ้าของร้านที่ใช้งานได้อย่างน้อย 1 บัญชี" };
  await prisma.admin.update({ where: { id }, data: { role, isActive, displayName } });
  if (!isActive) await prisma.adminSession.deleteMany({ where: { adminId: id } });
  const changes = [
    role !== target.role && `สิทธิ์ ${target.role} → ${role}`,
    isActive !== target.isActive && (isActive ? "เปิดบัญชี" : "ปิดบัญชี (ออกจากระบบทุกเครื่อง)"),
    displayName !== target.displayName && `ชื่อ "${displayName}"`,
  ].filter(Boolean);
  if (changes.length) await logAdmin(me.id, "ADMIN_USER", `แก้ไขผู้ใช้ ${target.username}: ${changes.join(", ")}`);
  refresh();
  return { ok: changes.length ? `บันทึก ${target.username} แล้ว` : "ไม่มีการเปลี่ยนแปลง" };
}

export async function resetPassword(_prev: UserState, f: FormData): Promise<UserState> {
  const me = await requireOwner();
  const target = await prisma.admin.findUnique({ where: { id: str(f, "id", 40) } });
  if (!target) return { error: "ไม่พบผู้ใช้" };
  if (target.id === me.id) return { error: "เปลี่ยนรหัสผ่านของตัวเองที่หน้า \"บัญชีของฉัน\"" };
  const password = tempPassword();
  await prisma.admin.update({ where: { id: target.id }, data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true } });
  const { count } = await prisma.adminSession.deleteMany({ where: { adminId: target.id } });
  await prisma.loginThrottle.deleteMany({ where: { key: `user:${target.username}` } });
  await logAdmin(me.id, "PASSWORD", `รีเซ็ตรหัสผ่านของ ${target.username} (รหัสชั่วคราว, ต้องเปลี่ยนเมื่อเข้าสู่ระบบ${count ? `, ออกจากระบบ ${count} เครื่อง` : ""})`);
  refresh();
  return { ok: `รีเซ็ตรหัสผ่านของ ${target.username} แล้ว`, temp: { username: target.username, password } };
}

export async function resetTwoFactor(_prev: UserState, f: FormData): Promise<UserState> {
  const me = await requireOwner();
  const target = await prisma.admin.findUnique({ where: { id: str(f, "id", 40) } });
  if (!target) return { error: "ไม่พบผู้ใช้" };
  if (target.id === me.id) return { error: "ปิด 2FA ของตัวเองที่หน้า \"บัญชีของฉัน\"" };
  await prisma.admin.update({ where: { id: target.id }, data: { totpEnabled: false, totpSecret: null, backupCodes: [] } });
  await prisma.adminSession.deleteMany({ where: { adminId: target.id } });
  await logAdmin(me.id, "TWO_FACTOR", `ล้างการยืนยันตัวตน 2 ขั้นของ ${target.username} (เช่น โทรศัพท์หาย) และออกจากระบบทุกเครื่อง`);
  refresh();
  return { ok: `ปิด 2FA ของ ${target.username} แล้ว — ให้ผู้ใช้ตั้งค่าใหม่ที่หน้า "บัญชีของฉัน"` };
}

export async function revokeUserSession(f: FormData) {
  const me = await requireOwner();
  const s = await revokeSession(me, str(f, "key", 20));
  redirect(`/admin/users?${s ? "revoked=1" : "err=notfound"}#sessions`);
}

export async function revokeAllOfUser(f: FormData) {
  const me = await requireOwner();
  const target = await prisma.admin.findUnique({ where: { id: str(f, "id", 40) } });
  if (!target) redirect("/admin/users");
  const n = await revokeOtherSessions(me, target.id);
  await logAdmin(me.id, "SESSION_REVOKE", `ออกจากระบบทุกเครื่องของ ${target.username} (${n} เครื่อง)`);
  redirect(`/admin/users?revoked=${n}#sessions`);
}
