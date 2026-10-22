// GET /admin/customers/export.csv — รายชื่อลูกค้าตามตัวกรองเดียวกับหน้า /admin/customers (คำค้น ประเภท แท็ก ยอดซื้อ ซื้อล่าสุด เลขผู้เสียภาษี)
// + แท็ก ยอดซื้อรวม ซื้อล่าสุด จำนวนเอกสาร/คำสั่งซื้อ ยอดค้างชำระ
import { routeAdmin } from "@/lib/auth";
import { fileResponse, csvTime, satangToBaht, toCsv } from "@/lib/csv";
import { parseSegment, segmentActive, segmentCustomers } from "@/lib/customer-segments";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const f = parseSegment(Object.fromEntries(new URL(req.url).searchParams));
  const rows = (await segmentCustomers({ ...f, sort: "code" })).reverse();
  const owe = await prisma.salesDocument.groupBy({ by: ["customerId"], where: { type: "INVOICE", status: { in: ["ISSUED", "PARTIAL"] }, customerId: { not: null } }, _sum: { grandSatang: true, paidSatang: true } });
  const oweOf = new Map(owe.map((o) => [o.customerId, (o._sum.grandSatang ?? 0) - (o._sum.paidSatang ?? 0)]));
  const head = ["รหัส", "ประเภท", "ชื่อ", "เลขผู้เสียภาษี", "สาขา", "ผู้ติดต่อ", "เบอร์โทร", "อีเมล", "ที่อยู่", "ตำบล/แขวง", "อำเภอ/เขต", "จังหวัด", "รหัสไปรษณีย์", "แท็ก", "ยอดซื้อรวม (บาท)", "ซื้อล่าสุด", "จำนวนเอกสาร", "คำสั่งซื้อเว็บ", "ค้างชำระ (บาท)", "หมายเหตุ", "สร้างเมื่อ"];
  const body = rows.map((c) => [
    c.code, c.kind === "COMPANY" ? "นิติบุคคล" : "บุคคลธรรมดา", c.name, c.taxId, c.branch, c.contactName, c.phone ? formatPhone(c.phone) : "", c.email,
    c.addressLine, c.subdistrict, c.district, c.province, c.postalCode, c.tags.join(", "), satangToBaht(c.stats.spendSatang), csvTime(c.stats.lastAt),
    c._count.documents, c._count.orders, satangToBaht(oweOf.get(c.id) ?? 0), c.note, csvTime(c.createdAt),
  ]);
  const filtered = f.q || f.kind || segmentActive(f);
  await prisma.adminLog.create({ data: { type: "CUSTOMER_EXPORT", note: `ส่งออกรายชื่อลูกค้า ${rows.length} ราย${filtered ? " (ตามตัวกรอง)" : ""}`, adminId: admin.id } });
  return fileResponse(toCsv(head, body), `customers-${new Date().toISOString().slice(0, 10)}.csv`);
}
