// ค่าตั้งร้านส่วนหน้าร้านรอบ 2: แถบประกาศ, รหัส Analytics (โหลดเมื่อลูกค้ายินยอมเท่านั้น), คำถามที่พบบ่อย
// แคชไว้ ล้างด้วย tag storefront เมื่อหลังบ้านบันทึกตั้งค่า — ค่าว่าง/ผิดรูปแบบ = ปิดส่วนนั้นอย่างนุ่มนวล
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { STOREFRONT_TAG, getSettings } from "@/lib/settings";

export type FaqItem = { q: string; a: string };

/** ลิงก์จากหลังบ้าน: เฉพาะ /path (ไม่ใช่ //), #, https://, tel:, mailto: */
export const safeHref = (h: string | null | undefined) => {
  const s = (h ?? "").trim();
  return /^(\/(?!\/)|#|https?:\/\/|tel:|mailto:)[^\s"'<>]*$/i.test(s) ? s : null;
};

/** GA4 measurement ID "G-XXXXXXX" */
export const validGa4 = (v: string | null | undefined) => {
  const s = (v ?? "").trim().toUpperCase();
  return /^G-[A-Z0-9]{4,20}$/.test(s) ? s : null;
};
/** Meta Pixel ID ตัวเลข 10–20 หลัก */
export const validPixel = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return /^\d{10,20}$/.test(s) ? s : null;
};

/** ShopSetting.faq = [{ q, a }] — ข้ามรายการที่ไม่มีคำถามหรือคำตอบ */
export function parseFaq(v: unknown): FaqItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    .map((x) => ({ q: String(x.q ?? "").trim().slice(0, 300), a: String(x.a ?? "").trim().slice(0, 4000) }))
    .filter((x) => x.q && x.a)
    .slice(0, 100);
}

export async function getStorefrontExtras() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const s = await getSettings();
  const text = s.announcementText.trim().slice(0, 200);
  return {
    announcement: s.announcementEnabled && text ? { text, href: safeHref(s.announcementHref) } : null,
    ga4Id: validGa4(s.ga4Id),
    metaPixelId: validPixel(s.metaPixelId),
    faq: parseFaq(s.faq),
  };
}
