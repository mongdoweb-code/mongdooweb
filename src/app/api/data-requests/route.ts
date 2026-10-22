// POST /api/data-requests — แบบฟอร์มใช้สิทธิ์ PDPA (/privacy/request): ขอดู/ลบ/แก้ไข/คัดค้าน → DataRequest (เจ้าของร้านจัดการในหลังบ้าน)
// JSON: { kind, name, phone, email?, detail, consent, website (honeypot), t (เวลาเปิดฟอร์ม) }
// กันสแปม: honeypot + ส่งเร็วผิดปกติ (ตอบสำเร็จแต่ไม่บันทึก) + จำกัด 3 ครั้ง/ชั่วโมง ต่อ IP และ 3 ครั้ง/วัน ต่อเบอร์
import { after } from "next/server";
import { logAdmin } from "@/lib/admin-log";
import { notifyShop, siteUrl } from "@/lib/line";
import { DR_KIND, DataRequestError, drIpHash, validateDataRequest } from "@/lib/pdpa";
import { prisma } from "@/lib/prisma";
import { clientIp, overLimit } from "@/lib/rate-limit";

const LIMIT_MSG = "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่ หรือติดต่อร้านทาง LINE/โทรศัพท์";

export async function POST(req: Request) {
  const ip = await clientIp();
  if (Number(req.headers.get("content-length") || 0) > 32 * 1024) return Response.json({ error: "ข้อมูลยาวเกินไป" }, { status: 413 });
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const openedAt = Number(raw.t ?? 0);
  if (String(raw.website ?? "").trim() || (openedAt > 0 && Date.now() - openedAt < 2500)) return Response.json({ ok: true }, { status: 201 });
  if (overLimit(`pdpa:${ip}`, 3, 60 * 60e3)) return Response.json({ error: LIMIT_MSG }, { status: 429 });
  try {
    const v = validateDataRequest(raw);
    if (overLimit(`pdpa-phone:${v.phone}`, 3, 24 * 3600e3)) return Response.json({ error: LIMIT_MSG }, { status: 429 });
    const r = await prisma.dataRequest.create({ data: { ...v, ipHash: drIpHash(ip) } });
    await logAdmin(null, "PDPA", `คำขอใหม่: ${DR_KIND[v.kind]} — ${v.name}`, { entity: `DataRequest:${r.id}` });
    after(() => notifyShop(`🔒 คำขอข้อมูลส่วนบุคคล (PDPA)\n${DR_KIND[v.kind]} — ${v.name}\nต้องตอบภายใน 30 วัน\n${siteUrl()}/admin/data-requests/${r.id}`).catch(() => {}));
    return Response.json({ ok: true, id: r.id }, { status: 201 });
  } catch (e) {
    if (e instanceof DataRequestError) return Response.json({ error: e.message, fields: e.fields }, { status: e.status });
    throw e;
  }
}
