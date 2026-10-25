"use server";
// ลูกค้ายืนยันใบเสนอราคาผ่านลิงก์ลับ (U25) — ตรวจโทเคนซ้ำที่ server ทุกครั้ง + จำกัดจำนวนครั้งต่อ IP
import { after } from "next/server";
import { DocOnlineError, acceptQuoteOnline, quoteAcceptedMessage } from "@/lib/doc-online";
import { notifySafe } from "@/lib/order-notify";
import { clientIp, overLimit } from "@/lib/rate-limit";

export type AcceptState = { error?: string; ok?: string; fields?: string[] };

export async function acceptQuoteAction(_prev: AcceptState, f: FormData): Promise<AcceptState> {
  if (overLimit(`qt-accept:${await clientIp()}`, 10, 10 * 60e3)) return { error: "ทำรายการบ่อยเกินไป กรุณารอสักครู่" };
  try {
    const r = await acceptQuoteOnline({
      id: String(f.get("id") ?? "").slice(0, 40),
      token: String(f.get("t") ?? "").slice(0, 60),
      name: String(f.get("name") ?? ""),
      agree: f.get("agree") === "on",
    });
    after(() => notifySafe(`ยืนยันใบเสนอราคา ${r.docNo}`, () => quoteAcceptedMessage(r)));
    return { ok: `ยืนยันใบเสนอราคา ${r.docNo} เรียบร้อยแล้ว ขอบคุณครับ — ร้านจะส่งใบแจ้งหนี้ให้ต่อไป` };
  } catch (e) {
    if (e instanceof DocOnlineError) return { error: e.message, fields: e.fields };
    throw e;
  }
}
