// /admin/products/order — จัดเรียงสินค้าหน้าร้าน: เห็นทุกชิ้นในหน้าเดียว ลากวาง/พิมพ์ลำดับ/บนสุด-ล่างสุด/ปักหมุด/เรียงอัตโนมัติ · 3 มุมมอง
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { docDateTime } from "@/lib/doc-calc";
import { mediaUrl } from "@/lib/media";
import { unitPriceSatang } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { BOARD_WHERE, lastOrderVersion } from "@/lib/product-order";
import { getSettings } from "@/lib/settings";
import { PRODUCT_ORDER } from "@/lib/storefront";
import { OrderBoard, type BoardProduct } from "./OrderBoard";
import "./order.css";

export default async function ProductOrderPage() {
  await requireAdmin();
  const [rows, sold, last, s] = await Promise.all([
    prisma.product.findMany({
      where: BOARD_WHERE,
      orderBy: PRODUCT_ORDER,
      select: {
        id: true, sku: true, name: true, slug: true, images: true, isActive: true, isPinned: true, createdAt: true,
        priceSatang: true, salePriceSatang: true, saleStartsAt: true, saleEndsAt: true, tierPrices: true,
        trackStock: true, stock: true, inStock: true, variantGroupId: true,
        variantGroup: { select: { name: true, primaryId: true } },
        category: { select: { nameTh: true, sortOrder: true, isActive: true } },
      },
    }),
    prisma.orderItem.groupBy({ by: ["productId"], where: { productId: { not: null }, order: { status: { in: ["PAID", "SHIPPED"] } } }, _sum: { qty: true } }),
    lastOrderVersion(),
    getSettings(),
  ]);
  const soldBy = new Map(sold.map((r) => [r.productId, r._sum.qty ?? 0]));
  const products: BoardProduct[] = rows.map((p) => ({
    id: p.id, sku: p.sku, name: p.name, slug: p.slug, img: (p.images[0] && mediaUrl(p.images[0], "sm")) || "",
    pinned: p.isPinned, price: unitPriceSatang(p), sold: soldBy.get(p.id) ?? 0, created: p.createdAt.getTime(),
    cat: p.category.nameTh, catOrder: p.category.sortOrder,
    // ไม่แสดงหน้าร้าน: ปิดขาย หรือหมวดถูกซ่อน
    hidden: !p.isActive ? "ปิดขาย" : !p.category.isActive ? "หมวดถูกซ่อน" : "",
    out: p.trackStock ? p.stock <= 0 : !p.inStock,
    group: p.variantGroupId ? { id: p.variantGroupId, name: p.variantGroup?.name ?? "", primary: p.variantGroup?.primaryId === p.id, hasPrimary: !!p.variantGroup?.primaryId } : null,
  }));

  return (
    <main className="main ob-page">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/products">← สินค้า</Link></p>
          <h1>จัดเรียงสินค้าหน้าร้าน</h1>
          <p>ลำดับนี้ใช้กับ “สินค้าทั้งหมด” หน้าหมวด และผลค้นหา เมื่อลูกค้าเรียงแบบ “แนะนำ” (ค่าเริ่มต้น) · สินค้าใหม่/ทำสำเนาขึ้นบนสุดให้อัตโนมัติ</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/products" target="_blank" rel="noopener">ดูหน้าร้าน ↗</a>
        </div>
      </div>
      <OrderBoard products={products} lastSaved={last ? `${docDateTime(last.publishedAt, s.dateEra)}${last.publishedBy ? ` · ${last.publishedBy}` : ""}` : null} />
    </main>
  );
}
