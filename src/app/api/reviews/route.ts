// POST /api/reviews — รีวิวสินค้าจากผู้ซื้อจริง (multipart)
// ช่อง: product (slug), orderNo, phone, rating (1–5), body, name?, files[] (≤ 3 รูป), website (กับดักบอท), t (เวลาเปิดฟอร์ม)
// ยืนยันด้วยเลขที่คำสั่งซื้อ + เบอร์ (ชำระแล้ว/ส่งแล้ว และมีสินค้านี้) · จำกัดจำนวนครั้งต่อ IP · รีวิวใหม่รออนุมัติเสมอ
import { after } from "next/server";
import { notifyShop, siteUrl } from "@/lib/line";
import { clientIp, overLimit } from "@/lib/rate-limit";
import { REVIEW_FILE_MAX, REVIEW_MAX_FILES, ReviewError, createReview, reviewLineText } from "@/lib/reviews";

const LIMIT_MSG = "ส่งรีวิวบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";

export async function POST(req: Request) {
  const ip = await clientIp();
  const len = Number(req.headers.get("content-length") || 0);
  if (len > REVIEW_MAX_FILES * REVIEW_FILE_MAX + 256 * 1024) return Response.json({ error: "ไฟล์แนบรวมใหญ่เกินไป" }, { status: 413 });
  // นับทุกครั้ง (รวมที่ยืนยันไม่ผ่าน) กันการเดาเลขที่คำสั่งซื้อ/เบอร์
  if (overLimit(`review:${ip}`, 8, 10 * 60e3)) return Response.json({ error: LIMIT_MSG }, { status: 429 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const honeypot = String(form.get("website") ?? "").trim();
  const openedAt = Number(form.get("t") ?? 0);
  if (honeypot || (openedAt > 0 && Date.now() - openedAt < 2000)) return Response.json({ ok: true }, { status: 201 });
  try {
    const r = await createReview(form);
    after(() => notifyShop(reviewLineText(r, siteUrl())).catch(() => {}));
    return Response.json({ ok: true, id: r.id }, { status: 201 });
  } catch (e) {
    if (e instanceof ReviewError) return Response.json({ error: e.message, fields: e.fields }, { status: e.status });
    throw e;
  }
}
