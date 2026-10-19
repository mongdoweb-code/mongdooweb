// ระบบล็อกอินหลังบ้าน
// - รหัสผ่านเก็บเป็น bcrypt hash
// - session: cookie httpOnly เก็บ token สุ่ม, ฐานข้อมูลเก็บแค่ SHA-256 ของ token (ขโมยฐานข้อมูลไปก็ใช้ล็อกอินไม่ได้)
// - ไม่มีการใช้งานเกิน 30 นาที = หมดอายุ (ตรวจฝั่ง server), อายุสูงสุด 12 ชั่วโมง
// - ใส่รหัสผิดครบ 5 ครั้งต่อชื่อผู้ใช้ (หรือ 20 ครั้งต่อ IP) → ล็อก 15 นาที และบันทึก AdminLog
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "mdw_admin";
export const IDLE_MS = 30 * 60e3;
const MAX_AGE_MS = 12 * 60 * 60e3;
const USER_MAX_FAILS = 5;
const IP_MAX_FAILS = 20;
const LOCK_MS = 15 * 60e3;
// hash จำลองไว้เทียบเมื่อไม่พบชื่อผู้ใช้ ให้ใช้เวลาเท่ากัน (ไม่บอกใบ้ว่าชื่อผู้ใช้มีอยู่จริง)
const DUMMY_HASH = "$2b$12$0ylv2mguFdWCzmUAJRl73uy0Y0QbAFZu8BoGdHNMD/eJ2mbI7vgXO";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local",
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export type CurrentAdmin = { id: string; username: string; displayName: string; role: "OWNER" | "STAFF" };

// ---------- ล็อกอิน ----------

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; triesLeft: number }
  | { ok: false; reason: "locked"; until: Date };

async function lockedUntil(keys: string[]) {
  const rows = await prisma.loginThrottle.findMany({ where: { key: { in: keys }, lockUntil: { gt: new Date() } } });
  return rows.reduce<Date | null>((m, r) => (r.lockUntil && (!m || r.lockUntil > m) ? r.lockUntil : m), null);
}

async function addFail(key: string, max: number) {
  const row = await prisma.loginThrottle.upsert({
    where: { key },
    create: { key, fails: 1 },
    update: { fails: { increment: 1 } },
  });
  if (row.fails >= max) {
    const until = new Date(Date.now() + LOCK_MS);
    await prisma.loginThrottle.update({ where: { key }, data: { fails: 0, lockUntil: until } });
    return { fails: row.fails, until };
  }
  return { fails: row.fails, until: null };
}

export async function login(usernameRaw: string, password: string): Promise<LoginResult> {
  const username = usernameRaw.trim().toLowerCase().slice(0, 60);
  const { ip, userAgent } = await requestMeta();
  const userKey = `user:${username}`;
  const ipKey = `ip:${ip}`;

  const locked = await lockedUntil([userKey, ipKey]);
  if (locked) return { ok: false, reason: "locked", until: locked };

  const admin = await prisma.admin.findUnique({ where: { username } });
  const valid = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !admin.isActive || !valid) {
    const u = await addFail(userKey, USER_MAX_FAILS);
    const i = await addFail(ipKey, IP_MAX_FAILS);
    const until = u.until ?? i.until;
    await prisma.adminLog.create({
      data: {
        type: until ? "LOCKOUT" : "LOGIN_FAIL",
        note: until
          ? `ล็อกการเข้าสู่ระบบ 15 นาที (ชื่อผู้ใช้ "${username}", IP ${ip})`
          : `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ชื่อผู้ใช้ "${username}", IP ${ip})`,
      },
    });
    if (until) return { ok: false, reason: "locked", until };
    return { ok: false, reason: "invalid", triesLeft: Math.max(0, USER_MAX_FAILS - u.fails) };
  }

  await prisma.loginThrottle.deleteMany({ where: { key: userKey } });
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await prisma.$transaction([
    prisma.adminSession.create({
      data: { id: sha256(token), adminId: admin.id, expiresAt: new Date(now + MAX_AGE_MS), ip, userAgent },
    }),
    prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date(now) } }),
    prisma.adminLog.create({ data: { type: "LOGIN", note: `เข้าสู่ระบบ (IP ${ip})`, adminId: admin.id } }),
    // ล้าง session ที่หมดอายุแล้วไปพร้อมกัน
    prisma.adminSession.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(now) } }, { lastSeenAt: { lt: new Date(now - IDLE_MS) } }] } }),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_MS / 1000,
  });
  return { ok: true };
}

// ---------- ตรวจ session ----------

/** แอดมินที่ล็อกอินอยู่ (null = ไม่ได้ล็อกอิน/หมดเวลา) — ต่ออายุ idle ทุกครั้งที่เรียก */
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const s = await prisma.adminSession.findUnique({ where: { id: sha256(token) }, include: { admin: true } });
  if (!s) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() < now || s.lastSeenAt.getTime() < now - IDLE_MS || !s.admin.isActive) {
    await prisma.adminSession.delete({ where: { id: s.id } }).catch(() => {});
    if (s.lastSeenAt.getTime() < now - IDLE_MS)
      await prisma.adminLog.create({ data: { type: "IDLE_LOGOUT", note: "หมดเวลาเพราะไม่มีการใช้งาน", adminId: s.adminId } });
    return null;
  }
  // ต่ออายุ idle (เขียนไม่เกินนาทีละครั้ง)
  if (now - s.lastSeenAt.getTime() > 60e3)
    await prisma.adminSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(now) } });
  const a = s.admin;
  return { id: a.id, username: a.username, displayName: a.displayName, role: a.role };
}

/** ใช้ในทุกหน้า/action/route ของหลังบ้าน — ไม่ได้ล็อกอินให้ไปหน้าเข้าสู่ระบบ */
export async function requireAdmin(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function logout(reason: "manual" | "idle" = "manual") {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const s = await prisma.adminSession.findUnique({ where: { id: sha256(token) } });
    if (s) {
      await prisma.adminSession.delete({ where: { id: s.id } });
      await prisma.adminLog.create({
        data: {
          type: reason === "idle" ? "IDLE_LOGOUT" : "LOGOUT",
          note: reason === "idle" ? "ออกจากระบบอัตโนมัติ (ไม่มีการใช้งานนาน)" : "ออกจากระบบ",
          adminId: s.adminId,
        },
      });
    }
  }
  jar.delete(SESSION_COOKIE);
}
