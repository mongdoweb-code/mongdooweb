// เลขรันทั่วไปนอกเอกสารขาย: PREFIX + YYMM + "-" + 5 หลัก (PO2610-00001, CL2610-00001) รีเซ็ตรายเดือน
// จองแบบ atomic (INSERT … ON CONFLICT DO UPDATE) — เรียกภายใน transaction เดียวกับการบันทึกรายการ
import type { prisma } from "@/lib/prisma";

type Tx = Pick<typeof prisma, "$queryRaw">;

/** period จากวันที่ตามเวลาไทย เช่น 2026-10-22 → "2610" */
export function bkkPeriod(d: Date = new Date()) {
  const ymd = new Date(d.getTime() + 7 * 3600_000).toISOString();
  return ymd.slice(2, 4) + ymd.slice(5, 7);
}

export async function nextSeq(tx: Tx, key: string, d: Date = new Date()) {
  if (!/^[A-Z]{2,4}$/.test(key)) throw new Error(`sequence key ไม่ถูกต้อง: ${key}`);
  const period = bkkPeriod(d);
  const rows = await tx.$queryRaw<{ n: number }[]>`
    INSERT INTO "Sequence" ("key", "period", "next") VALUES (${key}, ${period}, 2)
    ON CONFLICT ("key", "period") DO UPDATE SET "next" = "Sequence"."next" + 1
    RETURNING "next" - 1 AS n`;
  return `${key}${period}-${String(Number(rows[0].n)).padStart(5, "0")}`;
}
