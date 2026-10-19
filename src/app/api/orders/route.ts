// POST /api/orders — สร้าง (หรือแก้) คำสั่งซื้อจากขั้น "ข้อมูลจัดส่ง" ของหน้าชำระเงิน
// body: { items: { slug: qty }, shipping: "std" | "express", address: {...}, orderNo?: string }
import { OrderError, saveCheckoutOrder } from "@/lib/orders";
import { clientIp, overLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (overLimit(`order:${await clientIp()}`, 20, 10 * 60e3))
    return Response.json({ error: "ส่งคำสั่งซื้อบ่อยเกินไป กรุณารอสักครู่" }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    const address = body.address && typeof body.address === "object" ? (body.address as Record<string, unknown>) : {};
    const order = await saveCheckoutOrder({ items: body.items, shipping: body.shipping, address, orderNo: body.orderNo });
    return Response.json(order, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return Response.json({ error: e.message, fields: e.fields }, { status: e.status });
    throw e;
  }
}
