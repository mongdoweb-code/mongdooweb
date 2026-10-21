// ตรวจใน src/proxy.ts ว่าหน้าหน้าร้านที่ stream (PPR) มีข้อมูลจริงก่อนเริ่มส่งหน้า
// เหตุผล: notFound() ในหน้าที่เริ่ม stream แล้วได้ HTTP 200 + "ไม่พบหน้า" ฝั่งเบราว์เซอร์ (soft 404 — Google ไม่ชอบ)
// จึงถามฐานข้อมูลแบบเบาๆ (ดัชนี unique) ที่นี่ แล้วตอบ 404/301 จริงก่อน · ฐานข้อมูลมีปัญหา = ปล่อยให้หน้าเพจจัดการเอง
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { parseFaq } from "@/lib/shop-public";

export type RouteCheck = { kind: "ok" } | { kind: "missing" } | { kind: "redirect"; to: string };
const OK: RouteCheck = { kind: "ok" };

/** /product/<slug> (slug ใหม่ a-z0-9-): เปิดขายอยู่ = ok · slug เดิมของเว็บเก่า = 301 · ไม่มี/ปิดขาย = 404 */
export async function checkProduct(slug: string): Promise<RouteCheck> {
  if (!slug || slug.length > 200 || slug.includes("/")) return { kind: "missing" };
  try {
    const p = await prisma.product.findUnique({
      where: { slug },
      select: { isActive: true, isService: true, category: { select: { isActive: true } } },
    });
    if (p) return p.isActive && !p.isService && p.category.isActive ? OK : { kind: "missing" };
    // URL เดิมของ WooCommerce ที่เป็นอักษรอังกฤษ (legacyPath เก็บแบบ /product/<slug>)
    const legacy = await prisma.product.findFirst({
      where: { legacyPath: { in: [`/product/${slug}`, `/product/${slug}/`] }, isActive: true },
      select: { slug: true },
    });
    return legacy ? { kind: "redirect", to: `/product/${encodeURIComponent(legacy.slug)}` } : { kind: "missing" };
  } catch {
    return OK;
  }
}

/** ใบเสร็จฝั่งลูกค้า: มีจริง ออกแล้ว และโทเคนตรง (เทียบแบบเวลาคงที่) */
export async function receiptTokenOk(id: string, token: string): Promise<boolean> {
  if (!id || id.length > 40) return false;
  try {
    const d = await prisma.salesDocument.findUnique({ where: { id }, select: { type: true, status: true, publicToken: true } });
    if (!d || d.type !== "RECEIPT" || d.status === "DRAFT" || !d.publicToken) return false;
    const a = Buffer.from(d.publicToken), b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return true; // ให้หน้าเพจตรวจซ้ำเอง
  }
}

/** /faq ไม่มีคำถามที่แสดงได้ = 404 (เมนูก็ซ่อนอยู่แล้ว) */
export async function faqEmpty(): Promise<boolean> {
  try {
    const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { faq: true } });
    return parseFaq(s?.faq).length === 0;
  } catch {
    return false;
  }
}
