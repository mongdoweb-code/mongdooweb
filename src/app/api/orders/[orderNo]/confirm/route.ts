// POST /api/orders/:orderNo/confirm — ลูกค้ายืนยันคำสั่งซื้อจากขั้นชำระเงิน (JSON: { phone, mode: "cod" | "later" })
// cod = เข้าคิว "รอยืนยัน COD" + แจ้ง LINE ร้าน · later = โอนทีหลัง · ทั้งสองแบบส่งอีเมล "ได้รับคำสั่งซื้อ" (ถ้าเปิดใช้และมีอีเมล)
import { after } from "next/server";
import { sendOrderEmail } from "@/lib/email";
import { notifyCodOrder } from "@/lib/order-notify";
import { OrderError, confirmCheckout } from "@/lib/orders";
import { clientIp, overLimit } from "@/lib/rate-limit";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[orderNo]/confirm">) {
  if (overLimit(`order-confirm:${await clientIp()}`, 20, 10 * 60e3))
    return Response.json({ error: "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่" }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    const { orderNo } = await ctx.params;
    const r = await confirmCheckout({ orderNo: decodeURIComponent(orderNo), phone: String(body.phone ?? ""), mode: body.mode === "cod" ? "cod" : "later" });
    after(async () => {
      if (r.changed) await notifyCodOrder(r.orderNo);
      await sendOrderEmail(r.orderNo, "ORDER_RECEIVED");
    });
    return Response.json(r);
  } catch (e) {
    if (e instanceof OrderError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
