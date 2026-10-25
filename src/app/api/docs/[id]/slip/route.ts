// POST /api/docs/:id/slip — ลูกค้าแนบสลิปชำระใบแจ้งหนี้ผ่านลิงก์ลับ (multipart: t, slip, paidAt, amount) → รอร้านตรวจ (U26)
import { after } from "next/server";
import { DOC_SLIP_MAX_BYTES, DocOnlineError, attachDocSlip, docSlipMessage } from "@/lib/doc-online";
import { notifySafe } from "@/lib/order-notify";
import { clientIp, overLimit } from "@/lib/rate-limit";

export async function POST(req: Request, ctx: RouteContext<"/api/docs/[id]/slip">) {
  if (overLimit(`doc-slip:${await clientIp()}`, 10, 10 * 60e3))
    return Response.json({ error: "แนบสลิปบ่อยเกินไป กรุณารอสักครู่ หรือติดต่อร้านทาง LINE" }, { status: 429 });
  const len = Number(req.headers.get("content-length") || 0);
  if (len > DOC_SLIP_MAX_BYTES + 64 * 1024) return Response.json({ error: "ไฟล์ใหญ่เกิน 5 MB กรุณาเลือกไฟล์ใหม่", fields: ["slip"] }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    const { id } = await ctx.params;
    const slip = form.get("slip");
    const r = await attachDocSlip({
      id: decodeURIComponent(id).slice(0, 40),
      token: String(form.get("t") ?? ""),
      file: slip instanceof File ? slip : null,
      paidAt: String(form.get("paidAt") ?? ""),
      amount: String(form.get("amount") ?? ""),
    });
    after(() => notifySafe(`สลิปใบแจ้งหนี้ ${r.docNo}`, () => docSlipMessage(r)));
    return Response.json({ ok: true, amountSatang: r.amountSatang }, { status: 201 });
  } catch (e) {
    if (e instanceof DocOnlineError) return Response.json({ error: e.message, fields: e.fields }, { status: e.status });
    throw e;
  }
}
