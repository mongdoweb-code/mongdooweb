// GET /admin/reports/export — ส่งออกรายงานยอดขายเป็น CSV ตามตัวกรองเดียวกับหน้ารายงาน
import { logAdmin } from "@/lib/admin-log";
import { getCurrentAdmin } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { addDaysYmd, fromYmd } from "@/lib/doc-calc";
import { VIEWS, parseReportFilter, reportCsv, salesBetween } from "@/lib/sales-report";

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const f = parseReportFilter(Object.fromEntries(new URL(req.url).searchParams));
  const list = await salesBetween(fromYmd(f.from), fromYmd(addDaysYmd(f.to, 1)));
  const rows = reportCsv(f, list);
  await logAdmin(admin.id, "ORDERS_EXPORT", `ส่งออกรายงานยอดขาย (${VIEWS[f.view]}) ${f.from} ถึง ${f.to}`);
  return csvResponse(`sales-${f.view}-${f.from}_${f.to}.csv`, rows);
}
