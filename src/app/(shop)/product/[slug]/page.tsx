// หน้ารายละเอียดสินค้า — รูป, ราคา/ราคาก่อนลด, สต็อก, สเปก, คำอธิบาย, สินค้าที่เกี่ยวข้อง
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { htmlToText } from "@/lib/html";
import { getProductDetail, getShopData, jsonForScript } from "@/lib/storefront";
import { PageHead } from "../../_components/PageHead";
import { ProductGrid, formatBaht } from "../../_components/ProductCard";
import { BuyBox, Gallery } from "./ProductBuy";

// สินค้า/หมวดที่เพิ่มใหม่หลัง build (ไม่อยู่ใน generateStaticParams) ให้ render ตอนเปิดหน้าได้
export const instant = false;

export async function generateStaticParams() {
  const { catalog } = await getShopData();
  return catalog.slice(0, 40).map((p) => ({ slug: p.id }));
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const p = await getProductDetail(decode((await params).slug));
  if (!p) return {};
  const desc = p.seoDescription || htmlToText(p.shortDescription ?? p.description ?? "").slice(0, 160) || `${p.name} ราคา ${formatBaht(p.price)}`;
  return {
    title: `${p.seoTitle || p.name} — มองดูเว็บ`,
    description: desc,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { title: p.name, description: desc, images: p.images[0] ? [p.images[0].full] : undefined, type: "website" },
  };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const slug = decode((await params).slug);
  const p = await getProductDetail(slug);
  // URL เดิมของเว็บ WooCommerce ถูก redirect ที่ src/proxy.ts ก่อนถึงหน้านี้แล้ว
  if (!p) notFound();
  const { catalog } = await getShopData();
  // สินค้าในหมวดเดียวกัน (ไม่รวมตัวเอง) สูงสุด 4 ชิ้น
  const related = catalog.filter((x) => x.id !== p.slug && x.catId === p.category.slug).slice(0, 4);
  const catHref = `/category/${encodeURIComponent(p.category.slug)}`;
  const canBuy = p.price > 0 && p.inStock;
  const badge = p.badge ?? (p.compareAt ? `ลด ${Math.round((1 - p.price / p.compareAt) * 100)}%` : null);
  const max = Math.min(999, p.stockLeft ?? 999);

  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    category: p.category.th,
    brand: { "@type": "Brand", name: "มองดูเว็บ" },
    ...(p.images.length ? { image: p.images.map((i) => i.full) } : {}),
    ...(p.price > 0
      ? {
          offers: {
            "@type": "Offer",
            price: p.price,
            priceCurrency: "THB",
            availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url: `/product/${p.slug}`,
          },
        }
      : {}),
  };

  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[
          { label: "สินค้าทั้งหมด", href: "/products" },
          { label: p.category.th, href: catHref },
          { label: p.name },
        ]}
        title=""
      />
      <div className="container pg-body">
        <div className="pdp">
          <Gallery images={p.images} alt={p.name} badge={badge} />
          <div>
            <a className="eyebrow" href={catHref}>
              {p.category.th}
            </a>
            <h1>{p.name}</h1>
            <div className="pdp-price">
              {p.price > 0 ? formatBaht(p.price) : "สอบถามราคา"}
              {p.compareAt && <s>{formatBaht(p.compareAt)}</s>}
            </div>
            <div className="pdp-meta">
              รหัสสินค้า {p.sku}
              {p.price > 0 && ` · ราคาต่อ${p.unit} · ยังไม่รวมค่าจัดส่ง`}
            </div>
            {p.price > 0 &&
              (p.inStock ? (
                <div className={`pdp-stock ${p.stockLeft != null && p.stockLeft <= 5 ? "low" : "ok"}`}>
                  {p.stockLeft != null && p.stockLeft <= 5 ? `เหลือ ${p.stockLeft} ${p.unit}` : "มีสินค้าพร้อมส่ง"}
                </div>
              ) : (
                <div className="pdp-stock out">สินค้าหมดชั่วคราว</div>
              ))}
            {p.shortDescription && <div className="pdp-short" dangerouslySetInnerHTML={{ __html: p.shortDescription }} />}
            {canBuy ? (
              <BuyBox slug={p.slug} max={max} />
            ) : (
              <div className="pdp-actions">
                <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">
                  {p.price > 0 ? "สอบถามวันที่สินค้าเข้า ทาง LINE" : "สอบถามราคาทาง LINE"}
                </a>
              </div>
            )}
            {canBuy && (
              <p style={{ marginTop: -8, marginBottom: 16 }}>
                <a className="link-more" href="#" data-line target="_blank" rel="noopener">
                  สอบถามเพิ่มเติมทาง LINE
                </a>
              </p>
            )}
            {!p.isAccessory && ["underwater-light", "pool-light", "fountain-light", "garden-light", "uplight-led"].includes(p.category.slug) && (
              <p className="pdp-note">
                {p.includesPsu ? "ชุดพร้อมใช้ มีหม้อแปลงไฟในกล่องแล้ว · " : "ไฟ DC12V ต้องต่อผ่านหม้อแปลง · "}
                <b>ห้ามต่อไฟบ้าน 220V โดยตรง</b>
              </p>
            )}
            {p.specs.length > 0 && (
              <table className="spec-table">
                <caption className="sr-only">สเปกสินค้า</caption>
                <tbody>
                  {p.specs.map((s, i) => (
                    <tr key={i}>
                      <th scope="row">{s.label || "คุณสมบัติ"}</th>
                      <td>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {p.description && (
          <section className="prose-desc" aria-labelledby="desc-h">
            <h2 id="desc-h" className="sec-title" style={{ fontSize: 24 }}>
              รายละเอียดสินค้า
            </h2>
            {/* คำอธิบายผ่านการล้าง HTML แล้วตอนนำเข้า/บันทึก (src/lib/html.ts) */}
            <div dangerouslySetInnerHTML={{ __html: p.description }} />
          </section>
        )}

        {related.length > 0 && (
          <section className="pdp-related" aria-labelledby="related-h">
            <div className="sec-head">
              <h2 className="sec-title" id="related-h">
                สินค้าในหมวดเดียวกัน
              </h2>
              <a className="link-more" href={catHref}>
                ดูทั้งหมวด
              </a>
            </div>
            <ProductGrid items={related} />
          </section>
        )}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
    </main>
  );
}
