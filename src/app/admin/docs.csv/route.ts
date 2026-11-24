// GET /admin/docs.csv?type=INVOICE&tab=…&work=todo|done|none&q=…&from=…&to=…&void=show|hide — ส่งออกเอกสารขายตามตัวกรอง (มี BOM ให้ Excel อ่านภาษาไทยได้)
import { docDate, money, ymdBkk } from "@/lib/doc-calc";
import { DOC_META, DOC_ST } from "@/lib/doc-render";
import { cookies } from "next/headers";
import { DOC_VOID_COOKIE, docFilterChips, docWhere, hidesVoid, parseDocFilter } from "@/lib/doc-list";
import { asSnap, isDocType, statusOf, todayYmd, ymdOf } from "@/lib/docs";
import { logAdmin } from "@/lib/admin-log";
import { routeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WORK_META } from "@/lib/doc-work";

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
  const f = parseDocFilter(type, sp, (await cookies()).get(DOC_VOID_COOKIE)?.value);
  const rows = await prisma.salesDocument.findMany({ where: docWhere(type, f), orderBy: [{ issueDate: "asc" }, { docNo: "asc" }], take: 20_000, include: { order: { select: { orderNo: true } }, source: { select: { docNo: true } }, workBy: { select: { displayName: true } } } });
  const head = ["เลขที่", "วันที่", "สถานะ", "รหัสลูกค้า", "ลูกค้า", "เลขผู้เสียภาษี", "โทร", type === "QUOTATION" ? "ยืนราคาถึง" : "ครบกำหนด", "ราคารวมสินค้า", "ส่วนลด", "VAT", "ยอดสุทธิ", "ชำระแล้ว", "คงค้าง", "วิธีชำระ", "อ้างอิง", "คำสั่งซื้อ", "เหตุผลยกเลิก", "สถานะงาน", "หมายเหตุงาน", "ตั้งสถานะงานโดย"];
  const lines = rows.map((d) => {
    const c = asSnap(d.customerSnapshot);
    return [
      d.docNo ?? "ฉบับร่าง", d.issueDate ? docDate(ymdBkk(d.issueDate), "AD") : "", DOC_ST[statusOf(d)][0], c.code, c.name, c.taxId, c.phone,
      docDate(ymdOf(type === "QUOTATION" ? d.validUntil : d.dueDate), "AD"), money(d.subtotalSatang), money(d.discountSatang), money(d.vatSatang), money(d.grandSatang),
      type === "INVOICE" ? money(d.paidSatang) : "", type === "INVOICE" && d.status !== "VOID" ? money(d.grandSatang - d.paidSatang) : "",
      d.paymentMethod, d.source?.docNo, d.order?.orderNo, d.voidReason,
      d.workState ? WORK_META[d.workState].label : "", d.workNote, d.workBy?.displayName,
    ].map(q).join(",");
  });
  // หัวไฟล์: ชื่อเอกสาร + ตัวกรอง · ท้ายไฟล์: ยอดรวม/เฉลี่ย (ไม่นับใบที่ยกเลิก ยกเว้นส่งออกแท็บ "ยกเลิก") — ตรงกับการ์ดยอดรวมในหน้ารายการ
  const voidTab = f.tab === "void";
  const counted = rows.filter((d) => voidTab || d.status !== "VOID");
  const sum = (k: "subtotalSatang" | "discountSatang" | "vatSatang" | "grandSatang" | "paidSatang") => counted.reduce((a, d) => a + d[k], 0);
  const voidN = rows.length - counted.length;
  const pad = (cells: unknown[]) => [...cells, ...Array(Math.max(0, head.length - cells.length)).fill("")].map(q).join(",");
  const at = new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
  const chips = docFilterChips(type, f, todayYmd(), "AD", true);
  const top = [
    pad([`${DOC_META[type].th} — ส่งออกจากหลังบ้าน`]),
    pad([`ตัวกรอง: ${chips.join(" · ") || "ทั้งหมด"} · ${voidTab ? "เฉพาะใบที่ยกเลิก (ไม่นับเป็นยอดขาย)" : voidN ? `ไม่รวมใบที่ยกเลิก ${voidN} ฉบับในยอดรวม` : hidesVoid(f) ? "ไม่รวมใบที่ยกเลิก" : "ไม่มีใบที่ยกเลิก"} · ส่งออกเมื่อ ${at}`]),
  ];
  const owe = type === "INVOICE" ? counted.filter((d) => d.status !== "DRAFT").reduce((a, d) => a + Math.max(0, d.grandSatang - d.paidSatang), 0) : 0;
  const bottom = [
    pad([]),
    pad([`${voidTab ? "ยอดของใบที่ยกเลิก" : "ยอดรวม"} (${counted.length} ฉบับ)`, "", "", "", "", "", "", "", money(sum("subtotalSatang")), money(sum("discountSatang")), money(sum("vatSatang")), money(sum("grandSatang")), type === "INVOICE" ? money(sum("paidSatang")) : "", type === "INVOICE" ? money(owe) : ""]),
    pad(["เฉลี่ยต่อฉบับ", "", "", "", "", "", "", "", "", "", "", counted.length ? money(Math.round(sum("grandSatang") / counted.length)) : "0.00"]),
  ];
  await logAdmin(admin.id, "ORDERS_EXPORT", `ส่งออก CSV ${DOC_META[type].th} ${rows.length} รายการ`);
  const name = `${DOC_META[type].short}-${ymdBkk(new Date())}.csv`;
  return new Response("﻿" + [...top, head.map(q).join(","), ...lines, ...bottom].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
