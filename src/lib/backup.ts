// สำรองข้อมูลอัตโนมัติรายวัน (A26) — ทุกตารางในฐานข้อมูลเป็น JSON (ตารางละไฟล์) รวมเป็น ZIP แล้วเก็บที่ storage "backups/YYYY-MM-DD.zip"
// - อ่านด้วย row_to_json จึงได้ค่าตรงตามคอลัมน์จริง (enum, array, json, วันที่) → กู้คืนด้วย json_populate_recordset ได้ทันที
//   (scripts/restore-backup.ts — ขั้นตอนใน docs/DEPLOY.md หัวข้อ "กู้คืนข้อมูลจากไฟล์สำรอง")
// - ตารางใหม่ที่เพิ่มภายหลังถูกสำรองเองอัตโนมัติ (อ่านรายชื่อตารางจาก information_schema)
// - ไม่สำรอง: session หลังบ้าน, ตัวจำกัดการล็อกอิน (ข้อมูลชั่วคราว) และ secret 2 ขั้น/รหัสสำรองของผู้ใช้
//   (รหัสผ่านเก็บเป็น bcrypt hash เพื่อให้กู้คืนแล้วเข้าระบบได้ · 2FA ต้องตั้งใหม่หลังกู้คืน)
// - เก็บย้อนหลังตาม ShopSetting.backupRetentionDays (ค่าเริ่มต้น 14 วัน) — เก่ากว่านั้นลบไฟล์ออกจาก storage
// - ไฟล์รูป/สลิปอยู่ใน storage เดิม (Bucket) ไม่ได้รวมใน ZIP
import "server-only";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { createZip, type ZipEntry } from "@/lib/zip";

export const BACKUP_VERSION = 1;
const SKIP_TABLES = new Set(["_prisma_migrations", "AdminSession", "LoginThrottle"]);
const LOCK_KEY = 4825012;

/** วันที่ไทย "YYYY-MM-DD" */
const bkkDay = (d = new Date()) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
export const backupKeyFor = (d = new Date()) => `backups/${bkkDay(d)}.zip`;

/** ทุกตารางในฐานข้อมูล (ยกเว้นข้อมูลชั่วคราว) — ใช้ร่วมกับไฟล์ส่งออก CSV (src/lib/data-export.ts) */
export async function tables() {
  const rows = await prisma.$queryRaw<{ t: string }[]>`
    SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`;
  return rows.map((r) => r.t).filter((t) => !SKIP_TABLES.has(t) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(t));
}

/** ทุกแถวของตาราง (ชื่อต้องมาจาก tables()) ตามค่าคอลัมน์จริง */
export async function tableRows(t: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) throw new Error("ชื่อตารางไม่ถูกต้อง");
  // ::text — driver adapter ของ Prisma อ่านชนิด json จาก queryRaw ไม่ได้ จึงรับเป็นข้อความแล้ว parse เอง
  const rows = await prisma.$queryRawUnsafe<{ r: string }[]>(`SELECT row_to_json(x)::text AS r FROM "${t}" x`);
  return rows.map((x) => JSON.parse(x.r) as Record<string, unknown>);
}

/** ZIP ของทุกตาราง (JSON) + manifest.json + README.txt */
export async function buildBackupZip(by: string) {
  const now = new Date();
  const entries: ZipEntry[] = [];
  const counts: Record<string, number> = {};
  for (const t of await tables()) {
    // ชื่อตารางมาจาก information_schema และผ่าน regex แล้ว — ใส่ใน "..." ได้ปลอดภัย
    let data = await tableRows(t);
    if (t === "Admin") data = data.map((a) => ({ ...a, totpSecret: null, totpEnabled: false, backupCodes: [] }));
    counts[t] = data.length;
    entries.push({ name: `tables/${t}.json`, data: JSON.stringify(data), date: now });
  }
  const migration = await prisma
    .$queryRawUnsafe<{ name: string }[]>(`SELECT migration_name AS name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`)
    .catch(() => []);
  const manifest = { app: "mongdoweb", version: BACKUP_VERSION, createdAt: now.toISOString(), by, lastMigration: migration[0]?.name ?? null, tables: counts };
  const readme = [
    "สำรองข้อมูลร้านมองดูเว็บ (ทุกตาราง)",
    `สร้างเมื่อ ${now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} โดย ${by}`,
    "",
    "- tables/<ชื่อตาราง>.json = ข้อมูลทุกแถวของตารางนั้น (ค่าตามคอลัมน์จริงในฐานข้อมูล)",
    "- จำนวนเงินที่ลงท้ายด้วย Satang เป็นสตางค์ · เวลาเป็น UTC",
    "- กู้คืน: ดู docs/DEPLOY.md หัวข้อ \"กู้คืนข้อมูลจากไฟล์สำรอง\" (npx tsx scripts/restore-backup.ts <ไฟล์.zip>)",
    "- ไม่รวม: ไฟล์รูป/สลิป (อยู่ใน storage), session, secret ยืนยันตัวตน 2 ขั้น (ต้องตั้งใหม่หลังกู้คืน)",
    "- มีข้อมูลส่วนบุคคลของลูกค้า (PDPA) — เก็บในที่ปลอดภัยเท่านั้น",
    "",
    ...Object.entries(counts).map(([t, n]) => `${t.padEnd(26)} ${String(n).padStart(8)} แถว`),
    "",
  ].join("\r\n");
  entries.unshift({ name: "manifest.json", data: JSON.stringify(manifest, null, 2), date: now }, { name: "README.txt", data: "﻿" + readme, date: now });
  return { zip: createZip(entries), manifest };
}

export type BackupOutcome = { ok: true; id: string; key: string; sizeBytes: number; tables: number; expired: number } | { ok: false; id: string; error: string } | { ok: false; skipped: string };

/**
 * สำรองข้อมูลแล้วอัปโหลด — ครั้งเดียวต่อเวลา (advisory lock) · onlyIfMissing: ข้ามถ้าวันนี้สำรองสำเร็จแล้ว (ใช้กับ cron)
 * ไฟล์ชื่อตามวันที่ไทย: สำรองซ้ำในวันเดียวกันจะแทนที่ไฟล์ของวันนั้น
 */
export async function runBackup(by: string, opts: { onlyIfMissing?: boolean } = {}): Promise<BackupOutcome> {
  const key = backupKeyFor();
  // จองงาน: ตรวจ + สร้างแถว RUNNING ใน transaction ที่ล็อก (advisory xact lock) กันเรียกพร้อมกัน (cron + กดปุ่ม)
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(${LOCK_KEY})`;
    const running = await tx.backupRun.findFirst({ where: { status: "RUNNING", createdAt: { gte: new Date(Date.now() - 15 * 60e3) } } });
    if (running) return { skipped: "running" as const };
    if (opts.onlyIfMissing) {
      const today = new Date(`${bkkDay()}T00:00:00+07:00`);
      if (await tx.backupRun.findFirst({ where: { status: "OK", createdAt: { gte: today } } })) return { skipped: "already-today" as const };
    }
    return { run: await tx.backupRun.create({ data: { key, status: "RUNNING" } }) };
  });
  if ("skipped" in claim) return { ok: false, skipped: claim.skipped! };
  const id = claim.run.id;
  try {
    const { zip, manifest } = await buildBackupZip(by);
    await storage().delete(key).catch(() => {});
    await storage().put(key, zip);
    await prisma.backupRun.updateMany({ where: { key, status: "OK" }, data: { status: "REPLACED" } });
    await prisma.backupRun.update({ where: { id }, data: { sizeBytes: zip.length, status: "OK" } });
    const expired = await pruneBackups();
    return { ok: true, id, key, sizeBytes: zip.length, tables: Object.keys(manifest.tables).length, expired };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await prisma.backupRun.update({ where: { id }, data: { key: null, status: "FAILED", error } });
    return { ok: false, id, error };
  }
}

/** ลบไฟล์สำรองที่เก่ากว่าจำนวนวันที่ตั้งไว้ (เก็บแถว BackupRun ไว้ สถานะ EXPIRED) */
export async function pruneBackups() {
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { backupRetentionDays: true } });
  const days = Math.max(1, s?.backupRetentionDays ?? 14);
  const cutoff = new Date(Date.now() - days * 864e5);
  const old = await prisma.backupRun.findMany({ where: { createdAt: { lt: cutoff }, status: { in: ["OK", "REPLACED"] }, key: { not: null } } });
  let n = 0;
  for (const r of old) {
    // ไฟล์ของวันเดียวกันที่ยังเป็นรายการล่าสุด (OK) อาจใช้ key เดียวกัน — ลบไฟล์เฉพาะเมื่อไม่มีรายการใหม่กว่าที่ใช้ key นี้
    const newer = await prisma.backupRun.count({ where: { key: r.key, status: "OK", createdAt: { gte: cutoff } } });
    if (!newer) await storage().delete(r.key!).catch(() => {});
    await prisma.backupRun.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
    n++;
  }
  return n;
}
