// แจ้งเมื่อมีของ (U9/A7)
// - ลูกค้าฝากเบอร์ / LINE ID / อีเมล ไว้ที่หน้าสินค้าที่หมด → ร้านเห็นรายชื่อใน /admin/stock-alerts
// - สต็อกเปลี่ยนจาก 0 เป็น > 0 (src/lib/stock.ts) หรือสินค้าไม่นับสต็อกถูกติ๊ก "มีของ" อีกครั้ง/กลับมาเปิดขาย
//   (แก้สินค้า, เปิดขาย, แก้หลายรายการ, นำเข้า CSV) → แจ้ง LINE ร้านพร้อมจำนวนลูกค้าที่รอ (ร้านติดต่อลูกค้าเอง แล้วกด "แจ้งแล้ว")
import "server-only";
import { phoneDigits } from "@/lib/format";
import { notifyShop, siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";

export class StockAlertError extends Error {
  constructor(message: string, public status = 400, public fields: string[] = []) {
    super(message);
  }
}

const available = (p: { trackStock: boolean; stock: number; inStock: boolean }) => (p.trackStock ? p.stock > 0 : p.inStock);

/** รับคำขอจากหน้าสินค้า — ต้องมีช่องทางติดต่ออย่างน้อย 1 ช่อง · ซ้ำ (สินค้า + ช่องทางเดิมที่ยังรอ) = ไม่สร้างใหม่ */
export async function createStockAlert(input: { product: string; name?: string; phone?: string; lineId?: string; email?: string }) {
  const slug = String(input.product ?? "").trim().slice(0, 120);
  const p = slug ? await prisma.product.findFirst({ where: { slug, isActive: true }, select: { id: true, trackStock: true, stock: true, inStock: true } }) : null;
  if (!p) throw new StockAlertError("ไม่พบสินค้า", 404);
  if (available(p)) throw new StockAlertError("สินค้านี้มีของแล้ว สั่งซื้อได้เลย", 409);
  const phone = phoneDigits(String(input.phone ?? "")).slice(0, 12) || null;
  const lineId = String(input.lineId ?? "").trim().replace(/\s+/g, "").slice(0, 40) || null;
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 120) || null;
  const name = String(input.name ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  const bad: string[] = [];
  if (phone && !/^0\d{8,9}$/.test(phone)) bad.push("phone");
  if (lineId && !/^@?[\w.-]{2,40}$/.test(lineId)) bad.push("lineId");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad.push("email");
  if (bad.length) throw new StockAlertError(bad[0] === "phone" ? "เบอร์โทรไม่ถูกต้อง" : bad[0] === "lineId" ? "LINE ID ไม่ถูกต้อง" : "อีเมลไม่ถูกต้อง", 400, bad);
  if (!phone && !lineId && !email) throw new StockAlertError("กรุณากรอกเบอร์โทร, LINE ID หรืออีเมล อย่างน้อย 1 ช่อง", 400, ["phone"]);
  const dup = await prisma.stockAlert.findFirst({
    where: { productId: p.id, notifiedAt: null, OR: [phone ? { phone } : {}, lineId ? { lineId } : {}, email ? { email } : {}].filter((x) => Object.keys(x).length) },
    select: { id: true },
  });
  if (dup) return { id: dup.id, duplicate: true };
  const a = await prisma.stockAlert.create({ data: { productId: p.id, name, phone, lineId, email }, select: { id: true } });
  return { id: a.id, duplicate: false };
}

// ---------- แจ้ง LINE ร้านเมื่อเติมสต็อก ----------

const g = globalThis as unknown as { __mdwRestock?: { ids: Set<string>; timer: ReturnType<typeof setTimeout> | null } };
const queue = () => (g.__mdwRestock ??= { ids: new Set(), timer: null });

/**
 * เรียกจาก src/lib/stock.ts เมื่อสต็อกเปลี่ยนจาก ≤ 0 เป็น > 0 (ภายใน transaction)
 * รอให้ transaction จบก่อน แล้วตรวจกับฐานข้อมูลอีกครั้ง (rollback = สต็อกยังเป็น 0 → ไม่แจ้ง) — ไม่ throw
 */
export function queueRestockAlert(productId: string) {
  const q = queue();
  q.ids.add(productId);
  q.timer ??= setTimeout(() => {
    const ids = [...q.ids];
    q.ids.clear();
    q.timer = null;
    void notifyRestock(ids).catch((e) => console.error("แจ้งสินค้าเข้าไม่สำเร็จ", e));
  }, 1500);
}

/** สินค้า "กลับมามีของ" ของสินค้าที่ไม่นับสต็อก (inStock false → true) หรือกลับมาเปิดขาย — เรียกหลังบันทึกแล้ว */
export function queueRestockIfAvailableNow(before: { trackStock: boolean; stock: number; inStock: boolean; isActive?: boolean }, after: { id: string; trackStock: boolean; stock: number; inStock: boolean; isActive?: boolean }) {
  const was = available(before) && before.isActive !== false;
  const now = available(after) && after.isActive !== false;
  if (!was && now) queueRestockAlert(after.id);
}

export async function notifyRestock(productIds: string[]) {
  if (!productIds.length) return;
  const rows = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: { id: true, sku: true, name: true, stock: true, trackStock: true, inStock: true, _count: { select: { stockAlerts: { where: { notifiedAt: null } } } } },
  });
  // นับสต็อก = stock > 0 · ไม่นับสต็อก = inStock (ติ๊ก "มีสินค้าพร้อมขาย")
  const waiting = rows.filter((r) => available(r) && r._count.stockAlerts > 0);
  if (!waiting.length) return;
  const lines = waiting.slice(0, 10).map((r) => `• ${r.name} (${r.sku}) — ${r.trackStock ? `เข้ามา ${r.stock}` : "มีของแล้ว"} · ลูกค้ารอ ${r._count.stockAlerts} คน`);
  await notifyShop(["🔔 สินค้ากลับมามีของ — มีลูกค้าฝากให้แจ้ง", ...lines, "", `ดูรายชื่อและกด "แจ้งแล้ว": ${siteUrl()}/admin/stock-alerts`].join("\n"));
}
