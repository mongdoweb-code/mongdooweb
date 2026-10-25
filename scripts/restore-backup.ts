// กู้คืนข้อมูลจากไฟล์สำรอง (A26) — ใช้ตามคู่มือ docs/DEPLOY.md หัวข้อ "กู้คืนข้อมูลจากไฟล์สำรอง"
//   npx tsx scripts/restore-backup.ts <ไฟล์.zip>            ฐานข้อมูลปลายทาง (DATABASE_URL) ต้อง migrate แล้วและยังว่าง
//   npx tsx scripts/restore-backup.ts <ไฟล์.zip> --wipe     ล้างทุกตารางในฐานข้อมูลปลายทางก่อน (เช่น ฐานข้อมูลใหม่ที่ถูก seed ไปแล้ว)
//   npx tsx scripts/restore-backup.ts <ไฟล์.zip> --dry-run  ตรวจไฟล์และแสดงจำนวนแถว โดยไม่เขียนอะไร
// ทำทั้งหมดใน transaction เดียว: ผิดพลาดตรงไหน = ไม่มีอะไรเปลี่ยน · ใส่ตารางตามลำดับ foreign key อัตโนมัติ
// ข้อมูลแต่ละตารางใส่ด้วย json_populate_recordset จึงได้ชนิดข้อมูลตรงตามคอลัมน์ (enum, array, json, วันที่)
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { readZip } from "../src/lib/zip";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const wipe = args.includes("--wipe"), dry = args.includes("--dry-run");
  if (!file) throw new Error("ระบุไฟล์ เช่น npx tsx scripts/restore-backup.ts backups/2026-10-22.zip");
  const files = readZip(readFileSync(file));
  const manifest = JSON.parse(files.get("manifest.json")?.toString("utf8") ?? "null") as { app: string; version: number; createdAt: string; lastMigration: string | null; tables: Record<string, number> } | null;
  if (!manifest || manifest.app !== "mongdoweb") throw new Error("ไม่ใช่ไฟล์สำรองของมองดูเว็บ (ไม่มี manifest.json)");
  console.log(`ไฟล์สำรองวันที่ ${manifest.createdAt} · migration ล่าสุด ${manifest.lastMigration ?? "-"} · ${Object.keys(manifest.tables).length} ตาราง`);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const mig = await db.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`).catch(() => null);
    if (!mig) throw new Error("ฐานข้อมูลปลายทางยังไม่ได้ migrate — รัน npx prisma migrate deploy ก่อน");
    const target = mig.rows[0]?.migration_name ?? null;
    if (manifest.lastMigration && target && target < manifest.lastMigration) throw new Error(`โค้ด/ฐานข้อมูลปลายทางเก่ากว่าไฟล์สำรอง (${target} < ${manifest.lastMigration}) — deploy โค้ดเวอร์ชันที่ใหม่กว่าก่อน`);

    const existing = new Set((await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`)).rows.map((r) => r.table_name as string));
    const tables = Object.keys(manifest.tables).filter((t) => {
      if (!existing.has(t)) console.warn(`! ข้ามตาราง ${t} (ไม่มีในฐานข้อมูลปลายทาง)`);
      return existing.has(t);
    });
    // ลำดับ: ตารางที่ถูกอ้างถึง (parent) ก่อนตารางที่อ้างถึง (child)
    const fk = (await db.query(`
      SELECT c.relname AS child, p.relname AS parent FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE k.contype = 'f' AND n.nspname = current_schema()`)).rows as { child: string; parent: string }[];
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (t: string, stack: Set<string>) => {
      if (seen.has(t) || stack.has(t)) return;
      stack.add(t);
      for (const e of fk) if (e.child === t && e.parent !== t && tables.includes(e.parent)) visit(e.parent, stack);
      seen.add(t);
      order.push(t);
    };
    for (const t of tables) visit(t, new Set());

    if (!wipe) {
      for (const t of order) {
        const n = Number((await db.query(`SELECT COUNT(*)::int AS n FROM "${t}"`)).rows[0].n);
        if (n > 0) {
          const msg = `ตาราง ${t} มีข้อมูลอยู่แล้ว ${n} แถว — ใช้ฐานข้อมูลใหม่ หรือเพิ่ม --wipe เพื่อล้างก่อน (ระวัง: ลบข้อมูลเดิมทั้งหมด)`;
          if (!dry) throw new Error(msg);
          console.warn(`! ${msg}`);
        }
      }
    }
    if (dry) {
      for (const t of order) console.log(`  ${t.padEnd(26)} ${String(manifest.tables[t]).padStart(8)} แถว`);
      return console.log("ตรวจไฟล์เรียบร้อย (--dry-run ไม่ได้เขียนข้อมูล)");
    }

    await db.query("BEGIN");
    if (wipe) await db.query(`TRUNCATE ${[...existing].filter((t) => t !== "_prisma_migrations").map((t) => `"${t}"`).join(", ")} CASCADE`);
    for (const t of order) {
      const raw = files.get(`tables/${t}.json`);
      if (!raw) throw new Error(`ไม่มีไฟล์ tables/${t}.json ในไฟล์สำรอง`);
      const rows = JSON.parse(raw.toString("utf8")) as unknown[];
      // ทั้งตารางใน statement เดียว: foreign key ที่อ้างตารางเดียวกัน (เช่น SalesDocument.sourceId) ตรวจตอนจบ statement จึงไม่ติดลำดับแถว
      if (rows.length) await db.query(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, [JSON.stringify(rows)]);
      console.log(`  ✓ ${t.padEnd(26)} ${String(rows.length).padStart(8)} แถว`);
    }
    await db.query("COMMIT");
    console.log("กู้คืนเรียบร้อย — ผู้ใช้ที่เปิดยืนยันตัวตน 2 ขั้นไว้ต้องตั้งใหม่ · ตรวจหน้าร้านและหลังบ้านก่อนสลับใช้งานจริง");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(`กู้คืนไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
