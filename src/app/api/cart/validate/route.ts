// POST /api/cart/validate — ตรวจตะกร้ากับฐานข้อมูลทุกครั้งที่ลูกค้าเปิดตะกร้า/หน้าชำระเงิน
// body: { items: { slug: qty }, seen?: { slug: ราคาที่ลูกค้าเห็นล่าสุด (บาท) } }
// ตอบ: ราคาปัจจุบัน, จำนวนที่สั่งได้จริง, สถานะแต่ละรายการ (ราคาเปลี่ยน/ของหมด/ปิดขาย) และค่าส่งโดยประมาณ
import { validateCart } from "@/lib/orders";
import { clientIp, overLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (overLimit(`cart:${await clientIp()}`, 120, 10 * 60e3))
    return Response.json({ error: "ตรวจตะกร้าบ่อยเกินไป กรุณารอสักครู่" }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const result = await validateCart(body?.items, body?.seen);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
