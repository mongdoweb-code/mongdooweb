"use server";
// หน้าจัดเรียงสินค้าหน้าร้าน: บันทึกลำดับทั้งร้าน · คืนลำดับก่อนหน้า
import { refresh } from "next/cache";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { OrderStaleError, restoreBoardOrder, saveBoardOrder } from "@/lib/product-order";

export type BoardResult = { ok?: string; error?: string; stale?: boolean };

export async function saveBoard(ids: string[], pinned: string[]): Promise<BoardResult> {
  const admin = await requireAdmin();
  const okIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 40);
  if (!okIds(ids) || !okIds(pinned)) return { error: "ข้อมูลไม่ถูกต้อง ลองโหลดหน้าใหม่" };
  try {
    const n = await saveBoardOrder(ids, pinned, admin.displayName);
    if (!n) return { ok: "ลำดับเหมือนเดิม ไม่มีอะไรเปลี่ยน" };
    await logAdmin(admin.id, "PRODUCT", `จัดเรียงสินค้าหน้าร้าน: บันทึกลำดับใหม่ (เปลี่ยน ${n} รายการ · ปักหมุด ${pinned.length})`);
    refreshStorefront();
    refresh();
    return { ok: `บันทึกลำดับแล้ว — หน้าร้านเรียงตามนี้ทันที (เปลี่ยน ${n} รายการ)` };
  } catch (e) {
    if (e instanceof OrderStaleError) return { error: "มีการเพิ่มหรือลบสินค้าระหว่างจัดเรียง — โหลดหน้าใหม่แล้วจัดอีกครั้ง", stale: true };
    throw e;
  }
}

export async function restoreBoard(): Promise<BoardResult> {
  const admin = await requireAdmin();
  const r = await restoreBoardOrder(admin.displayName);
  if (!r) return { error: "ยังไม่มีลำดับก่อนหน้าให้คืนค่า" };
  await logAdmin(admin.id, "PRODUCT", `จัดเรียงสินค้าหน้าร้าน: คืนลำดับก่อนหน้า (${r.changed} รายการ)`);
  refreshStorefront();
  refresh();
  return { ok: `คืนลำดับก่อนหน้าแล้ว (${r.changed} รายการ) — กดอีกครั้งเพื่อสลับกลับ` };
}
