"use server";
// ตรวจรูปภาพ (A15): สร้างรูปย่อใหม่เป็นชุด (ฝั่งเบราว์เซอร์เรียกซ้ำจนครบ) · เอารูปที่หายออกจากสินค้า
import { redirect } from "next/navigation";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { dropMissingProductImages, regenerateBatch } from "@/lib/media-scan";

export async function regenerateAction(offset: number, force: boolean, only = "") {
  const admin = await requireAdmin();
  const r = await regenerateBatch(Math.max(0, Math.floor(offset) || 0), 6, !!force, String(only).slice(0, 80));
  if (r.next >= r.total) await logAdmin(admin.id, "MEDIA", `สร้างรูปย่อใหม่${force ? " (ทั้งหมด)" : ""} ครบ ${r.total} รูป`);
  return r;
}

export async function dropMissingAction() {
  const admin = await requireAdmin();
  const changed = await dropMissingProductImages();
  for (const c of changed)
    await logAdmin(admin.id, "MEDIA", `เอารูปที่หาย ${c.removed.length} รูปออกจากสินค้า ${c.sku}`, { entity: `Product:${c.id}`, diff: { images: [c.removed, null] } });
  if (changed.length) refreshStorefront();
  redirect(`/admin/media?dropped=${changed.reduce((n, c) => n + c.removed.length, 0)}`);
}
