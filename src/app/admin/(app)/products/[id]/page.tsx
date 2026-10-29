// /admin/products/new และ /admin/products/:id — เพิ่ม/แก้ไขสินค้า
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { htmlToText } from "@/lib/html";
import { mediaUrl } from "@/lib/media";
import { downloadHref, fileSize, parseDownloads } from "@/lib/product-downloads";
import { toBkkInput } from "@/lib/product-extras";
import { parseTiers } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { parseAttrs } from "@/lib/specs";
import { optionLabel, readOptions } from "@/lib/variants";
import "../../../lot3.css";
import { DownloadsBox } from "../DownloadsBox";
import { ProductForm, type ProductValues } from "../ProductForm";
import { HistoryLink } from "../../../_components/HistoryLink";
import { Icons } from "../../../_components/RowActions";
import { duplicateProduct } from "../actions";

const baht = (s: number | null) => (s ? String(s / 100) : "");

export default async function ProductEditPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const categories = (await prisma.category.findMany({ orderBy: { sortOrder: "asc" } })).map((c) => ({ id: c.id, name: c.nameTh }));
  const specDefs = (await prisma.specAttribute.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })).map(({ createdAt: _c, ...d }) => {
    void _c;
    return d;
  });
  let downloads: { key: string; name: string; size: string; href: string }[] = [];
  let v: ProductValues;
  if (id === "new") {
    v = {
      id: "", name: "", slug: "", sku: "", categoryId: categories[0]?.id ?? "", unit: "ชิ้น", price: "", compareAt: "",
      trackStock: false, stock: 0, inStock: true, isActive: true, isBestSeller: false, badge: "", shortDescription: "", description: "",
      keywords: "", seoTitle: "", seoDescription: "", weightGram: "", specs: [], images: [], useAreas: [], lightColor: "ANY",
      includesPsu: false, isAccessory: false, orders: 0,
      extras: { salePrice: "", saleStartsAt: "", saleEndsAt: "", tiers: [], attrs: {}, group: null },
    };
  } else {
    const p = await prisma.product.findUnique({ where: { id }, include: { _count: { select: { orderItems: true, docItems: true } }, variantGroup: true } });
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
      extras: {
        salePrice: baht(p.salePriceSatang),
        saleStartsAt: toBkkInput(p.saleStartsAt),
        saleEndsAt: toBkkInput(p.saleEndsAt),
        tiers: parseTiers(p.tierPrices).map((t) => ({ minQty: String(t.minQty), price: String(t.priceSatang / 100) })),
        attrs: Object.fromEntries(Object.entries(parseAttrs(p.attrs)).map(([k, x]) => [k, String(x)])),
        group: p.variantGroup
          ? { id: p.variantGroup.id, name: p.variantGroup.name, options: optionLabel(p.variantGroup.optionNames, readOptions(p.variantOptions, p.variantGroup.optionNames)) }
          : null,
      },
    };
    downloads = parseDownloads(p.downloads).map((d) => ({ key: d.key, name: d.name, size: fileSize(d.sizeBytes), href: downloadHref(p.slug, d.key) }));
  }
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/products">← สินค้าทั้งหมด</Link></p>
          <h1>{v.id ? v.name : "เพิ่มสินค้าใหม่"}</h1>
          {v.id && <p><HistoryLink entity={`Product:${v.id}`} /></p>}
        </div>
        {v.id && (
          <div className="head-actions">
            {v.isActive && <a className="btn btn-outline" href={`/product/${v.slug}`} target="_blank" rel="noopener">{Icons.eye}ดูหน้าร้าน</a>}
            <form action={duplicateProduct}>
              <input type="hidden" name="id" value={v.id} />
              <button className="btn btn-outline" type="submit" id="dupTop" title="สร้างสินค้าใหม่จากข้อมูลนี้ — สำเนาปิดขายไว้ก่อน สต็อก 0">{Icons.copy}ทำสำเนาสินค้า</button>
            </form>
          </div>
        )}
      </div>
      <ProductForm
        key={v.id || "new"} v={v} categories={categories} saved={sp.saved === "1"} copied={sp.copied === "1"} owner={admin.role === "OWNER"}
        siteHost={(process.env.SITE_URL ?? "https://www.mongdooweb.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "")}
        shortText={htmlToText(v.shortDescription || v.description).slice(0, 160)}
        specDefs={specDefs}
      >
        {v.id && <DownloadsBox productId={v.id} files={downloads} />}
      </ProductForm>
    </main>
  );
}
