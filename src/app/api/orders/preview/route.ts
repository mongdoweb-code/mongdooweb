// POST /api/orders/preview — ยอดที่ server คำนวณสำหรับแสดงในหน้าชำระเงิน (ยังไม่บันทึก)
// body: { items, shipping, zip?, payment?, coupon?, phone?, orderNo? }
// คืนยอดสินค้า ส่วนลดคูปอง (หรือข้อความว่าใช้ไม่ได้) ค่าส่ง (ตามยอด/น้ำหนัก/พื้นที่ห่างไกล) ค่าธรรมเนียม COD และยอดรวม
import { OrderError, previewCheckout } from "@/lib/orders";
import { clientIp, overLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (overLimit(`order-preview:${await clientIp()}`, 120, 10 * 60e3))
    return Response.json({ error: "ตรวจยอดบ่อยเกินไป กรุณารอสักครู่" }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    const q = await previewCheckout({
      items: body.items, shipping: body.shipping, zip: body.zip, payment: body.payment, coupon: body.coupon, phone: body.phone, orderNo: body.orderNo,
    });
    return Response.json(q, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof OrderError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
