// ป้ายที่ร้านใช้อยู่แล้ว (เรียงตามจำนวนสินค้าที่ใช้) — ปุ่ม "ใช้บ่อย" ในตัวแก้ไขป้าย
import "server-only";
import { prisma } from "@/lib/prisma";

export async function badgeSuggestions(limit = 10): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ t: string }[]>`
    SELECT b->>'t' AS t FROM "Product", jsonb_array_elements("badges") b
    WHERE b->>'t' IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT ${limit}`;
  return rows.map((r) => r.t);
}
