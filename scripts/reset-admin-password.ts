// ตั้งรหัสผ่านแอดมินใหม่ (กรณีลืมรหัส / เข้าหลังบ้านไม่ได้) — รันใน Console ของบริการบน Railway:
//   npm run admin:reset                 → บัญชี "admin"
//   npm run admin:reset -- somchai      → บัญชีชื่ออื่น
//   npm run admin:reset -- admin --no-2fa   → ปิดรหัส 2 ชั้นด้วย (กรณีมือถือที่ใช้ยืนยันหาย)
// ทำอะไร: สุ่มรหัสชั่วคราว (แสดงบนจอครั้งเดียว ไม่เก็บที่ไหน) → บังคับเปลี่ยนรหัสตอนเข้าสู่ระบบ
//         ปลดล็อกการล็อกจากการกรอกรหัสผิด · ออกจากระบบทุกเครื่องของบัญชีนี้ · บันทึกประวัติ (ไม่เก็บรหัส)
// ถ้ายังไม่มีแอดมินเลย จะสร้างบัญชีเจ้าของร้าน (OWNER) ให้
import "dotenv/config";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/** ตัวอักษรที่อ่านง่าย (ไม่มี 0/O, 1/l/I) */
const CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function tempPassword(groups = 4, size = 4) {
  return Array.from({ length: groups }, () => Array.from({ length: size }, () => CHARS[randomInt(CHARS.length)]).join("")).join("-");
}

async function main() {
  const args = process.argv.slice(2);
  const no2fa = args.includes("--no-2fa");
  const username = (args.find((a) => !a.startsWith("--")) || "admin").trim();
  if (!process.env.DATABASE_URL) throw new Error("ไม่พบ DATABASE_URL — ต้องรันใน Console ของบริการเว็บบน Railway");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const password = tempPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    let admin = await prisma.admin.findUnique({ where: { username } });

    if (!admin) {
      const count = await prisma.admin.count();
      if (count > 0) {
        const list = await prisma.admin.findMany({ select: { username: true, role: true, isActive: true }, orderBy: { createdAt: "asc" } });
        console.error(`\n❌ ไม่พบบัญชี "${username}" — บัญชีที่มีอยู่:`);
        for (const a of list) console.error(`   • ${a.username} (${a.role === "OWNER" ? "เจ้าของร้าน" : "พนักงาน"}${a.isActive ? "" : " · ปิดใช้งาน"})`);
        console.error(`\nรันใหม่โดยใส่ชื่อบัญชี เช่น: npm run admin:reset -- ${list[0]?.username ?? "admin"}\n`);
        process.exitCode = 1;
        return;
      }
      admin = await prisma.admin.create({ data: { username, displayName: username, role: "OWNER", passwordHash, mustChangePassword: true } });
    } else {
      admin = await prisma.admin.update({
        where: { id: admin.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          isActive: true,
          ...(no2fa ? { totpEnabled: false, totpSecret: null, backupCodes: [] } : {}),
        },
      });
    }

    // ออกจากระบบทุกเครื่อง + ปลดล็อกการกรอกรหัสผิด (ของบัญชีนี้ และ IP ที่ถูกล็อกอยู่)
    await prisma.adminSession.deleteMany({ where: { adminId: admin.id } });
    await prisma.loginThrottle.deleteMany({ where: { OR: [{ key: `user:${username}` }, { key: { startsWith: "ip:" } }] } });
    await prisma.adminLog.create({
      data: { adminId: admin.id, type: "PASSWORD", entity: `Admin:${admin.id}`, note: `ตั้งรหัสผ่านใหม่จาก Console (สคริปต์ admin:reset)${no2fa ? " · ปิดรหัส 2 ชั้น" : ""}` },
    });

    const line = "═".repeat(46);
    console.log(`\n${line}`);
    console.log(" ✅ ตั้งรหัสผ่านใหม่เรียบร้อย");
    console.log(line);
    console.log(` ชื่อผู้ใช้      : ${username}`);
    console.log(` รหัสชั่วคราว   : ${password}`);
    console.log(` บทบาท         : ${admin.role === "OWNER" ? "เจ้าของร้าน (OWNER)" : "พนักงาน (STAFF)"}`);
    console.log(` รหัส 2 ชั้น     : ${admin.totpEnabled ? "เปิดอยู่ (ต้องใช้แอปในมือถือ)" : "ปิด"}`);
    console.log(line);
    console.log(" 1) เข้า /admin/login ด้วยรหัสชั่วคราวนี้");
    console.log(" 2) ระบบจะบังคับตั้งรหัสผ่านใหม่ของคุณเองก่อนใช้งานหน้าอื่น");
    console.log(" 3) ล้างหน้าจอ Console นี้หลังใช้เสร็จ");
    console.log(`${line}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
