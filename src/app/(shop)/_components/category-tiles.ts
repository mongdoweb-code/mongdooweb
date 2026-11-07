// ข้อมูลแถบ "เลือกซื้อตามหมวดหมู่": หมวดที่มีสินค้า + รูปสินค้าตัวแรกของหมวด (ตามลำดับ "แนะนำ") + จำนวนสินค้า
import type { CatalogItem, ShopCategory } from "@/lib/storefront";
import type { CarouselCat } from "./CategoryCarousel";

export function categoryTiles(categories: ShopCategory[], catalog: CatalogItem[]): CarouselCat[] {
  return categories
    .map((c) => {
      const items = catalog.filter((p) => p.catId === c.slug);
      return { slug: c.slug, th: c.th, img: items.find((p) => p.img)?.img ?? null, count: items.length };
    })
    .filter((c) => c.count > 0);
}
