// GET|POST /api/cron/daily — งานประจำวัน (เรียกวันละครั้ง 07:00 เวลาไทย จาก Railway Cron หรือบริการ ping ภายนอก)
// ยืนยันตัวตนด้วย CRON_SECRET: header "Authorization: Bearer <key>" หรือ "x-cron-secret: <key>" หรือ ?key=<key>
// 1) ยกเลิกคำสั่งซื้อที่ไม่แนบสลิปเกิน N วัน (ShopSetting.autoCancelDays, 0 = ปิด) — บันทึก OrderEvent ทุกรายการ
// 2) แจ้ง LINE สินค้าใกล้หมดที่ลดถึงเกณฑ์จากการปรับ/นำเข้า (การขายแจ้งทันทีตอนอนุมัติอยู่แล้ว) — ครั้งเดียวต่อรอบ
// 3) สรุปประจำวันทาง LINE (ShopSetting.lineDailySummary)
// 4) สำรองข้อมูลทุกตารางไปที่ storage "backups/YYYY-MM-DD.zip" (A26) — วันละครั้ง ลบไฟล์เก่าเกิน ShopSetting.backupRetentionDays
// เรียกซ้ำในวันเดียวกันได้อย่างปลอดภัย: ยกเลิกซ้ำไม่ได้ (มีเงื่อนไขสถานะ) และข้อ 2–3 ส่งวันละครั้ง (เครื่องหมายใน AdminLog)
import { createHash, timingSafeEqual } from "node:crypto";
import { logAdmin } from "@/lib/admin-log";
import { runBackup } from "@/lib/backup";
import { addDaysYmd, fromYmd, ymdBkk } from "@/lib/doc-calc";
import { statusWhere } from "@/lib/docs";
import { bahtText } from "@/lib/format";
import { notifyShop, siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { CHANNEL_LABEL, byChannel, salesBetween, sumSales } from "@/lib/sales-report";
import { lowStockProducts, lowStockText } from "@/lib/stock";

const MARK = "CRON_DAILY";
const digest = (s: string) => createHash("sha256").update(s).digest();

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null; // ยังไม่ได้ตั้งค่า = ปิดใช้งาน
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const given = bearer || req.headers.get("x-cron-secret") || url.searchParams.get("key") || "";
  return timingSafeEqual(digest(given), digest(secret));
}

async function run(req: Request) {
  const ok = authorized(req);
  if (ok === null) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const today = ymdBkk(now);
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" } });
  if (!s) return Response.json({ error: "shop settings missing" }, { status: 500 });

  // ---------- 1) ยกเลิกอัตโนมัติ ----------
  const cancelled: string[] = [];
  if (s.autoCancelDays > 0) {
    const cutoff = new Date(now.getTime() - s.autoCancelDays * 864e5);
    const stale = await prisma.order.findMany({ where: { status: "AWAITING_SLIP", createdAt: { lt: cutoff } }, select: { id: true, orderNo: true }, take: 500 });
    const why = `ไม่ชำระเงินภายใน ${s.autoCancelDays} วัน (ยกเลิกอัตโนมัติ)`;
    for (const o of stale) {
      const done = await prisma.$transaction(async (tx) => {
        const r = await tx.order.updateMany({ where: { id: o.id, status: "AWAITING_SLIP" }, data: { status: "CANCELLED", cancelReason: why } });
        if (r.count !== 1) return false;
        await tx.orderEvent.create({ data: { orderId: o.id, type: "CANCELLED", note: `ยกเลิกคำสั่งซื้อ — ${why}` } });
        return true;
      });
      if (done) cancelled.push(o.orderNo);
    }
    if (cancelled.length) await logAdmin(null, "CRON", `ยกเลิกอัตโนมัติ ${cancelled.length} คำสั่งซื้อ (ไม่ชำระเกิน ${s.autoCancelDays} วัน): ${cancelled.join(", ")}`);
  }

  // ---------- 4) สำรองข้อมูลรายวัน (ทำก่อนงาน LINE เพราะงาน LINE จบเร็วเมื่อส่งไปแล้ววันนี้) ----------
  const bk = await runBackup("งานอัตโนมัติรายวัน", { onlyIfMissing: true });
  const backup = bk.ok ? { status: "ok", key: bk.key, sizeBytes: bk.sizeBytes, expired: bk.expired } : "skipped" in bk ? { status: bk.skipped } : { status: "failed", error: bk.error };
  if (bk.ok || !("skipped" in bk)) await logAdmin(null, "BACKUP", bk.ok ? `สำรองข้อมูลอัตโนมัติ ${bk.key} (${(bk.sizeBytes / 1024).toFixed(0)} KB${bk.expired ? `, ลบไฟล์เก่า ${bk.expired}` : ""})` : `สำรองข้อมูลอัตโนมัติไม่สำเร็จ: ${"error" in bk ? bk.error : ""}`);

  // ---------- ส่ง LINE วันละครั้ง (จองเครื่องหมายของวันนี้ใน transaction ที่ล็อกไว้ กันเรียกพร้อมกัน) ----------
  const since = fromYmd(today);
  const claim = await prisma.$transaction(async (tx) => {
    const got = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(4825001) AS ok`;
    if (!got[0]?.ok) return { first: false, last: null as Date | null };
    const exist = await tx.adminLog.findFirst({ where: { type: MARK, createdAt: { gte: since } } });
    if (exist) return { first: false, last: exist.createdAt };
    const prev = await tx.adminLog.findFirst({ where: { type: MARK }, orderBy: { createdAt: "desc" } });
    await tx.adminLog.create({ data: { type: MARK, note: `งานประจำวัน ${today}` } });
    return { first: true, last: prev?.createdAt ?? null };
  });

  const result: Record<string, unknown> = { ok: true, date: today, autoCancelDays: s.autoCancelDays, cancelled, backup };
  if (!claim.first) return Response.json({ ...result, lowStock: "already-sent-today", summary: "already-sent-today" });

  // ---------- 2) สินค้าใกล้หมดที่ลดถึงเกณฑ์จากงานอื่นนอกจากการขาย ----------
  const T = s.lowStockThreshold;
  let lowStock = "disabled";
  if (s.lineLowStock && !s.lineDailySummary) {
    const from = claim.last ?? new Date(now.getTime() - 864e5);
    const moves = await prisma.stockMovement.findMany({
      where: { createdAt: { gte: from }, reason: { notIn: ["SALE", "OPENING"] }, balance: { lte: T } },
      include: { product: { select: { sku: true, name: true, stock: true, isActive: true, trackStock: true } } },
    });
    // ข้ามจาก "เกินเกณฑ์" ลงมา และตอนนี้ยังต่ำอยู่
    const crossed = new Map<string, { sku: string; name: string; stock: number }>();
    for (const m of moves)
      if (m.balance - m.change > T && m.product.isActive && m.product.trackStock && m.product.stock <= T)
        crossed.set(m.productId, { sku: m.product.sku, name: m.product.name, stock: m.product.stock });
    lowStock = crossed.size ? "sent" : "none";
    if (crossed.size) await notifyShop(lowStockText([...crossed.values()], T));
  }

  // ---------- 3) สรุปประจำวัน ----------
  let summary = "disabled";
  if (s.lineDailySummary) {
    const yesterday = addDaysYmd(today, -1);
    const [ySales, dbSales, pending, toShip, awaiting, overdue, inquiries, low] = await Promise.all([
      salesBetween(fromYmd(yesterday), fromYmd(today)),
      salesBetween(fromYmd(addDaysYmd(today, -2)), fromYmd(yesterday)),
      prisma.order.count({ where: { status: "PENDING_VERIFICATION" } }),
      prisma.order.count({ where: { status: "PAID" } }),
      prisma.order.count({ where: { status: "AWAITING_SLIP" } }),
      prisma.salesDocument.count({ where: { type: "INVOICE", ...statusWhere("overdue", today) } }),
      prisma.inquiry.count({ where: { status: "NEW" } }),
      lowStockProducts(T, 50),
    ]);
    const y = sumSales(ySales), p = sumSales(dbSales);
    const diff = y.satang - p.satang;
    const lines = [
      `📊 สรุปประจำวัน ${yesterday.split("-").reverse().join("/")}`,
      `ยอดขาย ${bahtText(y.satang)} (${y.count} รายการ)${p.satang || y.satang ? ` · ${diff >= 0 ? "▲" : "▼"} ${bahtText(Math.abs(diff))} จากวันก่อน` : ""}`,
      ...byChannel(ySales).filter((c) => c.count).map((c) => `  • ${CHANNEL_LABEL[c.key as keyof typeof CHANNEL_LABEL]}: ${bahtText(c.satang)} (${c.count})`),
      "",
      "งานค้าง",
      `  • สลิปรอตรวจ ${pending} · รอจัดส่ง ${toShip} · รอลูกค้าโอน ${awaiting}`,
      `  • ใบแจ้งหนี้เกินกำหนด ${overdue} · คำขอจากลูกค้าใหม่ ${inquiries}`,
      ...(cancelled.length ? [`  • ยกเลิกอัตโนมัติวันนี้ ${cancelled.length} รายการ`] : []),
      "",
      low.length ? lowStockText(low, T).split("\n\n")[0] : "📦 ไม่มีสินค้าใกล้หมด",
      "",
      `ภาพรวม: ${siteUrl()}/admin/dashboard`,
    ];
    const r = await notifyShop(lines.join("\n"));
    summary = r.skipped ? "line-not-configured" : r.failed && !r.sent ? "failed" : "sent";
    await logAdmin(null, "CRON", `สรุปประจำวันทาง LINE: ${summary} (ส่งสำเร็จ ${r.sent}, ไม่สำเร็จ ${r.failed})`);
  }
  return Response.json({ ...result, lowStock, summary });
}

export const GET = run;
export const POST = run;
