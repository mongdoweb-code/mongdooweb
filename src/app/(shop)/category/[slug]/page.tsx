// หน้าหมวดสินค้า + ตัวกรอง
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCategory, getShopData } from "@/lib/storefront";
import { PageHead } from "../../_components/PageHead";
import { ListingFallback, ProductListing } from "../../_components/ProductListing";

export async function generateStaticParams() {
  const { categories } = await getShopData();
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const cat = await getCategory(decodeURIComponent((await params).slug));
  if (!cat) return {};
  return {
    title: `${cat.th} (${cat.en}) — มองดูเว็บ`,
    description: `${cat.th} ${cat.popular.join(" ")} จากร้านมองดูเว็บ ส่งไว 2–3 วัน รับประกันสินค้า`,
    alternates: { canonical: `/category/${cat.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/category/[slug]">) {
  const cat = await getCategory(decodeURIComponent((await params).slug));
  if (!cat) notFound();
  const basePath = `/category/${encodeURIComponent(cat.slug)}`;
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "สินค้าทั้งหมด", href: "/products" }, { label: cat.th }]}
        eyebrow={cat.en}
        title={cat.th}
        sub={cat.popular.length ? `ยอดนิยม: ${cat.popular.join(" · ")}` : undefined}
      />
      <div className="container pg-body">
        <Suspense fallback={<ListingFallback />}>
          <ProductListing basePath={basePath} category={cat.slug} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
