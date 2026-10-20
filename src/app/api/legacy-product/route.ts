// redirect 301 จาก URL สินค้าเดิมของเว็บ WooCommerce (/product/ชื่อภาษาไทย) — src/proxy.ts ส่งมาที่นี่
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // proxy ส่ง path เดิมมาทาง header (query ของ rewrite ไม่ถูกส่งต่อ)
  let path = "";
  try {
    path = decodeURIComponent(req.headers.get("x-legacy-path") ?? "").normalize("NFC");
  } catch {}
  const p = path ? await prisma.product.findUnique({ where: { legacyPath: path }, select: { slug: true, isActive: true } }) : null;
  const to = p?.isActive ? `/product/${encodeURIComponent(p.slug)}` : "/products";
  return Response.redirect(new URL(to, url), 301);
}
