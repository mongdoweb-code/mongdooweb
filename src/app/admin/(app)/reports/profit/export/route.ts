// GET /admin/reports/profit/export — รายงานกำไรเป็น CSV (เจ้าของร้านเท่านั้น — มีต้นทุน)
import { logAdmin } from "@/lib/admin-log";
import { routeAdmin } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { addDaysYmd, fromYmd } from "@/lib/doc-calc";
import { PROFIT_VIEWS, costsFor, parseReportFilter, profitBy, profitCsv, salesBetween, type ProfitView } from "@/lib/sales-report";

export async function GET(req: Request) {
  const admin = await routeAdmin(true);
  if (admin instanceof Response) return admin;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = parseReportFilter(sp);
  const by: ProfitView = (sp.by ?? "") in PROFIT_VIEWS ? (sp.by as ProfitView) : "product";
  const list = await salesBetween(fromYmd(f.from), fromYmd(addDaysYmd(f.to, 1)));
  const rows = profitBy(list, await costsFor(list), by);
  await logAdmin(admin.id, "ORDERS_EXPORT", `ส่งออกรายงานกำไร (${PROFIT_VIEWS[by]}) ${f.from} ถึง ${f.to}`);
  return csvResponse(`profit-${by}-${f.from}_${f.to}.csv`, profitCsv(by, rows));
}
