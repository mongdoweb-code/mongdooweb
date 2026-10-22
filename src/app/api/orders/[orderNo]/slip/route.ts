// POST /api/orders/:orderNo/slip — แนบสลิป (multipart: phone, slip, paidAt, amount)
// ใช้ทั้งขั้นที่ 3 ของหน้าชำระเงิน, การแนบสลิปใหม่ และการแนบสลิปเพิ่ม (U19) จากหน้าติดตามคำสั่งซื้อ
import { after } from "next/server";
import { sendOrderEmail } from "@/lib/email";
import { notifySlipUploaded } from "@/lib/line";
import { OrderError, SLIP_MAX_BYTES, attachSlip } from "@/lib/orders";
import { clientIp, overLimit } from "@/lib/rate-limit";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[orderNo]/slip">) {
  if (overLimit(`slip:${await clientIp()}`, 10, 10 * 60e3))
    return Response.json({ error: "แนบสลิปบ่อยเกินไป กรุณารอสักครู่ หรือติดต่อร้านทาง LINE" }, { status: 429 });
  // กันไฟล์ใหญ่ผิดปกติก่อนอ่านทั้งก้อน (เผื่อข้อมูลฟอร์มอื่นอีกเล็กน้อย)
  const len = Number(req.headers.get("content-length") || 0);
  if (len > SLIP_MAX_BYTES + 64 * 1024) return Response.json({ error: "ไฟล์ใหญ่เกิน 5 MB กรุณาเลือกไฟล์ใหม่", fields: ["slip"] }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    const { orderNo } = await ctx.params;
    const slip = form.get("slip");
    const result = await attachSlip({
      orderNo: decodeURIComponent(orderNo),
      phone: String(form.get("phone") ?? ""),
      file: slip instanceof File ? slip : null,
      paidAt: String(form.get("paidAt") ?? ""),
      amount: String(form.get("amount") ?? ""),
    });
    // แจ้งเตือนร้านทาง LINE หลังตอบลูกค้าแล้ว (ไม่ทำให้การแนบสลิปช้าหรือล้ม)
    after(async () => {
      await notifySlipUploaded(result.orderNo);
      // อีเมล "ได้รับคำสั่งซื้อ" (ส่งครั้งเดียวต่อคำสั่งซื้อ)
      await sendOrderEmail(result.orderNo, "ORDER_RECEIVED");
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return Response.json({ error: e.message, fields: e.fields }, { status: e.status });
    throw e;
  }
}
