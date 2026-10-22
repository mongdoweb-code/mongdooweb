// บันทึกการใช้งานหลังบ้าน (AdminLog) + ล้างแคชหน้าร้านหลังแก้ข้อมูล
// รอบ 3 (A29): บันทึกได้ว่าแก้ "รายการไหน" (entity เช่น "Product:<id>", "Order:<orderNo>", "ShopSetting")
// และ "เปลี่ยนอะไร" (diff = { field: [ก่อน, หลัง] }) — ไม่เก็บรหัสผ่าน/ความลับ (ตัดทิ้งที่ diffOf และอีกชั้นตอนบันทึก)
import "server-only";
import { updateTag } from "next/cache";
import type { Prisma } from "../../generated/prisma/client";
import { SECRET_FIELD, type Diff } from "@/lib/log-diff";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";

export { diffOf, visibleDiff, type Diff } from "@/lib/log-diff";

/** ชนิดบันทึก → ชื่อภาษาไทย (หน้า "บันทึกการใช้งาน") */
export const LOG_TYPES: Record<string, string> = {
  LOGIN: "เข้าสู่ระบบ",
  LOGIN_FAIL: "เข้าสู่ระบบไม่สำเร็จ",
  LOCKOUT: "ล็อกการเข้าสู่ระบบ",
  LOGOUT: "ออกจากระบบ",
  IDLE_LOGOUT: "หมดเวลา (ไม่มีการใช้งาน)",
  ORDERS_EXPORT: "ส่งออก CSV",
  SETTINGS: "ตั้งค่าร้าน",
  ADMIN_USER: "ผู้ใช้หลังบ้าน",
  PASSWORD: "เปลี่ยนรหัสผ่าน",
  PRODUCT: "สินค้า",
  CATEGORY: "หมวดหมู่",
  SLIDES: "สไลด์หน้าแรก",
  CONTENT_ROLLBACK: "ย้อนเวอร์ชัน",
  CUSTOMER: "ลูกค้า",
  DOC: "เอกสารขาย",
  LABEL: "พิมพ์ใบปะหน้า",
  LINE: "แจ้งเตือน LINE",
  PURCHASE: "ใบสั่งซื้อ/ต้นทุน",
  TASK: "งานที่ต้องทำ",
  NOTE: "โน้ตภายใน",
  BACKUP: "สำรองข้อมูล",
  PDPA: "คำขอข้อมูลส่วนบุคคล",
  MEDIA: "รูปภาพ",
};

export type LogOpts = { entity?: string | null; diff?: Diff | null };

/** ตัดฟิลด์ลับออกอีกชั้น (กันส่ง diff ที่ไม่ได้ผ่าน diffOf มา) */
function cleanDiff(diff: Diff | null | undefined): Prisma.InputJsonValue | undefined {
  if (!diff) return undefined;
  const out: Record<string, [unknown, unknown]> = {};
  for (const [k, v] of Object.entries(diff)) if (!SECRET_FIELD.test(k) && Array.isArray(v)) out[k] = [v[0] ?? null, v[1] ?? null];
  return Object.keys(out).length ? (out as Prisma.InputJsonValue) : undefined;
}

/** บันทึกการใช้งาน — opts (ไม่บังคับ): entity = รายการที่ถูกแก้, diff = ค่าก่อน/หลัง */
export async function logAdmin(adminId: string | null, type: keyof typeof LOG_TYPES | string, note: string, opts: LogOpts = {}) {
  await prisma.adminLog.create({
    data: { adminId, type, note: note.slice(0, 1000), entity: opts.entity?.slice(0, 120) || null, diff: cleanDiff(opts.diff) },
  });
}

/** เรียกหลังแก้สินค้า/หมวด/สไลด์/ตั้งค่า ให้หน้าร้านเห็นข้อมูลใหม่ทันที */
export function refreshStorefront() {
  updateTag(STOREFRONT_TAG);
}
