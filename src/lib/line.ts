// แจ้งเตือนร้านผ่าน LINE Messaging API (LINE Notify ปิดบริการแล้ว)
// ค่าลับอยู่ใน .env เท่านั้น: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET — ไม่เก็บในฐานข้อมูล/ไม่แสดงในหน้าเว็บ
// ส่งถึงเฉพาะผู้รับที่แอดมินกด "เปิดใช้" ในหลังบ้าน · ส่งไม่สำเร็จไม่ทำให้งานหลัก (แนบสลิป) ล้ม แค่บันทึกข้อผิดพลาดไว้
import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { LineTargetKind } from "../../generated/prisma/client";
import { logAdmin } from "@/lib/admin-log";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";

// LINE_API_BASE ใช้เฉพาะตอนทดสอบกับเซิร์ฟเวอร์จำลอง — ใช้งานจริงไม่ต้องตั้ง
const API = process.env.LINE_API_BASE?.trim() || "https://api.line.me";
const token = () => process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "";
const secret = () => process.env.LINE_CHANNEL_SECRET?.trim() ?? "";
export const lineConfigured = () => ({ token: !!token(), secret: !!secret() });
export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
/** คำที่พนักงานพิมพ์ในแชต OA เพื่อขอรับแจ้งเตือน (ลูกค้าทั่วไปที่แอดไลน์จะไม่ถูกเพิ่มเอง) */
export const REGISTER_WORDS = ["ลงทะเบียนแจ้งเตือน", "register"];

export class LineError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

/** ตรวจลายเซ็น webhook (HMAC-SHA256 ของ body ด้วย channel secret) — กันคนอื่นยิง webhook ปลอม */
export function verifySignature(rawBody: string, signature: string | null) {
  const s = secret();
  if (!s || !signature) return false;
  const want = createHmac("sha256", s).update(rawBody).digest();
  let got: Buffer;
  try {
    got = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return got.length === want.length && timingSafeEqual(got, want);
}

async function call<T = unknown>(method: "GET" | "POST", path: string, body?: unknown, retryKey?: string): Promise<T> {
  if (!token()) throw new LineError("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const text = await res.text();
  // 409 = ส่งซ้ำด้วย retry key เดิม (LINE รับไปแล้ว) ถือว่าสำเร็จ
  if (!res.ok && res.status !== 409) {
    let msg = text.slice(0, 200);
    try {
      msg = JSON.parse(text).message ?? msg;
    } catch {}
    throw new LineError(res.status === 401 ? "token ไม่ถูกต้องหรือหมดอายุ" : res.status === 429 ? "ใช้ข้อความฟรีของเดือนนี้ครบแล้ว หรือส่งถี่เกินไป" : `LINE ${res.status}: ${msg}`, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const textMsg = (text: string) => ({ type: "text", text: text.slice(0, 4900) });

export async function replyText(replyToken: string, text: string) {
  await call("POST", "/v2/bot/message/reply", { replyToken, messages: [textMsg(text)] });
}

/** ชื่อที่แสดงของผู้ใช้/กลุ่ม (ถ้าดึงไม่ได้ใช้ชื่อสำรอง) */
export async function targetName(kind: LineTargetKind, id: string) {
  try {
    if (kind === "USER") return (await call<{ displayName?: string }>("GET", `/v2/bot/profile/${encodeURIComponent(id)}`)).displayName || "ผู้ใช้ LINE";
    if (kind === "GROUP") return (await call<{ groupName?: string }>("GET", `/v2/bot/group/${encodeURIComponent(id)}/summary`)).groupName || "กลุ่ม LINE";
  } catch {}
  return kind === "ROOM" ? "ห้องแชต LINE" : kind === "GROUP" ? "กลุ่ม LINE" : "ผู้ใช้ LINE";
}

/** ข้อมูล OA + โควตาข้อความเดือนนี้ (หน้า "แจ้งเตือน LINE") */
export async function botStatus() {
  const [info, quota, used] = await Promise.all([
    call<{ displayName?: string; basicId?: string; pictureUrl?: string }>("GET", "/v2/bot/info"),
    call<{ type: string; value?: number }>("GET", "/v2/bot/message/quota").catch(() => null),
    call<{ totalUsage?: number }>("GET", "/v2/bot/message/quota/consumption").catch(() => null),
  ]);
  return { name: info.displayName ?? "", basicId: info.basicId ?? "", quota: quota?.type === "limited" ? quota.value ?? null : null, used: used?.totalUsage ?? null };
}

/**
 * ส่งข้อความถึงผู้รับที่เปิดใช้ทุกคน — คืนจำนวนที่ส่งสำเร็จ/ไม่สำเร็จ
 * ใช้ retry key ต่อผู้รับ กันข้อความซ้ำถ้าเครือข่ายสะดุดแล้วลองใหม่
 */
export async function notifyShop(text: string, onlyId?: string) {
  if (!token()) return { sent: 0, failed: 0, skipped: true };
  const list = await prisma.lineRecipient.findMany({ where: onlyId ? { id: onlyId } : { enabled: true } });
  let sent = 0, failed = 0;
  for (const r of list) {
    const key = randomUUID();
    let err: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await call("POST", "/v2/bot/message/push", { to: r.lineId, messages: [textMsg(text)] }, key);
        err = null;
        break;
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
        // ลองใหม่เฉพาะปัญหาชั่วคราว (เครือข่าย / 5xx)
        if (e instanceof LineError && e.status && e.status < 500) break;
      }
    }
    await prisma.lineRecipient.update({ where: { id: r.id }, data: err ? { lastError: err.slice(0, 300) } : { lastSentAt: new Date(), lastError: null } });
    if (err) {
      failed++;
      await logAdmin(null, "LINE", `ส่งแจ้งเตือน LINE ถึง "${r.name}" ไม่สำเร็จ: ${err}`);
    } else sent++;
  }
  return { sent, failed, skipped: false };
}

const baht = (satang: number) => "฿" + (satang / 100).toLocaleString("en-US", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** ข้อความแจ้งเตือน "ลูกค้าแนบสลิป รอตรวจ" (ไม่ใส่ที่อยู่ลูกค้า — ส่งเฉพาะข้อมูลที่ต้องใช้ตรวจ) */
export async function slipMessage(orderNo: string) {
  const o = await prisma.order.findUnique({ where: { orderNo }, include: { slips: { orderBy: { uploadedAt: "desc" } }, items: { select: { qty: true } } } });
  const slip = o?.slips[0];
  if (!o || !slip) return null;
  const dups = await prisma.paymentSlip.findMany({ where: { sha256: slip.sha256, orderId: { not: o.id } }, select: { order: { select: { orderNo: true } } }, take: 3 });
  const queue = await prisma.order.count({ where: { status: "PENDING_VERIFICATION" } });
  const diff = slip.declaredAmountSatang - o.totalSatang;
  const when = slip.transferredAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
  const lines = [
    o.slips.length > 1 ? "🔁 ลูกค้าแนบสลิปใหม่ รอตรวจ" : "🧾 สลิปใหม่ รอตรวจ",
    `คำสั่งซื้อ ${o.orderNo}`,
    `ลูกค้า: ${o.customerName} · ${formatPhone(o.phone)}`,
    `ยอดสั่งซื้อ ${baht(o.totalSatang)} (${o.items.reduce((n, i) => n + i.qty, 0)} ชิ้น)`,
    `ยอดในสลิป ${baht(slip.declaredAmountSatang)} · โอนเมื่อ ${when}`,
  ];
  if (diff) lines.push(`⚠️ ยอดไม่ตรง ${diff > 0 ? "เกิน" : "ขาด"} ${baht(Math.abs(diff))}`);
  if (dups.length) lines.push(`⚠️ สลิปนี้เคยใช้กับ ${dups.map((d) => d.order.orderNo).join(", ")}`);
  if (!diff && !dups.length) lines.push("✅ ตรวจอัตโนมัติ: ยอดตรง ไม่ซ้ำ");
  lines.push(`คิวรอตรวจทั้งหมด ${queue} รายการ`, "", `เปิดตรวจ: ${siteUrl()}/admin?tab=PENDING_VERIFICATION&open=${encodeURIComponent(o.orderNo)}`);
  return lines.join("\n");
}

export async function notifySlipUploaded(orderNo: string) {
  try {
    const text = await slipMessage(orderNo);
    if (text) await notifyShop(text);
  } catch (e) {
    // ห้ามทำให้การแนบสลิปของลูกค้าล้ม
    await logAdmin(null, "LINE", `แจ้งเตือนสลิป ${orderNo} ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
  }
}
