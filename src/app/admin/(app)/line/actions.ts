"use server";
// จัดการผู้รับแจ้งเตือน LINE: เปิด/ปิด, ลบ, ส่งข้อความทดสอบ — เจ้าของร้าน (OWNER) เท่านั้น (ตรวจที่ server ทุก action)
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireOwner } from "@/lib/auth";
import { notifyShop, slipMessage } from "@/lib/line";
import { prisma } from "@/lib/prisma";

const id = (f: FormData) => String(f.get("id") ?? "").slice(0, 40);
const back = (msg: string, bad = false) => redirect(`/admin/line?${bad ? "err" : "ok"}=${encodeURIComponent(msg)}`);

export async function toggleRecipient(f: FormData) {
  const admin = await requireOwner();
  const r = await prisma.lineRecipient.findUnique({ where: { id: id(f) } });
  if (!r) back("ไม่พบผู้รับ", true);
  await prisma.lineRecipient.update({ where: { id: r!.id }, data: { enabled: !r!.enabled, lastError: null } });
  await logAdmin(admin.id, "LINE", `${r!.enabled ? "ปิด" : "เปิด"}รับแจ้งเตือน: ${r!.name}`);
  back(`${r!.enabled ? "ปิด" : "เปิด"}รับแจ้งเตือนของ "${r!.name}" แล้ว`);
}

export async function deleteRecipient(f: FormData) {
  const admin = await requireOwner();
  const r = await prisma.lineRecipient.findUnique({ where: { id: id(f) } });
  if (r) {
    await prisma.lineRecipient.delete({ where: { id: r.id } });
    await logAdmin(admin.id, "LINE", `ลบผู้รับแจ้งเตือน: ${r.name}`);
  }
  back("ลบผู้รับแล้ว");
}

/** ส่งข้อความทดสอบ (ถึงคนเดียว หรือทุกคนที่เปิดใช้) — ใช้ตัวอย่างจากสลิปล่าสุดถ้ามี */
export async function sendTest(f: FormData) {
  const admin = await requireOwner();
  const one = id(f) || undefined;
  const last = await prisma.paymentSlip.findFirst({ orderBy: { uploadedAt: "desc" }, select: { order: { select: { orderNo: true } } } });
  const sample = last ? await slipMessage(last.order.orderNo) : null;
  const text = `🔔 ทดสอบแจ้งเตือนจากระบบร้านมองดูเว็บ (ส่งโดย ${admin.displayName})${sample ? `\n\nตัวอย่างข้อความเมื่อมีสลิปใหม่:\n${sample}` : "\nเมื่อลูกค้าแนบสลิป ระบบจะส่งรายละเอียดมาที่นี่"}`;
  const r = await notifyShop(text, one);
  await logAdmin(admin.id, "LINE", `ส่งข้อความทดสอบ: สำเร็จ ${r.sent} ไม่สำเร็จ ${r.failed}`);
  if (r.skipped) back("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN บนเซิร์ฟเวอร์", true);
  if (!r.sent && !r.failed) back("ยังไม่มีผู้รับที่เปิดใช้", true);
  back(r.failed ? `ส่งสำเร็จ ${r.sent} · ไม่สำเร็จ ${r.failed} (ดูสาเหตุในตาราง)` : `ส่งข้อความทดสอบแล้ว ${r.sent} ปลายทาง`, r.failed > 0);
}
