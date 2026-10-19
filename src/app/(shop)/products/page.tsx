// สินค้าทั้งหมด + ลิงก์ไปแต่ละหมวด
import type { Metadata } from "next";
import { Suspense } from "react";
import { getShopData } from "@/lib/storefront";
import { PageHead } from "../_components/PageHead";
import { ListingFallback, ProductListing } from "../_components/ProductListing";

export const metadata: Metadata = {
  title: "สินค้าทั้งหมด — มองดูเว็บ",
  description: "ไฟ LED ใต้น้ำ ไฟสระว่ายน้ำ ไฟน้ำพุ ไฟสวน และอุปกรณ์เสริม จากร้านมองดูเว็บ",
  alternates: { canonical: "/products" },
};

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const { categories } = await getShopData();
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "สินค้าทั้งหมด" }]} eyebrow="ร้านมองดูเว็บ" title="สินค้าทั้งหมด" />
      <div className="container pg-body">
        <nav className="cat-chips" aria-label="หมวดสินค้า">
          {categories.map((c) => (
            <a key={c.slug} className="chip" href={`/category/${encodeURIComponent(c.slug)}`}>
              {c.th}
            </a>
          ))}
        </nav>
        <Suspense fallback={<ListingFallback />}>
          <ProductListing basePath="/products" searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
