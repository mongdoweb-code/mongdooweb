// redirect 301 จาก URL สินค้าเดิมของเว็บ WooCommerce (/product/ชื่อภาษาไทย) — src/proxy.ts ส่งมาที่นี่
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  // proxy ส่ง path เดิมมาทาง header (query ของ rewrite ไม่ถูกส่งต่อ)
  let path = "";
  try {
    path = decodeURIComponent(req.headers.get("x-legacy-path") ?? "").normalize("NFC");
  } catch {}
  const p = path ? await prisma.product.findUnique({ where: { legacyPath: path }, select: { slug: true, isActive: true } }) : null;
  const to = p?.isActive ? `/product/${encodeURIComponent(p.slug)}` : "/products";
  // Location แบบ path (ไม่ผูกกับ host ภายในของเซิร์ฟเวอร์ที่อยู่หลัง proxy เช่น localhost:8080 บน Railway)
  return new Response(null, { status: 301, headers: { Location: to, "Cache-Control": "public, max-age=3600" } });
}
