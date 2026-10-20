// ระบบล็อกอินหลังบ้าน
// - รหัสผ่านเก็บเป็น bcrypt hash
// - session: cookie httpOnly เก็บ token สุ่ม, ฐานข้อมูลเก็บแค่ SHA-256 ของ token (ขโมยฐานข้อมูลไปก็ใช้ล็อกอินไม่ได้)
// - ไม่มีการใช้งานเกิน 30 นาที = หมดอายุ (ตรวจฝั่ง server), อายุสูงสุด 12 ชั่วโมง
// - ใส่รหัสผิดครบ 5 ครั้งต่อชื่อผู้ใช้ (หรือ 20 ครั้งต่อ IP) → ล็อก 15 นาที และบันทึก AdminLog
// - ยืนยันตัวตน 2 ขั้น (TOTP/รหัสสำรอง) สำหรับบัญชีที่เปิดใช้: รหัสผ่านถูก → cookie ชั่วคราว 5 นาที (ลงลายมือชื่อ HMAC)
//   → กรอกรหัส 6 หลัก → จึงสร้าง session จริง; รหัสผิดนับรวมกับตัวจำกัดการล็อกอินเดียวกัน
// - บัญชีที่ต้องเปลี่ยนรหัสผ่าน (mustChangePassword) ใช้งานหน้าอื่นไม่ได้จนกว่าจะเปลี่ยน (/admin/account?force=1)
import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { matchBackupCode, verifyTotp } from "@/lib/totp";

export const SESSION_COOKIE = "mdw_admin";
const PENDING_COOKIE = "mdw_2fa";
export const IDLE_MS = 30 * 60e3;
const MAX_AGE_MS = 12 * 60 * 60e3;
const PENDING_MS = 5 * 60e3;
const USER_MAX_FAILS = 5;
const IP_MAX_FAILS = 20;
const LOCK_MS = 15 * 60e3;
// hash จำลองไว้เทียบเมื่อไม่พบชื่อผู้ใช้ ให้ใช้เวลาเท่ากัน (ไม่บอกใบ้ว่าชื่อผู้ใช้มีอยู่จริง)
const DUMMY_HASH = "$2b$12$0ylv2mguFdWCzmUAJRl73uy0Y0QbAFZu8BoGdHNMD/eJ2mbI7vgXO";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const cookieOpts = (maxAgeMs: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(maxAgeMs / 1000),
});

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local",
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export type CurrentAdmin = {
  id: string;
  username: string;
  displayName: string;
  role: "OWNER" | "STAFF";
  mustChangePassword: boolean;
  totpEnabled: boolean;
  /** 16 ตัวแรกของ id session ปัจจุบัน (ใช้ระบุ "เครื่องนี้" ในรายการอุปกรณ์) */
  sessionKey: string;
};

// ---------- ตัวจำกัดการล็อกอิน ----------

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; triesLeft: number }
  | { ok: false; reason: "locked"; until: Date }
  | { ok: false; reason: "2fa" }
  | { ok: false; reason: "expired" };

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

/** นับครั้งที่ผิด (ทั้งรหัสผ่านและรหัส 2 ขั้น) + บันทึก log */
async function failAttempt(username: string, ip: string, what: string, adminId: string | null = null): Promise<LoginResult> {
  const u = await addFail(`user:${username}`, USER_MAX_FAILS);
  const i = await addFail(`ip:${ip}`, IP_MAX_FAILS);
  const until = u.until ?? i.until;
  await prisma.adminLog.create({
    data: {
      type: until ? "LOCKOUT" : "LOGIN_FAIL",
      note: until ? `ล็อกการเข้าสู่ระบบ 15 นาที (ชื่อผู้ใช้ "${username}", IP ${ip})` : `${what} (ชื่อผู้ใช้ "${username}", IP ${ip})`,
      adminId,
    },
  });
  if (until) return { ok: false, reason: "locked", until };
  return { ok: false, reason: "invalid", triesLeft: Math.max(0, USER_MAX_FAILS - u.fails) };
}

async function createSession(adminId: string, ip: string, userAgent: string | null, note: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await prisma.$transaction([
    prisma.adminSession.create({
      data: { id: sha256(token), adminId, expiresAt: new Date(now + MAX_AGE_MS), ip, userAgent },
    }),
    prisma.admin.update({ where: { id: adminId }, data: { lastLoginAt: new Date(now) } }),
    prisma.adminLog.create({ data: { type: "LOGIN", note: `${note} (IP ${ip})`, adminId } }),
    // ล้าง session ที่หมดอายุแล้วไปพร้อมกัน
    prisma.adminSession.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(now) } }, { lastSeenAt: { lt: new Date(now - IDLE_MS) } }] } }),
  ]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOpts(MAX_AGE_MS));
  jar.delete(PENDING_COOKIE);
}

// ---------- ขั้นที่ 1: ชื่อผู้ใช้ + รหัสผ่าน ----------

// ลายมือชื่อของ cookie ชั่วคราวระหว่างรอรหัส 2 ขั้น — กุญแจมาจากข้อมูลลับที่อยู่แค่ในฐานข้อมูล
// (hash รหัสผ่าน + secret TOTP) จึงปลอมไม่ได้ และใช้ไม่ได้ทันทีเมื่อเปลี่ยนรหัสผ่าน/ปิด 2FA
const pendingSig = (a: { id: string; passwordHash: string; totpSecret: string | null }, exp: number) =>
  createHmac("sha256", `${a.passwordHash}|${a.totpSecret ?? ""}`).update(`2fa.${a.id}.${exp}`).digest("base64url");

export async function login(usernameRaw: string, password: string): Promise<LoginResult> {
  const username = usernameRaw.trim().toLowerCase().slice(0, 60);
  const { ip, userAgent } = await requestMeta();
  const userKey = `user:${username}`;

  const locked = await lockedUntil([userKey, `ip:${ip}`]);
  if (locked) return { ok: false, reason: "locked", until: locked };

  const admin = await prisma.admin.findUnique({ where: { username } });
  const valid = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !admin.isActive || !valid) return failAttempt(username, ip, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");

  if (admin.totpEnabled && admin.totpSecret) {
    // ยังไม่ล้างตัวนับของชื่อผู้ใช้ — ต้องผ่านรหัส 2 ขั้นก่อน (กันเดารหัส 6 หลักโดยสลับกรอกรหัสผ่านใหม่)
    const exp = Date.now() + PENDING_MS;
    (await cookies()).set(PENDING_COOKIE, `${admin.id}.${exp}.${pendingSig(admin, exp)}`, { ...cookieOpts(PENDING_MS), path: "/admin" });
    return { ok: false, reason: "2fa" };
  }

  await prisma.loginThrottle.deleteMany({ where: { key: userKey } });
  await createSession(admin.id, ip, userAgent, "เข้าสู่ระบบ");
  return { ok: true };
}

// ---------- ขั้นที่ 2: รหัสจากแอป หรือรหัสสำรอง ----------

async function pendingAdmin() {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value ?? "";
  const [id, expS, sig] = raw.split(".");
  const exp = Number(expS);
  if (!id || !sig || !Number.isFinite(exp) || exp < Date.now() || id.length > 40) return null;
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin || !admin.isActive || !admin.totpEnabled || !admin.totpSecret) return null;
  if (!safeEq(sig, pendingSig(admin, exp))) return null;
  return admin;
}

/** มีขั้นตอนรอรหัส 2 ขั้นค้างอยู่ไหม (ใช้แสดงช่องกรอกรหัสหลังรีเฟรชหน้า) */
export async function pendingTwoFactor() {
  const a = await pendingAdmin();
  return a ? { username: a.username } : null;
}

export async function cancelTwoFactor() {
  (await cookies()).delete({ name: PENDING_COOKIE, path: "/admin" });
}

const totpKey = (adminId: string) => `totp:${adminId}`;

/** ตรวจรหัส TOTP แบบใช้ซ้ำไม่ได้ (จำ step ล่าสุดที่ใช้ไว้ใน LoginThrottle key "totp:<id>") */
export async function consumeTotp(adminId: string, secret: string, code: string) {
  const last = await prisma.loginThrottle.findUnique({ where: { key: totpKey(adminId) } });
  const step = verifyTotp(secret, code, last?.fails ?? -1);
  if (step === null) return false;
  await prisma.loginThrottle.upsert({ where: { key: totpKey(adminId) }, create: { key: totpKey(adminId), fails: step }, update: { fails: step } });
  return true;
}

/** ใช้รหัสสำรอง (ใช้ได้ครั้งเดียว) — คืนจำนวนที่เหลือ หรือ null ถ้าไม่ตรง */
export async function consumeBackupCode(adminId: string, code: string) {
  for (let i = 0; i < 3; i++) {
    const a = await prisma.admin.findUnique({ where: { id: adminId }, select: { backupCodes: true } });
    const list = Array.isArray(a?.backupCodes) ? (a.backupCodes as string[]) : [];
    const idx = matchBackupCode(list, code);
    if (idx < 0) return null;
    const rest = list.filter((_, k) => k !== idx);
    // อัปเดตแบบมีเงื่อนไข (ค่าเดิมต้องยังเหมือนเดิม) กันใช้รหัสเดียวกันสองครั้งพร้อมกัน
    const r = await prisma.admin.updateMany({ where: { id: adminId, backupCodes: { equals: list } }, data: { backupCodes: rest } });
    if (r.count === 1) return rest.length;
  }
  return null;
}

export type TwoFactorResult = Exclude<LoginResult, { ok: true }> | { ok: true; backupLeft?: number };

export async function verifyTwoFactor(codeRaw: string): Promise<TwoFactorResult> {
  const code = codeRaw.trim().slice(0, 20);
  const { ip, userAgent } = await requestMeta();
  const admin = await pendingAdmin();
  if (!admin) {
    await cancelTwoFactor();
    return { ok: false, reason: "expired" };
  }
  const locked = await lockedUntil([`user:${admin.username}`, `ip:${ip}`]);
  if (locked) return { ok: false, reason: "locked", until: locked };

  let how = "";
  let backupLeft: number | undefined;
  if (/^\d{6}$/.test(code.replace(/\s/g, ""))) {
    if (await consumeTotp(admin.id, admin.totpSecret!, code)) how = "แอปยืนยันตัวตน";
  } else {
    const left = await consumeBackupCode(admin.id, code);
    if (left !== null) {
      how = `รหัสสำรอง — เหลือ ${left} รหัส`;
      backupLeft = left;
    }
  }
  if (!how) return failAttempt(admin.username, ip, "รหัสยืนยันตัวตน 2 ขั้นไม่ถูกต้อง", admin.id);

  await prisma.loginThrottle.deleteMany({ where: { key: `user:${admin.username}` } });
  await createSession(admin.id, ip, userAgent, `เข้าสู่ระบบ (ยืนยัน 2 ขั้นด้วย${how})`);
  return { ok: true, backupLeft };
}

// ---------- ตรวจ session ----------

async function currentSession() {
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
    await prisma.adminSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(now) } }).catch(() => {});
  return s;
}

/** แอดมินที่ล็อกอินอยู่ (null = ไม่ได้ล็อกอิน/หมดเวลา) — ต่ออายุ idle ทุกครั้งที่เรียก */
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const s = await currentSession();
  if (!s) return null;
  const a = s.admin;
  return {
    id: a.id, username: a.username, displayName: a.displayName, role: a.role,
    mustChangePassword: a.mustChangePassword, totpEnabled: a.totpEnabled, sessionKey: s.id.slice(0, 16),
  };
}

/**
 * ใช้ในทุกหน้า/action/route ของหลังบ้าน — ไม่ได้ล็อกอินให้ไปหน้าเข้าสู่ระบบ
 * บัญชีที่ต้องเปลี่ยนรหัสผ่านก่อน ถูกพาไปหน้า "บัญชีของฉัน" (ยกเว้นหน้านั้นเองที่ส่ง allowPasswordChange)
 */
export async function requireAdmin(opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (admin.mustChangePassword && !opts.allowPasswordChange) redirect("/admin/account?force=1");
  return admin;
}

/** งานเฉพาะเจ้าของร้าน (ตั้งค่า, ผู้ใช้, LINE, นำเข้า/ส่งออกทั้งหมด, ลบข้อมูล) — STAFF ถูกพาไปหน้าแรกหลังบ้าน */
export async function requireOwner(): Promise<CurrentAdmin> {
  const admin = await requireAdmin();
  if (admin.role !== "OWNER") {
    await prisma.adminLog.create({ data: { type: "DENIED", note: "พยายามใช้งานส่วนของเจ้าของร้าน", adminId: admin.id } }).catch(() => {});
    redirect("/admin?denied=1");
  }
  return admin;
}

/** สำหรับ route handler (ไฟล์ CSV/ZIP): 401 ไม่ได้ล็อกอิน · 403 ไม่ใช่เจ้าของร้าน/ต้องเปลี่ยนรหัสก่อน */
export async function routeAdmin(ownerOnly = false): Promise<CurrentAdmin | Response> {
  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  if (admin.mustChangePassword) return new Response("Forbidden: เปลี่ยนรหัสผ่านก่อน", { status: 403 });
  if (ownerOnly && admin.role !== "OWNER") {
    await prisma.adminLog.create({ data: { type: "DENIED", note: "พยายามดาวน์โหลดข้อมูลของเจ้าของร้าน", adminId: admin.id } });
    return new Response("Forbidden", { status: 403 });
  }
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

// ---------- รายการอุปกรณ์ที่เข้าสู่ระบบ ----------

/** อธิบายเบราว์เซอร์/ระบบปฏิบัติการแบบสั้นจาก User-Agent */
export function describeUserAgent(ua: string | null) {
  if (!ua) return "ไม่ทราบอุปกรณ์";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Line\//.test(ua) ? "LINE" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /HeadlessChrome/.test(ua) ? "Chrome" : "เบราว์เซอร์อื่น";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "ระบบอื่น";
  return `${browser} · ${os}`;
}

export type SessionRow = {
  key: string; adminId: string; username: string; displayName: string;
  createdAt: Date; lastSeenAt: Date; ip: string; device: string; current: boolean;
};

/** session ที่ยังใช้งานได้ (adminId = เฉพาะคนนั้น, ไม่ระบุ = ทุกคน — ใช้ได้เฉพาะ OWNER) */
export async function listSessions(me: CurrentAdmin, adminId?: string): Promise<SessionRow[]> {
  const now = Date.now();
  const rows = await prisma.adminSession.findMany({
    where: { ...(adminId ? { adminId } : {}), expiresAt: { gt: new Date(now) }, lastSeenAt: { gt: new Date(now - IDLE_MS) } },
    orderBy: { lastSeenAt: "desc" },
    include: { admin: { select: { username: true, displayName: true } } },
  });
  return rows.map((s) => ({
    key: s.id.slice(0, 16), adminId: s.adminId, username: s.admin.username, displayName: s.admin.displayName,
    createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, ip: s.ip ?? "—", device: describeUserAgent(s.userAgent), current: s.id.startsWith(me.sessionKey),
  }));
}

/** ออกจากระบบอุปกรณ์หนึ่งเครื่อง — ของตัวเอง หรือของทุกคนถ้าเป็น OWNER */
export async function revokeSession(me: CurrentAdmin, key: string) {
  if (!/^[0-9a-f]{16}$/.test(key)) return null;
  const s = await prisma.adminSession.findFirst({ where: { id: { startsWith: key } }, include: { admin: { select: { username: true } } } });
  if (!s || (s.adminId !== me.id && me.role !== "OWNER")) return null;
  await prisma.adminSession.delete({ where: { id: s.id } });
  await prisma.adminLog.create({
    data: { type: "SESSION_REVOKE", note: `ออกจากระบบอุปกรณ์ของ ${s.admin.username} (IP ${s.ip ?? "—"}, ${describeUserAgent(s.userAgent)})`, adminId: me.id },
  });
  return s;
}

/** ออกจากระบบทุกเครื่องของผู้ใช้ (เว้นเครื่องปัจจุบันถ้าเป็นของตัวเอง) — คืนจำนวนที่ตัด */
export async function revokeOtherSessions(me: CurrentAdmin, adminId: string = me.id) {
  if (adminId !== me.id && me.role !== "OWNER") return 0;
  const r = await prisma.adminSession.deleteMany({
    where: { adminId, ...(adminId === me.id ? { NOT: { id: { startsWith: me.sessionKey } } } : {}) },
  });
  return r.count;
}
