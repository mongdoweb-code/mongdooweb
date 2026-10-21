// หน้าหมวดสินค้า + เรียงลำดับ/ตัวกรอง (อยู่ใน URL)
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { htmlToText } from "@/lib/html";
import { absUrl, getCategory, getCategoryByLegacySlug, getShopData } from "@/lib/storefront";
import { PageHead } from "../../_components/PageHead";
import { ListingFallback, ProductListing } from "../../_components/ProductListing";

// สินค้า/หมวดที่เพิ่มใหม่หลัง build (ไม่อยู่ใน generateStaticParams) ให้ render ตอนเปิดหน้าได้
export const instant = false;

export async function generateStaticParams() {
  const { categories } = await getShopData();
  return categories.map((c) => ({ slug: c.slug }));
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function describe(cat: NonNullable<Awaited<ReturnType<typeof getCategory>>>) {
  const own = cat.description ? htmlToText(cat.description).slice(0, 160) : "";
  if (own) return own;
  const pop = cat.popular.length ? ` เช่น ${cat.popular.join(" ")}` : "";
  return `${cat.th} (${cat.en})${pop} จากร้านมองดูเว็บ ราคาชัดเจน สั่งออนไลน์ได้ ส่งไว 2–3 วัน รับประกันสินค้า ปรึกษาฟรีทาง LINE`;
}

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const cat = await getCategory(decode((await params).slug));
  if (!cat) return {};
  const title = `${cat.th} (${cat.en}) — มองดูเว็บ`;
  const description = describe(cat);
  const url = `/category/${cat.slug}`;
  const images = cat.image ? [{ url: absUrl(cat.image.url), alt: cat.image.alt }] : undefined;
  return {
    title,
    description,
    // canonical ไม่มี query (ตัวกรอง/หน้า) → Google รวมเป็นหน้าเดียว
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "มองดูเว็บ", locale: "th_TH", url, title, description, images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: images?.map((i) => i.url) },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/category/[slug]">) {
  const slug = decode((await params).slug);
  const cat = await getCategory(slug);
  if (!cat) {
    // URL หมวด/บทความเดิมของ WordPress (/category/...) → หมวดใหม่ที่ตรงกัน หรือสินค้าทั้งหมด (ไม่ใช่ 404)
    const to = await getCategoryByLegacySlug(slug);
    permanentRedirect(to ? `/category/${encodeURIComponent(to)}` : "/products");
  }
  const selfHref = `/category/${encodeURIComponent(cat.slug)}`;
  const crumbs = [{ label: "สินค้าทั้งหมด", href: "/products" }, { label: cat.th }];
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={crumbs}
        selfHref={selfHref}
        eyebrow={cat.en}
        title={cat.th}
        sub={cat.popular.length ? `ยอดนิยม: ${cat.popular.join(" · ")}` : undefined}
      />
      <div className="container pg-body">
        <Suspense fallback={<ListingFallback />}>
          <ProductListing basePath={selfHref} category={cat.slug} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
