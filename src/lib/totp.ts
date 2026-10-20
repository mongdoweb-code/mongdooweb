// ยืนยันตัวตน 2 ขั้น (TOTP ตาม RFC 6238: HMAC-SHA1, ช่วงละ 30 วินาที, รหัส 6 หลัก) — ใช้กับ Google Authenticator / Microsoft Authenticator ฯลฯ
// + รหัสสำรอง 8 ชุด (ใช้ได้ชุดละครั้ง เก็บเฉพาะ SHA-256)
// ใช้แค่ node:crypto ไม่พึ่งไลบรารีภายนอก
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP = 30;
export const TOTP_DIGITS = 6;
export const BACKUP_CODE_COUNT = 8;

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("base32 ไม่ถูกต้อง");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** secret ใหม่ 160 บิต (ตามที่ RFC 4226 แนะนำ) เป็น base32 */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** รหัส 6 หลักของช่วงเวลา step (step = floor(unix / 30)) */
export function totpAt(secretB32: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_STEP);

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * ตรวจรหัส (ยอมให้นาฬิกาคลาดได้ ±1 ช่วง = ±30 วินาที) — คืน step ที่ตรง หรือ null
 * afterStep: step ที่ใช้ไปแล้วล่าสุด → รหัสเดิมใช้ซ้ำไม่ได้ (กันดักรหัสไปใช้ต่อ)
 */
export function verifyTotp(secretB32: string, code: string, afterStep = -1, now = Date.now()) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const s0 = currentStep(now);
  let hit: number | null = null;
  // ตรวจครบทุกช่วงเสมอ (เวลาเท่ากันไม่ว่าตรงหรือไม่)
  for (const s of [s0 - 1, s0, s0 + 1]) if (safeEq(totpAt(secretB32, s), c) && s > afterStep && hit === null) hit = s;
  return hit;
}

/** ลิงก์ otpauth:// สำหรับสร้าง QR ให้แอปสแกน */
export function otpauthUrl(secretB32: string, account: string, issuer = "มองดูเว็บ หลังร้าน") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
}

// ---------- รหัสสำรอง ----------

const normBackup = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const hashBackupCode = (s: string) => createHash("sha256").update(`mdw-backup:${normBackup(s)}`).digest("hex");

/** รหัสสำรองรูปแบบ "abcd-ef12" (ตัด 0/o/1/l ที่สับสนง่ายออก) */
export function newBackupCodes(n = BACKUP_CODE_COUNT) {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const s = Array.from(b, (x) => abc[x % abc.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

/** หา index ของรหัสสำรองที่ตรง (เทียบ hash แบบเวลาคงที่) — -1 = ไม่ตรง */
export function matchBackupCode(hashes: unknown, code: string) {
  if (!Array.isArray(hashes) || normBackup(code).length !== 8) return -1;
  const h = hashBackupCode(code);
  let idx = -1;
  hashes.forEach((x, i) => {
    if (typeof x === "string" && safeEq(x, h) && idx < 0) idx = i;
  });
  return idx;
}

/** ตรวจความแข็งแรงรหัสผ่าน — คืนข้อความปัญหา หรือ null ถ้าผ่าน */
export function passwordProblem(pw: string, username = "") {
  if (pw.length < 10) return "รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร";
  if (pw.length > 200) return "รหัสผ่านยาวเกินไป (ไม่เกิน 200 ตัวอักษร)";
  if (new Set(pw).size < 5) return "รหัสผ่านซ้ำตัวอักษรเดิมมากเกินไป";
  const low = pw.toLowerCase();
  if (username && low.includes(username.toLowerCase())) return "รหัสผ่านต้องไม่มีชื่อผู้ใช้อยู่ข้างใน";
  if (/^(?:0123456789|1234567890|password|qwertyuiop|mongdoweb|admin)/.test(low)) return "รหัสผ่านนี้เดาง่ายเกินไป";
  return null;
}
