// GET /admin/reports/vat/export?month=YYYY-MM — รายงานภาษีขายเป็น CSV (รูปแบบที่นักบัญชีใช้กรอก ภ.พ.30)
import { logAdmin } from "@/lib/admin-log";
import { getCurrentAdmin } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { docDate, fmtTaxId, ymdBkk } from "@/lib/doc-calc";
import { prisma } from "@/lib/prisma";
import { vatReport } from "@/lib/sales-report";

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const m = new URL(req.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : ymdBkk(new Date()).slice(0, 7);
  const [s, r] = await Promise.all([prisma.shopSetting.findUnique({ where: { id: "shop" } }), vatReport(month)]);
  const b = (x: number) => (x / 100).toFixed(2);
  const rows: unknown[][] = [
    ["รายงานภาษีขาย"],
    ["เดือนภาษี", `${month.slice(5, 7)}/${Number(month.slice(0, 4)) + 543}`],
    ["ชื่อผู้ประกอบการ", s?.legalName ?? ""],
    ["เลขประจำตัวผู้เสียภาษีอากร", s?.taxId ? fmtTaxId(s.taxId) : ""],
    ["สถานประกอบการ", s?.branch || "สำนักงานใหญ่"],
    [],
    ["ลำดับ", "วันที่", "เลขที่ใบกำกับภาษี", "ชื่อผู้ซื้อสินค้า/ผู้รับบริการ", "เลขประจำตัวผู้เสียภาษีอากรของผู้ซื้อ", "สถานประกอบการ", "มูลค่าสินค้าหรือบริการ", "จำนวนเงินภาษีมูลค่าเพิ่ม", "จำนวนเงินรวม"],
    ...r.rows.map((x) => [x.no, docDate(x.date, "BE"), x.docNo, x.buyer, x.taxId, x.branch, b(x.baseSatang), b(x.vatSatang), b(x.totalSatang)]),
    ["", "", "", "รวม", "", "", b(r.sum.base), b(r.sum.vat), b(r.sum.total)],
  ];
  if (r.voided.length) rows.push([], [`ไม่รวมใบที่ยกเลิก ${r.voided.length} ฉบับ: ${r.voided.join(" ")}`]);
  await logAdmin(admin.id, "ORDERS_EXPORT", `ส่งออกรายงานภาษีขาย ${month} (${r.rows.length} ฉบับ)`);
  return csvResponse(`vat-sales-${month}.csv`, rows);
}
