// ผลค้นหาสินค้า (/search?q=...) — ใช้คำพ้องไทย/อังกฤษชุดเดียวกับช่องค้นหาด่วน
import type { Metadata } from "next";
import { Suspense } from "react";
import { getShopData, searchCatalog } from "@/lib/storefront";
import { PageHead } from "../_components/PageHead";
import { ProductGrid } from "../_components/ProductCard";
import { ListingFallback } from "../_components/ProductListing";

export const metadata: Metadata = {
  title: "ค้นหาสินค้า — มองดูเว็บ",
  robots: { index: false },
};

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const { catalog, categories } = await getShopData();
  const items = q ? searchCatalog(catalog, categories, q) : [];
  return (
    <>
      <form className="track-form" role="search" action="/search" method="get" style={{ marginBottom: 28 }}>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label htmlFor="sq">คำค้นหา</label>
          <input id="sq" name="q" type="search" defaultValue={q} placeholder="เช่น ไฟใต้น้ำ 12V, Pool Light RGB" />
        </div>
        <button className="btn btn-primary" type="submit">
          ค้นหา
        </button>
      </form>
      {q && (
        <p className="sec-sub" role="status" style={{ marginBottom: 20 }}>
          {items.length ? `พบ ${items.length} รายการสำหรับ “${q}”` : ""}
        </p>
      )}
      {q ? (
        <ProductGrid
          items={items}
          empty={
            <>
              <b>ไม่พบสินค้า “{q}”</b>
              ลองคำอื่น เช่น “ไฟใต้น้ำ” “สระ” “RGB” หรือ{" "}
              <a href="/#finder" className="link-more">
                ให้เราช่วยเลือกรุ่น
              </a>
            </>
          }
        />
      ) : null}
    </>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "ค้นหาสินค้า" }]} title="ค้นหาสินค้า" />
      <div className="container pg-body">
        <Suspense fallback={<ListingFallback />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
