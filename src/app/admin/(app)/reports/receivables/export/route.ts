// GET /admin/reports/receivables/export — ลูกหนี้ค้างชำระเป็น CSV (1 แถว = 1 ใบแจ้งหนี้)
import { logAdmin } from "@/lib/admin-log";
import { routeAdmin } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { docDate, ymdBkk } from "@/lib/doc-calc";
import { AGE_BUCKETS, receivables } from "@/lib/finance";

export async function GET() {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const today = ymdBkk(new Date());
  const r = await receivables(today);
  const b = (x: number) => (x / 100).toFixed(2);
  const label = Object.fromEntries(AGE_BUCKETS.map((x) => [x.key, x.label]));
  const rows: unknown[][] = [
    ["ลูกหนี้ค้างชำระ ณ", docDate(today, "BE")],
    [],
    ["รหัสลูกค้า", "ลูกค้า", "เบอร์โทร", "เลขที่ใบแจ้งหนี้", "วันที่", "ครบกำหนด", "เลยกำหนด (วัน)", "อายุหนี้", "ยอดเอกสาร", "ชำระแล้ว", "ค้างชำระ"],
    ...r.customers.flatMap((c) => c.invoices.map((i) => [c.code, c.name, c.phone, i.docNo, docDate(i.issueYmd, "BE"), docDate(i.dueYmd, "BE"), i.days, label[i.bucket], b(i.grand), b(i.paid), b(i.outstanding)])),
    ["", "", "", "", "", "", "", "รวม", "", "", b(r.total)],
  ];
  await logAdmin(admin.id, "ORDERS_EXPORT", `ส่งออกลูกหนี้ค้างชำระ (${r.invoiceCount} ใบ)`);
  return csvResponse(`receivables-${today}.csv`, rows);
}
