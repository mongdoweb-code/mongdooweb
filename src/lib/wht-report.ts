// รายงานภาษีถูกหัก ณ ที่จ่าย (ลูกค้าหักไว้ตอนจ่ายเงิน) — ใช้คู่กับหนังสือรับรอง 50 ทวิ เพื่อเครดิตภาษีตอนยื่น ภ.ง.ด.
// นับเฉพาะการรับชำระที่ไม่ถูกยกเลิก ตามวันที่รับเงิน (เวลาไทย)
import "server-only";
import { fmtTaxId, fromYmd, ymdBkk } from "@/lib/doc-calc";
import { asSnap } from "@/lib/docs";
import { prisma } from "@/lib/prisma";
import { whtBase } from "@/lib/wht";

export type WhtRow = {
  id: string; date: string; customer: string; taxId: string; ivId: string; ivNo: string; rcId: string | null; rcNo: string;
  amountSatang: number; baseSatang: number; rateBp: number; whtSatang: number; netSatang: number; certNo: string; certAt: string | null;
};

export const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
export const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function whtReport(month: string, only: "all" | "missing" = "all") {
  const rows = await prisma.docPayment.findMany({
    where: { whtSatang: { gt: 0 }, voided: false, paidAt: { gte: fromYmd(`${month}-01`), lt: fromYmd(`${nextMonth(month)}-01`) }, ...(only === "missing" ? { whtCertAt: null } : {}) },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    include: { invoice: { select: { id: true, docNo: true, customerSnapshot: true, grandSatang: true, vatSatang: true } }, receipt: { select: { id: true, docNo: true } } },
  });
  const out: WhtRow[] = rows.map((p) => {
    const c = asSnap(p.invoice.customerSnapshot);
    return {
      id: p.id, date: ymdBkk(p.paidAt), customer: c.name ?? "—", taxId: c.taxId ? fmtTaxId(c.taxId) : "", ivId: p.invoice.id, ivNo: p.invoice.docNo ?? "",
      rcId: p.receipt?.id ?? null, rcNo: p.receipt?.docNo ?? "", amountSatang: p.amountSatang, baseSatang: whtBase(p.amountSatang, p.invoice), rateBp: p.whtRateBp,
      whtSatang: p.whtSatang, netSatang: p.amountSatang - p.whtSatang, certNo: p.whtCertNo ?? "", certAt: p.whtCertAt ? ymdBkk(p.whtCertAt) : null,
    };
  });
  const sum = out.reduce((s, r) => ({ base: s.base + r.baseSatang, wht: s.wht + r.whtSatang, net: s.net + r.netSatang, missing: s.missing + (r.certAt ? 0 : 1) }), { base: 0, wht: 0, net: 0, missing: 0 });
  // ทั้งหมดที่ยังไม่ได้รับหนังสือรับรอง (ทุกเดือน) — เตือนให้ทวงจากลูกค้า
  const missingAll = await prisma.docPayment.count({ where: { whtSatang: { gt: 0 }, voided: false, whtCertAt: null } });
  return { rows: out, sum, missingAll };
}
