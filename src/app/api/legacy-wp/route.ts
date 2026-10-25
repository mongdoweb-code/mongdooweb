// redirect 301 จาก URL แบบ query ของ WordPress/WooCommerce เดิม (next.config.ts ส่ง "/?..." มาที่นี่พร้อม query เดิม)
//   /?p=123 /?page_id=                                   → บทความที่มี wpId ตรงกัน (/blog/<slug>) ถ้ามี
//   /?p=123 /?page_id= /?attachment_id= /?add-to-cart=  → สินค้าที่มี wooId ตรงกัน (ไม่พบ → สินค้าทั้งหมด)
//   /?product=<slug เดิม>                               → สินค้าที่ legacyPath ตรงกัน
//   /?product_cat=<slug เดิม>                           → หมวดที่ legacySlug ตรงกัน
//   /?s=<คำค้น>                                        → /search?q=
//   /?post_type=product /?cat= /?tag= /?product_tag=    → สินค้าทั้งหมด / ค้นหา
// ไม่มีอะไรตรงเลย → หน้าแรก (ไม่ใช่ 404)
import { legacySlugWhere } from "@/lib/legacy-category";
import { prisma } from "@/lib/prisma";

const clean = (v: string | null) => (v ?? "").normalize("NFC").trim().slice(0, 300);

async function resolve(q: URLSearchParams): Promise<string> {
  const s = clean(q.get("s"));
  if (s) return `/search?q=${encodeURIComponent(s.slice(0, 100))}`;

  const product = clean(q.get("product"));
  if (product) {
    const p = await prisma.product.findFirst({
      where: { OR: [{ legacyPath: `/product/${product}` }, { slug: product }], isActive: true },
      select: { slug: true },
    });
    return p ? `/product/${encodeURIComponent(p.slug)}` : "/products";
  }

  const productCat = clean(q.get("product_cat"));
  if (productCat) {
    const c = await prisma.category.findFirst({
      where: { OR: [legacySlugWhere(productCat), { slug: productCat }], isActive: true },
      select: { slug: true },
    });
    return c ? `/category/${encodeURIComponent(c.slug)}` : "/products";
  }

  const tag = clean(q.get("product_tag") ?? q.get("tag"));
  if (tag) return `/search?q=${encodeURIComponent(tag.replace(/-/g, " ").slice(0, 100))}`;

  for (const key of ["p", "page_id", "attachment_id", "add-to-cart"]) {
    const id = Number(q.get(key));
    if (Number.isInteger(id) && id > 0 && id < 2 ** 31) {
      // บทความเดิมของ WordPress (/?p=123) → /blog/<slug> (Post.wpId ตั้งในหลังบ้าน /admin/posts)
      if (key === "p" || key === "page_id") {
        const post = await prisma.post.findFirst({ where: { wpId: id, status: "PUBLISHED", OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] }, select: { slug: true } });
        if (post) return `/blog/${encodeURIComponent(post.slug)}`;
      }
      const p = await prisma.product.findFirst({ where: { wooId: id, isActive: true }, select: { slug: true } });
      if (p) return `/product/${encodeURIComponent(p.slug)}`;
      // หน้า/บทความของ WordPress ที่ไม่ใช่สินค้า → หน้าแรก; ถ้าเป็นการขอสินค้า → สินค้าทั้งหมด
      return key === "add-to-cart" || q.get("post_type") === "product" ? "/products" : "/";
    }
  }

  if (q.get("post_type") === "product" || q.has("cat")) return "/products";
  return "/";
}

export async function GET(req: Request) {
  const to = await resolve(new URL(req.url).searchParams);
  // Location แบบ path (ไม่ผูกกับ host ภายในของเซิร์ฟเวอร์ที่อยู่หลัง proxy)
  return new Response(null, { status: 301, headers: { Location: to, "Cache-Control": "public, max-age=3600" } });
}
