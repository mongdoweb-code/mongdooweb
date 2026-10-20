// /admin/products/new และ /admin/products/:id — เพิ่ม/แก้ไขสินค้า
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { ProductForm, type ProductValues } from "../ProductForm";

const baht = (s: number | null) => (s ? String(s / 100) : "");

export default async function ProductEditPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const categories = (await prisma.category.findMany({ orderBy: { sortOrder: "asc" } })).map((c) => ({ id: c.id, name: c.nameTh }));
  let v: ProductValues;
  if (id === "new") {
    v = {
      id: "", name: "", slug: "", sku: "", categoryId: categories[0]?.id ?? "", unit: "ชิ้น", price: "", compareAt: "",
      trackStock: false, stock: 0, inStock: true, isActive: true, isBestSeller: false, badge: "", shortDescription: "", description: "",
      keywords: "", seoTitle: "", seoDescription: "", weightGram: "", specs: [], images: [], useAreas: [], lightColor: "ANY",
      includesPsu: false, isAccessory: false, orders: 0,
    };
  } else {
    const p = await prisma.product.findUnique({ where: { id }, include: { _count: { select: { orderItems: true, docItems: true } } } });
    if (!p) notFound();
    v = {
      id: p.id, name: p.name, slug: p.slug, sku: p.sku, categoryId: p.categoryId, unit: p.unit,
      price: baht(p.priceSatang), compareAt: baht(p.compareAtSatang), trackStock: p.trackStock, stock: p.stock, inStock: p.inStock,
      isActive: p.isActive, isBestSeller: p.isBestSeller, badge: p.badge ?? "", shortDescription: p.shortDescription ?? "",
      description: p.description ?? "", keywords: p.keywords ?? "", seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "",
      weightGram: p.weightGram != null ? String(p.weightGram) : "",
      specs: Array.isArray(p.specs) ? (p.specs as { label: string; value: string }[]).map((s) => ({ label: String(s.label ?? ""), value: String(s.value ?? "") })) : [],
      images: p.images.map((k) => ({ key: k, url: mediaUrl(k, "sm")! })),
      useAreas: p.useAreas, lightColor: p.lightColor, includesPsu: p.includesPsu, isAccessory: p.isAccessory,
      orders: p._count.orderItems + p._count.docItems,
    };
  }
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/products">← สินค้าทั้งหมด</Link></p>
          <h1>{v.id ? v.name : "เพิ่มสินค้าใหม่"}</h1>
        </div>
      </div>
      <ProductForm key={v.id || "new"} v={v} categories={categories} saved={(await searchParams).saved === "1"} />
    </main>
  );
}
