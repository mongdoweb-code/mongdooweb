// หมายเหตุสถานะงานที่ร้านพิมพ์บ่อย (ชนิดเอกสารเดียวกัน · 180 วันล่าสุด) → แท็กช่วยเลือก
import { prisma } from "@/lib/prisma";
import { workSuggestions, WORK_SUGGEST } from "@/lib/doc-work";

export async function workNoteSuggestions(type: keyof typeof WORK_SUGGEST) {
  const rows = await prisma.$queryRaw<{ n: string }[]>`
    SELECT btrim("workNote") n FROM "SalesDocument"
    WHERE type = ${type}::"DocType" AND "workNote" IS NOT NULL AND btrim("workNote") <> '' AND length("workNote") <= 40
      AND "workAt" > now() - interval '180 days'
    GROUP BY 1 HAVING count(*) >= 2 ORDER BY count(*) DESC, max("workAt") DESC LIMIT 6`;
  return workSuggestions(type, rows.map((r) => r.n));
}
