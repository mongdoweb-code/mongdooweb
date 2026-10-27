"use server";
// รายชื่อรอสินค้าเข้า (A7): ทำเครื่องหมาย "แจ้งแล้ว" (รายคน/ทั้งสินค้า) และลบรายการ
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
function back(f: FormData, flag: string): never {
  const b = str(f, "back", 400);
  const u = new URL(/^\/admin\/stock-alerts(\?[^\s]*)?$/.test(b) ? b : "/admin/stock-alerts", "http://x");
  u.searchParams.set("done", flag);
  redirect(u.pathname + u.search);
}

export async function markNotified(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const productId = str(f, "productId", 40);
  const undo = f.get("undo") === "1";
  const where = id ? { id } : productId ? { productId, notifiedAt: null } : null;
  if (!where) back(f, "err");
  const r = await prisma.stockAlert.updateMany({ where, data: { notifiedAt: undo ? null : new Date() } });
  const p = productId ? await prisma.product.findUnique({ where: { id: productId }, select: { sku: true } }) : null;
  await logAdmin(admin.id, "STOCK_ALERT", undo ? "ยกเลิกเครื่องหมายแจ้งแล้ว 1 รายการ" : `ทำเครื่องหมายแจ้งลูกค้าแล้ว ${r.count} รายการ${p ? ` (${p.sku})` : ""}`);
  back(f, undo ? "undone" : "marked");
}

export async function deleteAlert(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const r = await prisma.stockAlert.deleteMany({ where: { id } });
  if (r.count) await logAdmin(admin.id, "STOCK_ALERT", "ลบรายชื่อรอสินค้าเข้า 1 รายการ");
  back(f, "deleted");
}
