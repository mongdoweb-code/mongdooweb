// POST /api/stock-alerts — "แจ้งเมื่อมีของ" จากหน้าสินค้าที่หมด (JSON: product, name?, phone?, lineId?, email?, website, t)
// ต้องมีช่องทางติดต่ออย่างน้อย 1 ช่อง · จำกัดจำนวนครั้งต่อ IP · ฝากซ้ำ (ช่องทางเดิม สินค้าเดิม) ไม่สร้างรายการใหม่
import { clientIp, overLimit } from "@/lib/rate-limit";
import { StockAlertError, createStockAlert } from "@/lib/stock-alerts";

export async function POST(req: Request) {
  const ip = await clientIp();
  if (overLimit(`stock-alert:${ip}`, 6, 10 * 60e3)) return Response.json({ error: "ส่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const openedAt = Number(body.t ?? 0);
  if (s("website").trim() || (openedAt > 0 && Date.now() - openedAt < 1500)) return Response.json({ ok: true }, { status: 201 });
  try {
    const r = await createStockAlert({ product: s("product"), name: s("name"), phone: s("phone"), lineId: s("lineId"), email: s("email") });
    return Response.json({ ok: true, duplicate: r.duplicate }, { status: 201 });
  } catch (e) {
    if (e instanceof StockAlertError) return Response.json({ error: e.message, fields: e.fields }, { status: e.status });
    throw e;
  }
}
