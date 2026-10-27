// บันทึกการใช้งานหลังบ้าน (AdminLog) + ล้างแคชหน้าร้านหลังแก้ข้อมูล
import "server-only";
import { updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";

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
  COUPON: "คูปองส่วนลด",
  CLAIM: "เคลม/คืนสินค้า",
  REVIEW: "รีวิวสินค้า",
  STOCK_ALERT: "แจ้งเมื่อมีของ",
  PROJECT: "ผลงานติดตั้ง",
  POST: "บทความ",
  SEARCH: "คำค้นหา/คำพ้อง",
  REDIRECT: "Redirect / 404",
  HOME: "หน้าแรก",
};

export async function logAdmin(adminId: string | null, type: keyof typeof LOG_TYPES | string, note: string) {
  await prisma.adminLog.create({ data: { adminId, type, note: note.slice(0, 1000) } });
}

/** เรียกหลังแก้สินค้า/หมวด/สไลด์/ตั้งค่า ให้หน้าร้านเห็นข้อมูลใหม่ทันที */
export function refreshStorefront() {
  updateTag(STOREFRONT_TAG);
}
