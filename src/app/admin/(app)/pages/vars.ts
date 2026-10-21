// ตัวแปรที่ใช้ในเนื้อหาหน้าได้ เช่น {{phone}} — ค่ามาจากตั้งค่าร้าน
import type { ShopSetting } from "../../../../../generated/prisma/client";

export const PAGE_VARS: [key: string, label: string][] = [
  ["name", "ชื่อร้าน"],
  ["phone", "เบอร์โทร"],
  ["lineId", "LINE ID"],
  ["email", "อีเมล"],
  ["address", "ที่อยู่"],
];

export const pageVars = (s: ShopSetting): Record<string, string> => ({
  name: s.legalName,
  phone: s.phone,
  lineId: s.lineId ?? "",
  email: s.email ?? "",
  address: s.addressText,
});
