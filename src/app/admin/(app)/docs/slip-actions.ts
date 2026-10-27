"use server";
// สลิปที่ลูกค้าแนบผ่านลิงก์ใบแจ้งหนี้ (A20): อนุมัติ = รับชำระ + ออกใบเสร็จอัตโนมัติ · ปฏิเสธพร้อมเหตุผล (ลูกค้าเห็นในลิงก์)
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/doc-calc";
import { DOC_SLIP_REJECT_REASONS, approveDocSlip, rejectDocSlip } from "@/lib/doc-online";
import { DocUserError } from "@/lib/doc-payments";
import { afterOrderPaid } from "@/lib/order-confirm";
import { prisma } from "@/lib/prisma";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const back = (f: FormData, ivId: string) => (str(f, "ret") === "queue" ? "/admin/docs/slips" : `/admin/docs/INVOICE/${ivId}`);

export async function approveDocSlipAction(f: FormData) {
  const admin = await requireAdmin();
  const slipId = str(f, "slipId", 40);
  const slip = await prisma.docSlip.findUnique({ where: { id: slipId }, select: { documentId: true } });
  if (!slip) redirect("/admin/docs/slips");
  try {
    const r = await approveDocSlip(slipId, admin.id);
    afterOrderPaid(r.orderPaid);
    await logAdmin(admin.id, "DOC", `อนุมัติสลิปจากลิงก์ ${r.ivNo} → ออกใบเสร็จ ${r.rcNo}${r.orderPaid ? ` · คำสั่งซื้อ ${r.orderPaid.orderNo} ชำระแล้ว` : ""}`);
    redirect(`${back(f, slip.documentId)}?paid=${encodeURIComponent(r.rcNo)}&rc=${r.rcId}`);
  } catch (e) {
    if (e instanceof DocUserError) redirect(`${back(f, slip.documentId)}?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
}

export async function rejectDocSlipAction(f: FormData) {
  const admin = await requireAdmin();
  const slipId = str(f, "slipId", 40);
  const r0 = str(f, "reason", 100);
  const reason = (DOC_SLIP_REJECT_REASONS.includes(r0) ? r0 : DOC_SLIP_REJECT_REASONS.at(-1)!) + (str(f, "note", 200) ? ` — ${str(f, "note", 200)}` : "");
  const slip = await rejectDocSlip(slipId, admin.id, reason);
  if (slip) {
    const d = await prisma.salesDocument.findUnique({ where: { id: slip.documentId }, select: { docNo: true } });
    await logAdmin(admin.id, "DOC", `ปฏิเสธสลิปจากลิงก์ ${d?.docNo ?? ""} ยอด ${money(slip.amountSatang)}: ${reason}`);
    redirect(back(f, slip.documentId));
  }
  redirect("/admin/docs/slips");
}
