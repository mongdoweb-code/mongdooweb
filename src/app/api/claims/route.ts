// POST /api/claims — แจ้งเคลมประกัน / คืน-เปลี่ยนสินค้า (multipart: orderNo, phone, kind, items JSON, issue, files[] ≤ 4)
// ยืนยันด้วยเลขที่คำสั่งซื้อ + เบอร์โทร · จำกัดจำนวนครั้งต่อ IP และต่อเบอร์ · แจ้ง LINE ร้านหลังตอบลูกค้า
import { after } from "next/server";
import { CLAIM_FILE_MAX, CLAIM_MAX_FILES, ClaimError, claimMessage, createClaim } from "@/lib/claims";
import { phoneDigits } from "@/lib/format";
import { notifySafe } from "@/lib/order-notify";
import { clientIp, overLimit } from "@/lib/rate-limit";

const LIMIT_MSG = "ส่งเรื่องบ่อยเกินไป กรุณารอสักครู่ หรือติดต่อร้านทาง LINE";

export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > CLAIM_MAX_FILES * CLAIM_FILE_MAX + 256 * 1024) return Response.json({ error: "รูปแนบรวมใหญ่เกินไป" }, { status: 413 });
  if (overLimit(`claim:${await clientIp()}`, 6, 10 * 60e3)) return Response.json({ error: LIMIT_MSG }, { status: 429 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const phone = phoneDigits(String(form.get("phone") ?? "")).slice(0, 12);
  if (phone && overLimit(`claim-phone:${phone}`, 5, 60 * 60e3)) return Response.json({ error: LIMIT_MSG }, { status: 429 });
  try {
    const { claim, order, windows } = await createClaim(form);
    after(() => notifySafe(`เคลม ${claim.claimNo}`, () => claimMessage(claim, order.orderNo)));
    return Response.json(
      { ok: true, claimNo: claim.claimNo, kind: claim.kind, inWarranty: claim.inWarranty, warrantyUntil: windows.warrantyUntil?.toISOString() ?? null },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ClaimError) return Response.json({ error: e.message, fields: e.fields }, { status: e.status });
    throw e;
  }
}
