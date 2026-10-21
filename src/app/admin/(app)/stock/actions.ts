"use server";
// ปรับสต็อกเอง (รับของเข้า / นับสต็อก / ปรับปรุง) และเกณฑ์สินค้าใกล้หมด — ทุกการเปลี่ยนผ่าน src/lib/stock.ts
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STOCK_REASONS, moveStock, setStock } from "@/lib/stock";

export type StockState = { error?: string; fields?: string[]; ok?: string };
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const int = (s: string) => (/^-?\d{1,7}$/.test(s.replace(/,/g, "")) ? Number(s.replace(/,/g, "")) : NaN);

export async function adjustStock(_prev: StockState, f: FormData): Promise<StockState> {
  const admin = await requireAdmin();
  const id = str(f, "productId", 40);
  const kind = str(f, "kind", 10);
  const n = int(str(f, "qty", 12));
  const note = str(f, "note", 300);
  const ref = str(f, "ref", 60);
  if (!["RESTOCK", "COUNT", "ADJUST"].includes(kind)) return { error: "เลือกประเภทการปรับ" };
  if (kind === "RESTOCK" && !(n >= 1 && n <= 1_000_000)) return { error: "จำนวนรับเข้าต้องเป็นจำนวนเต็มมากกว่า 0", fields: ["qty"] };
  if (kind === "COUNT" && !(n >= 0 && n <= 1_000_000)) return { error: "จำนวนที่นับได้ต้องเป็น 0 ขึ้นไป", fields: ["qty"] };
  if (kind === "ADJUST" && !(n !== 0 && Math.abs(n) <= 1_000_000)) return { error: "ใส่จำนวนที่เพิ่ม (+) หรือลด (−) เช่น -2", fields: ["qty"] };
  if (kind === "ADJUST" && note.length < 3) return { error: "กรุณาระบุเหตุผลการปรับ เช่น สินค้าชำรุด", fields: ["note"] };
  const p = await prisma.product.findUnique({ where: { id }, select: { sku: true, name: true, trackStock: true } });
  if (!p) return { error: "ไม่พบสินค้า" };
  if (!p.trackStock) return { error: "สินค้านี้ไม่ได้นับสต็อก — กด \"เริ่มนับสต็อก\" ก่อน" };
  const meta = { reason: kind as "RESTOCK" | "COUNT" | "ADJUST", adminId: admin.id, note: note || null, ref: ref || null };
  const r = await prisma.$transaction((tx) => (kind === "COUNT" ? setStock(tx, id, n, meta) : moveStock(tx, [{ productId: id, delta: n }], meta).then((x) => x[0] ?? null)));
  if (!r) return { ok: "สต็อกเท่าเดิม ไม่มีการเปลี่ยนแปลง" };
  await logAdmin(admin.id, "STOCK", `${STOCK_REASONS[meta.reason]} ${p.sku}: ${r.before} → ${r.after}${note ? ` (${note})` : ""}`);
  refreshStorefront();
  refresh();
  return { ok: `บันทึกแล้ว — คงเหลือ ${r.before} → ${r.after}` };
}

/** เปิดการนับสต็อกให้สินค้า พร้อมยอดเริ่มต้น */
export async function startTracking(_prev: StockState, f: FormData): Promise<StockState> {
  const admin = await requireAdmin();
  const id = str(f, "productId", 40);
  const n = int(str(f, "qty", 12));
  if (!(n >= 0 && n <= 1_000_000)) return { error: "ใส่จำนวนคงเหลือปัจจุบัน (0 ขึ้นไป)", fields: ["qty"] };
  const done = await prisma.$transaction(async (tx) => {
    const r = await tx.product.updateMany({ where: { id, trackStock: false }, data: { trackStock: true, stock: 0 } });
    if (r.count !== 1) return false;
    await setStock(tx, id, n, { reason: "COUNT", adminId: admin.id, note: "เริ่มนับสต็อก" });
    if (n === 0) await tx.product.update({ where: { id }, data: { inStock: false } });
    return true;
  });
  if (!done) return { error: "สินค้านี้นับสต็อกอยู่แล้ว" };
  const p = await prisma.product.findUnique({ where: { id }, select: { sku: true } });
  await logAdmin(admin.id, "STOCK", `เริ่มนับสต็อก ${p?.sku} ยอดเริ่มต้น ${n}`);
  refreshStorefront();
  // ฟอร์มนี้หายไปหลังเริ่มนับ (หน้าเปลี่ยนเป็นฟอร์มปรับสต็อก) → แจ้งผลบนหน้าแทน
  redirect(`/admin/stock/${id}?started=${n}`);
}

/** เกณฑ์สินค้าใกล้หมด + แจ้งเตือน LINE (เจ้าของร้าน) */
export async function saveLowStock(f: FormData) {
  const admin = await requireOwner();
  const t = int(str(f, "threshold", 6));
  const line = f.get("lineLowStock") === "on";
  if (t >= 0 && t <= 9999) {
    await prisma.shopSetting.update({ where: { id: "shop" }, data: { lowStockThreshold: t, lineLowStock: line } });
    await logAdmin(admin.id, "SETTINGS", `ตั้งเกณฑ์สินค้าใกล้หมด ≤ ${t} · แจ้ง LINE ${line ? "เปิด" : "ปิด"}`);
  }
  redirect("/admin/stock?tab=low&saved=1");
}
