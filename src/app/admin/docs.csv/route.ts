// GET /admin/docs.csv?type=INVOICE&tab=…&q=…&from=…&to=… — ส่งออกเอกสารขายตามตัวกรอง (มี BOM ให้ Excel อ่านภาษาไทยได้)
import { docDate, money, ymdBkk } from "@/lib/doc-calc";
import { DOC_META, DOC_ST } from "@/lib/doc-render";
import { docWhere, parseDocFilter } from "@/lib/doc-list";
import { asSnap, isDocType, statusOf, ymdOf } from "@/lib/docs";
import { logAdmin } from "@/lib/admin-log";
import { routeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// กัน CSV/formula injection
const q = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const type = isDocType(sp.type ?? "") ? (sp.type as keyof typeof DOC_META) : "INVOICE";
  const f = parseDocFilter(type, sp);
  const rows = await prisma.salesDocument.findMany({ where: docWhere(type, f), orderBy: [{ issueDate: "asc" }, { docNo: "asc" }], take: 20_000, include: { order: { select: { orderNo: true } }, source: { select: { docNo: true } } } });
  const head = ["เลขที่", "วันที่", "สถานะ", "รหัสลูกค้า", "ลูกค้า", "เลขผู้เสียภาษี", "โทร", type === "QUOTATION" ? "ยืนราคาถึง" : "ครบกำหนด", "ราคารวมสินค้า", "ส่วนลด", "VAT", "ยอดสุทธิ", "ชำระแล้ว", "คงค้าง", "วิธีชำระ", "อ้างอิง", "คำสั่งซื้อ", "เหตุผลยกเลิก"];
  const lines = rows.map((d) => {
    const c = asSnap(d.customerSnapshot);
    return [
      d.docNo ?? "ฉบับร่าง", d.issueDate ? docDate(ymdBkk(d.issueDate), "AD") : "", DOC_ST[statusOf(d)][0], c.code, c.name, c.taxId, c.phone,
      docDate(ymdOf(type === "QUOTATION" ? d.validUntil : d.dueDate), "AD"), money(d.subtotalSatang), money(d.discountSatang), money(d.vatSatang), money(d.grandSatang),
      type === "INVOICE" ? money(d.paidSatang) : "", type === "INVOICE" && d.status !== "VOID" ? money(d.grandSatang - d.paidSatang) : "",
      d.paymentMethod, d.source?.docNo, d.order?.orderNo, d.voidReason,
    ].map(q).join(",");
  });
  await logAdmin(admin.id, "ORDERS_EXPORT", `ส่งออก CSV ${DOC_META[type].th} ${rows.length} รายการ`);
  const name = `${DOC_META[type].short}-${ymdBkk(new Date())}.csv`;
  return new Response("﻿" + [head.map(q).join(","), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
