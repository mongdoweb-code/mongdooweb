// /sitemap.xml — ให้ Google รู้จักทุกหน้าสินค้า/หมวด (ช่วยย้าย SEO จากเว็บ WooCommerce เดิม)
// แคชไว้และล้างด้วย tag storefront เหมือนหน้าร้าน — แก้สินค้าในหลังบ้านแล้ว sitemap อัปเดตตาม
import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";

async function entries() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true, isService: false, category: { isActive: true } }, select: { slug: true, updatedAt: true }, orderBy: { sortOrder: "asc" } }),
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return { products: products.map((p) => ({ slug: p.slug, at: p.updatedAt.toISOString() })), categories: categories.map((c) => c.slug) };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const { products, categories } = await entries();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.9 },
    ...categories.map((slug) => ({ url: `${base}/category/${slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${base}/product/${p.slug}`, lastModified: p.at, changeFrequency: "weekly" as const, priority: 0.7 })),
    { url: `${base}/warranty`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
