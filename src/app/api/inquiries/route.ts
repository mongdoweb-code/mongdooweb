// POST /api/inquiries — ฟอร์ม "ขอใบเสนอราคา" (kind=QUOTE, แนบรูปได้ 3 รูป) และ "ติดต่อเรา" (kind=CONTACT)
// multipart: kind, name, phone, email?, company?, message, items? (JSON { slug: qty }), files[]?, website (honeypot), t (เวลาเปิดฟอร์ม)
// กันสแปม: honeypot + ส่งเร็วผิดปกติ (ตอบสำเร็จแต่ไม่บันทึก) + จำกัดจำนวนครั้งต่อ IP และต่อเบอร์โทร
import { after } from "next/server";
import { phoneDigits } from "@/lib/format";
import { INQUIRY_FILE_MAX, INQUIRY_MAX_FILES, InquiryError, createInquiry, inquiryMessage } from "@/lib/inquiries";
import { notifyShop } from "@/lib/line";
import { clientIp, overLimit } from "@/lib/rate-limit";

const LIMIT_MSG = "ส่งข้อความบ่อยเกินไป กรุณารอสักครู่ หรือติดต่อร้านทาง LINE";

export async function POST(req: Request) {
  const ip = await clientIp();
  const len = Number(req.headers.get("content-length") || 0);
  if (len > INQUIRY_MAX_FILES * INQUIRY_FILE_MAX + 256 * 1024) return Response.json({ error: "ไฟล์แนบรวมใหญ่เกินไป" }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const kind = form.get("kind") === "QUOTE" ? "QUOTE" : "CONTACT";

  // บอทมักกรอกทุกช่อง (รวมช่องที่ซ่อนไว้) หรือส่งทันทีที่โหลดหน้า → ตอบเหมือนสำเร็จ แต่ไม่บันทึก/ไม่แจ้งร้าน
  const honeypot = String(form.get("website") ?? "").trim();
  const openedAt = Number(form.get("t") ?? 0);
  if (honeypot || (openedAt > 0 && Date.now() - openedAt < 2500)) return Response.json({ ok: true }, { status: 201 });

  if (overLimit(`inq:${ip}`, 5, 10 * 60e3)) return Response.json({ error: LIMIT_MSG }, { status: 429 });
  const phone = phoneDigits(String(form.get("phone") ?? "")).slice(0, 12);
  if (phone && overLimit(`inq-phone:${phone}`, 5, 60 * 60e3)) return Response.json({ error: LIMIT_MSG }, { status: 429 });

  try {
    const inq = await createInquiry(form, kind, ip);
    after(() => notifyShop(inquiryMessage(inq, kind)).catch(() => {}));
    return Response.json({ ok: true, id: inq.id }, { status: 201 });
  } catch (e) {
    if (e instanceof InquiryError) return Response.json({ error: e.message, fields: e.fields }, { status: e.status });
    throw e;
  }
}
