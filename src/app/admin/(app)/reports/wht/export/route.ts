// GET /admin/reports/wht/export?month=YYYY-MM — ภาษีถูกหัก ณ ที่จ่ายเป็น CSV (ให้นักบัญชีใช้เครดิตภาษี)
import { logAdmin } from "@/lib/admin-log";
import { routeAdmin } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { docDate, fmtTaxId, ymdBkk } from "@/lib/doc-calc";
import { prisma } from "@/lib/prisma";
import { monthRe, whtReport } from "@/lib/wht-report";

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const m = new URL(req.url).searchParams.get("month") ?? "";
  const month = monthRe.test(m) ? m : ymdBkk(new Date()).slice(0, 7);
  const [s, r] = await Promise.all([prisma.shopSetting.findUnique({ where: { id: "shop" } }), whtReport(month)]);
  const b = (x: number) => (x / 100).toFixed(2);
  const rows: unknown[][] = [
    ["ภาษีถูกหัก ณ ที่จ่าย"],
    ["เดือน", `${month.slice(5, 7)}/${Number(month.slice(0, 4)) + 543}`],
    ["ผู้ถูกหักภาษี", s?.legalName ?? ""],
    ["เลขประจำตัวผู้เสียภาษีอากร", s?.taxId ? fmtTaxId(s.taxId) : ""],
    [],
    ["ลำดับ", "วันที่รับเงิน", "ผู้หักภาษี (ลูกค้า)", "เลขประจำตัวผู้เสียภาษีของผู้หัก", "ใบแจ้งหนี้", "ใบเสร็จ", "ยอดตัดหนี้", "ฐานภาษี", "อัตรา (%)", "ภาษีถูกหัก", "รับจริง", "เลขที่หนังสือรับรอง", "วันที่ได้รับหนังสือรับรอง"],
    ...r.rows.map((x, i) => [i + 1, docDate(x.date, "BE"), x.customer, x.taxId, x.ivNo, x.rcNo, b(x.amountSatang), b(x.baseSatang), x.rateBp / 100, b(x.whtSatang), b(x.netSatang), x.certNo, x.certAt ? docDate(x.certAt, "BE") : "ยังไม่ได้รับ"]),
    ["", "", "รวม", "", "", "", "", b(r.sum.base), "", b(r.sum.wht), b(r.sum.net), "", ""],
  ];
  await logAdmin(admin.id, "ORDERS_EXPORT", `ส่งออกรายงานภาษีถูกหัก ณ ที่จ่าย ${month} (${r.rows.length} รายการ)`);
  return csvResponse(`wht-${month}.csv`, rows);
}
