// สินค้าทั้งหมด + ลิงก์ไปแต่ละหมวด + เรียงลำดับ/ตัวกรอง
import type { Metadata } from "next";
import { Suspense } from "react";
import { absUrl, getShopData } from "@/lib/storefront";
import { PageHead } from "../_components/PageHead";
import { ListingFallback, ProductListing } from "../_components/ProductListing";

const TITLE = "สินค้าทั้งหมด — มองดูเว็บ";
const DESCRIPTION =
  "รวมไฟ LED ใต้น้ำ ไฟสระว่ายน้ำ ไฟน้ำพุ ไฟสวน ไฟฝังพื้น ไฟเส้น และอุปกรณ์เสริม (หม้อแปลง รีโมท) จากร้านมองดูเว็บ กรองตามการใช้งาน สีแสง และราคา";

export async function generateMetadata(): Promise<Metadata> {
  const { catalog } = await getShopData();
  // รูปแชร์ = รูปสินค้าแรกในรายการ (ขนาดเต็ม)
  const img = catalog.find((p) => p.img)?.img?.replace(/-sm\.webp$/, ".webp");
  const images = img ? [absUrl(img)] : undefined;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/products" },
    openGraph: { type: "website", siteName: "มองดูเว็บ", locale: "th_TH", url: "/products", title: TITLE, description: DESCRIPTION, images },
    twitter: { card: images ? "summary_large_image" : "summary", title: TITLE, description: DESCRIPTION, images },
  };
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const { categories } = await getShopData();
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "สินค้าทั้งหมด" }]} selfHref="/products" eyebrow="ร้านมองดูเว็บ" title="สินค้าทั้งหมด" />
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
