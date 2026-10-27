// ผลค้นหาสินค้า (/search?q=...) — ค้นจากชื่อ รหัสสินค้า หมวด สเปก และคำพ้องไทย/อังกฤษ (แก้ได้ที่ /admin/search)
// พิมพ์ผิดเล็กน้อยยังเจอ (ผลใกล้เคียง) · บันทึกคำค้น + จำนวนผล (ไม่เก็บข้อมูลผู้ใช้) ไว้ดูคำที่ค้นไม่เจอในหลังบ้าน
// ไม่เจอ → คำค้นแนะนำ + หมวดยอดนิยม + ปุ่มถามร้านทาง LINE (พิมพ์คำค้นไว้ให้)
import type { Metadata } from "next";
import { after } from "next/server";
import { Suspense } from "react";
import { getSynonymGroups, logSearch, smartSearch } from "@/lib/search";
import { getPublicShopInfo } from "@/lib/settings";
import { getShopData, lineMessageUrl } from "@/lib/storefront";
import { PageHead } from "../_components/PageHead";
import { ProductGrid } from "../_components/ProductCard";
import { ListingFallback } from "../_components/ProductListing";

export const metadata: Metadata = {
  title: "ค้นหาสินค้า — มองดูเว็บ",
  description: "ค้นหาไฟ LED ใต้น้ำ ไฟสระว่ายน้ำ ไฟน้ำพุ ไฟสวน และอุปกรณ์เสริม ด้วยชื่อสินค้า รหัสสินค้า หรือการใช้งาน",
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};

const SUGGEST = ["ไฟใต้น้ำ", "ไฟสระ", "RGB", "หม้อแปลง 12V", "ไฟเส้น", "ไฟฝังพื้น"];

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const [{ catalog, categories }, info, synonyms] = await Promise.all([getShopData(), getPublicShopInfo(), getSynonymGroups()]);
  const { items, approx } = q ? smartSearch(catalog, categories, q, synonyms) : { items: [], approx: false };
  // บันทึกหลังส่งหน้าแล้ว (ไม่ทำให้หน้าช้า)
  if (q) after(() => logSearch(q, items.length));
  const popular = categories.filter((c) => c.visible && catalog.some((p) => p.catId === c.slug)).slice(0, 8);
  const lineHref = lineMessageUrl(info.lineId, `สวัสดีครับ/ค่ะ กำลังหาสินค้า: ${q || "ไฟ LED"} มีรุ่นที่แนะนำไหมครับ/คะ`, info.lineUrl);

  return (
    <>
      <form className="srch-form" role="search" action="/search" method="get">
        <label htmlFor="sq" className="sr-only">
          คำค้นหา
        </label>
        <input id="sq" name="q" type="search" defaultValue={q} placeholder="ชื่อสินค้า รหัสสินค้า หรือการใช้งาน เช่น ไฟสระ, RGB, DL1" />
        <button className="btn btn-primary" type="submit">
          ค้นหา
        </button>
      </form>
      {q && (
        <p className="lst-count srch-count" role="status">
          {items.length ? (
            approx ? (
              <>
                ไม่พบผลที่ตรงทุกคำสำหรับ “{q}” · แสดง <b>{items.length.toLocaleString("th-TH")}</b> รายการที่ใกล้เคียง
              </>
            ) : (
              <>
                พบ <b>{items.length.toLocaleString("th-TH")}</b> รายการสำหรับ “{q}”
              </>
            )
          ) : (
            <>ไม่พบสินค้าสำหรับ “{q}”</>
          )}
        </p>
      )}
      {q && items.length > 0 && <ProductGrid items={items} eager={4} />}
      {(!q || !items.length) && (
        <div className="srch-empty">
          {q && (
            <div className="srch-empty-head">
              <b>ไม่พบสินค้า “{q}”</b>
              <p>ลองตรวจตัวสะกด ใช้คำที่สั้นลง หรือค้นด้วยรหัสสินค้า — หรือส่งคำถามให้ร้านทาง LINE เราช่วยหารุ่นที่เหมาะให้ได้</p>
            </div>
          )}
          <div className="srch-block">
            <h2 className="srch-h">คำค้นยอดนิยม</h2>
            <div className="lst-chips">
              {SUGGEST.map((s) => (
                <a key={s} className="chip" href={`/search?q=${encodeURIComponent(s)}`}>
                  {s}
                </a>
              ))}
            </div>
          </div>
          <div className="srch-block">
            <h2 className="srch-h">หมวดยอดนิยม</h2>
            <div className="lst-chips">
              {popular.map((c) => (
                <a key={c.slug} className="chip" href={`/category/${encodeURIComponent(c.slug)}`}>
                  {c.th}
                </a>
              ))}
            </div>
          </div>
          <div className="srch-actions">
            <a className="btn btn-line" href={lineHref} target="_blank" rel="noopener">
              ถามร้านทาง LINE
            </a>
            <a className="btn btn-outline" href="/#finder">
              ให้เราช่วยเลือกรุ่น
            </a>
          </div>
        </div>
      )}
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
