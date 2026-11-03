"use server";
// นับสต็อกทั้งร้าน — เปิดรอบ / บันทึกยอดนับ / ปรับสต็อก / ยกเลิก (ทุกขั้นลงประวัติ)
import { after } from "next/server";
import { redirect } from "next/navigation";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alertLowStock } from "@/lib/stock";
import { CountError, applyCount, cancelCount, createCount, saveCounts, type CountScope } from "@/lib/stock-count";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const errTo = (path: string, e: unknown) => {
  if (!(e instanceof CountError)) throw e;
  redirect(`${path}${path.includes("?") ? "&" : "?"}err=${encodeURIComponent(e.message)}`);
};

export async function openCount(f: FormData) {
  const admin = await requireAdmin();
  const kind = str(f, "scope", 20);
  let scope: CountScope = { kind: "all" };
  if (kind === "category") {
    const categoryId = str(f, "categoryId", 40);
    if (!categoryId) redirect("/admin/stock/count?err=" + encodeURIComponent("เลือกหมวดที่จะนับ"));
    scope = { kind: "category", categoryId };
  } else if (kind === "low") {
    const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { lowStockThreshold: true } });
    scope = { kind: "low", threshold: s?.lowStockThreshold ?? 5 };
  }
  let id = "";
  try {
    const c = await createCount(str(f, "title", 120), scope, admin.id);
    id = c.id;
    await logAdmin(admin.id, "STOCK_COUNT", `เปิดรอบนับสต็อก ${c.countNo} (${c._count.lines} รายการ)`, { entity: `StockCount:${c.id}` });
  } catch (e) {
    errTo("/admin/stock/count", e);
  }
  redirect(`/admin/stock/count/${id}`);
}

/** บันทึกยอดนับจากฟอร์ม (ช่อง c_<productId>; ว่าง = ยังไม่นับ) — intent=apply: บันทึกแล้วปรับสต็อกต่อทันที */
export async function saveCountForm(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const path = `/admin/stock/count/${id}`;
  const entries: { productId: string; counted: number | null }[] = [];
  for (const [k, v] of f.entries()) {
    if (!k.startsWith("c_")) continue;
    const raw = String(v).replace(/[,\s]/g, "");
    if (raw === "") { entries.push({ productId: k.slice(2), counted: null }); continue; }
    if (!/^\d{1,7}$/.test(raw)) redirect(`${path}?err=${encodeURIComponent("ยอดนับต้องเป็นจำนวนเต็ม 0 ขึ้นไป")}`);
    entries.push({ productId: k.slice(2), counted: Number(raw) });
  }
  let changed = 0;
  try {
    changed = await saveCounts(id, entries);
  } catch (e) {
    errTo(path, e);
  }
  if (str(f, "intent", 10) !== "apply") redirect(`${path}?saved=${changed}`);
  let msg = "";
  try {
    const r = await applyCount(id, admin.id);
    const plus = r.results.filter((x) => x.change > 0).reduce((s, x) => s + x.change, 0);
    const minus = r.results.filter((x) => x.change < 0).reduce((s, x) => s - x.change, 0);
    await logAdmin(admin.id, "STOCK_COUNT", `ปรับสต็อกตามรอบนับ ${r.countNo}: นับ ${r.counted} รายการ · เปลี่ยน ${r.results.length} รายการ (+${plus} / −${minus})${r.skipped ? ` · ไม่ได้นับ ${r.skipped}` : ""}`, { entity: `StockCount:${id}` });
    refreshStorefront();
    after(() => alertLowStock(r.results));
  } catch (e) {
    if (!(e instanceof CountError)) throw e;
    msg = e.message;
  }
  redirect(`${path}?${msg ? `err=${encodeURIComponent(msg)}` : "applied=1"}`);
}

export async function cancelCountAction(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  try {
    await cancelCount(id);
  } catch (e) {
    errTo(`/admin/stock/count/${id}`, e);
  }
  await logAdmin(admin.id, "STOCK_COUNT", "ยกเลิกรอบนับสต็อก", { entity: `StockCount:${id}` });
  redirect(`/admin/stock/count/${id}`);
}
