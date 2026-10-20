// POST /api/line/webhook — รับเหตุการณ์จาก LINE OA (ตั้ง URL นี้ใน LINE Developers › Messaging API › Webhook URL)
// - เชิญ OA เข้ากลุ่มร้าน → บันทึกกลุ่มเป็น "รอเปิดใช้"
// - พนักงานพิมพ์ "ลงทะเบียนแจ้งเตือน" ในแชต OA → บันทึกเป็น "รอเปิดใช้"
// แอดมินต้องกดเปิดใช้ในหลังบ้านก่อนจึงจะได้รับแจ้งเตือน (กันคนนอกที่แอดไลน์ร้านได้รับข้อมูลออเดอร์)
import type { LineTargetKind } from "../../../../../generated/prisma/client";
import { logAdmin } from "@/lib/admin-log";
import { REGISTER_WORDS, replyText, targetName, verifySignature } from "@/lib/line";
import { prisma } from "@/lib/prisma";

type Source = { type: "user" | "group" | "room"; userId?: string; groupId?: string; roomId?: string };
type LineEvent = { type: string; replyToken?: string; source?: Source; message?: { type: string; text?: string } };

const target = (s?: Source): { kind: LineTargetKind; id: string } | null =>
  s?.type === "group" && s.groupId ? { kind: "GROUP", id: s.groupId } : s?.type === "room" && s.roomId ? { kind: "ROOM", id: s.roomId } : s?.type === "user" && s.userId ? { kind: "USER", id: s.userId } : null;

async function register(t: { kind: LineTargetKind; id: string }) {
  const exist = await prisma.lineRecipient.findUnique({ where: { lineId: t.id } });
  if (exist) return exist;
  const r = await prisma.lineRecipient.create({ data: { kind: t.kind, lineId: t.id, name: await targetName(t.kind, t.id) } });
  await logAdmin(null, "LINE", `มีผู้ขอรับแจ้งเตือน LINE: ${r.name} (${t.kind === "USER" ? "ผู้ใช้" : "กลุ่ม"}) — รอเปิดใช้`);
  return r;
}

const reply = (token: string | undefined, text: string) => (token ? replyText(token, text).catch(() => {}) : Promise.resolve());
const PENDING = "บันทึกแล้ว ✅ — ให้เจ้าของร้านเปิดใช้ที่หลังบ้าน › แจ้งเตือน LINE แล้วจะเริ่มได้รับแจ้งเตือนสลิปใหม่";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-line-signature"))) return new Response("invalid signature", { status: 401 });
  let events: LineEvent[] = [];
  try {
    events = JSON.parse(raw).events ?? [];
  } catch {
    return new Response("bad request", { status: 400 });
  }
  for (const ev of events.slice(0, 50)) {
    const t = target(ev.source);
    if (!t) continue;
    try {
      if (ev.type === "join") {
        const r = await register(t);
        await reply(ev.replyToken, r.enabled ? "กลุ่มนี้รับแจ้งเตือนจากร้านมองดูเว็บอยู่แล้ว" : `เชื่อมกลุ่ม "${r.name}" กับระบบร้านมองดูเว็บแล้ว\n${PENDING}`);
      } else if (ev.type === "leave" || ev.type === "unfollow") {
        await prisma.lineRecipient.updateMany({ where: { lineId: t.id }, data: { enabled: false, lastError: ev.type === "leave" ? "OA ถูกนำออกจากกลุ่ม" : "ผู้ใช้บล็อก/เลิกเป็นเพื่อน OA" } });
      } else if (ev.type === "message" && ev.message?.type === "text") {
        const text = (ev.message.text ?? "").trim().toLowerCase();
        if (REGISTER_WORDS.includes(text)) {
          const r = await register(t);
          await reply(ev.replyToken, r.enabled ? "คุณรับแจ้งเตือนจากระบบร้านอยู่แล้ว" : PENDING);
        }
        // ข้อความอื่น: ไม่ตอบ (ปล่อยให้แอดมินตอบลูกค้าในแชต OA ตามปกติ)
      }
    } catch (e) {
      await logAdmin(null, "LINE", `webhook ผิดพลาด: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
    }
  }
  // ต้องตอบ 200 เสมอ (รวมการกด Verify ใน LINE Developers ที่ส่ง events ว่าง)
  return new Response("ok");
}
