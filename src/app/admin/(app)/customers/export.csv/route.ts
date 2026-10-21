// GET /admin/customers/export.csv — รายชื่อลูกค้าทั้งหมด (หรือตามคำค้น/ประเภทในหน้า /admin/customers) + จำนวนเอกสาร/คำสั่งซื้อ/ยอดค้างชำระ
import type { Prisma } from "../../../../../../generated/prisma/client";
import { routeAdmin } from "@/lib/auth";
import { csvResponse, csvTime, satangToBaht, toCsv } from "@/lib/csv";
import { formatPhone, phoneDigits } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const kind = sp.get("kind") === "COMPANY" ? "COMPANY" : sp.get("kind") === "PERSON" ? "PERSON" : "";
  const d = phoneDigits(q);
  const where: Prisma.CustomerWhereInput = {
    ...(kind ? { kind } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: q }, { contactName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, ...(d.length >= 3 ? [{ phone: { contains: d } }, { taxId: { contains: d } }] : [])] } : {}),
  };
  const rows = await prisma.customer.findMany({ where, orderBy: { code: "asc" }, include: { _count: { select: { documents: true, orders: true } } } });
  const owe = await prisma.salesDocument.groupBy({ by: ["customerId"], where: { type: "INVOICE", status: { in: ["ISSUED", "PARTIAL"] }, customerId: { not: null } }, _sum: { grandSatang: true, paidSatang: true } });
  const oweOf = new Map(owe.map((o) => [o.customerId, (o._sum.grandSatang ?? 0) - (o._sum.paidSatang ?? 0)]));
  const head = ["รหัส", "ประเภท", "ชื่อ", "เลขผู้เสียภาษี", "สาขา", "ผู้ติดต่อ", "เบอร์โทร", "อีเมล", "ที่อยู่", "ตำบล/แขวง", "อำเภอ/เขต", "จังหวัด", "รหัสไปรษณีย์", "จำนวนเอกสาร", "คำสั่งซื้อเว็บ", "ค้างชำระ (บาท)", "หมายเหตุ", "สร้างเมื่อ"];
  const body = rows.map((c) => [
    c.code, c.kind === "COMPANY" ? "นิติบุคคล" : "บุคคลธรรมดา", c.name, c.taxId, c.branch, c.contactName, c.phone ? formatPhone(c.phone) : "", c.email,
    c.addressLine, c.subdistrict, c.district, c.province, c.postalCode, c._count.documents, c._count.orders, satangToBaht(oweOf.get(c.id) ?? 0), c.note, csvTime(c.createdAt),
  ]);
  await prisma.adminLog.create({ data: { type: "CUSTOMER_EXPORT", note: `ส่งออกรายชื่อลูกค้า ${rows.length} ราย${q || kind ? " (ตามตัวกรอง)" : ""}`, adminId: admin.id } });
  return csvResponse(toCsv(head, body), `customers-${new Date().toISOString().slice(0, 10)}.csv`);
}
