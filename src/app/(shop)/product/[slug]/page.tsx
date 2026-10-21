// หน้ารายละเอียดสินค้า — แกลเลอรี, ราคา/สต็อก, เลือกจำนวน, ซื้อคู่กัน, สเปก, คำอธิบาย, สินค้าในหมวด, ดูล่าสุด
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { htmlToText } from "@/lib/html";
import { getPublicShopInfo } from "@/lib/settings";
import { absUrl, getProductDetail, getShopData, jsonForScript, lineMessageUrl, pairedProducts } from "@/lib/storefront";
import { PageHead } from "../../_components/PageHead";
import { ProductCard, ProductGrid, formatBaht } from "../../_components/ProductCard";
import { RecentlyViewed } from "../../_components/RecentlyViewed";
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

/**
 * ปรับ HTML คำอธิบาย (ล้างแล้วตอนบันทึก) ตอนแสดง: รูปถอดรหัสแบบ async และตัดลิงก์ว่าง
 * (ลิงก์รูปจากเว็บเดิมที่รูปถูกตัดทิ้งไป เหลือ <a> ไม่มีข้อความ — โปรแกรมอ่านหน้าจออ่านไม่ได้)
 */
function descriptionHtml(html: string) {
  let out = html
    // ลิงก์ที่ครอบรูปเดียว (ชี้ไปไฟล์รูปบนเว็บเดิมที่ไม่มีแล้ว) → เหลือแต่รูป
    .replace(/<a\b[^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi, "$1")
    .replace(/<img (?![^>]*decoding=)/g, '<img decoding="async" ');
  for (let i = 0; i < 3; i++) out = out.replace(/<a\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>|<span>\s*<\/span>)*<\/a>/gi, "");
  return out;
}

type Detail =NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

/** คำอธิบายสั้นสำหรับ meta / JSON-LD — ไม่มีวันว่าง */
function describe(p: Detail) {
  return (
    p.seoDescription ||
    htmlToText(p.shortDescription || p.description || "").slice(0, 160) ||
    `${p.name} (รหัส ${p.sku}) ${p.price > 0 ? `ราคา ${formatBaht(p.price)}` : "สอบถามราคาทาง LINE"} — ${p.category.th} จากร้านมองดูเว็บ ส่งไว รับประกันสินค้า`
  );
}

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const p = await getProductDetail(decode((await params).slug));
  if (!p) return {};
  const title = `${p.seoTitle || p.name} — มองดูเว็บ`;
  const description = describe(p);
  const url = `/product/${p.slug}`;
  const images = p.images.slice(0, 4).map((i) => ({ url: absUrl(i.full), alt: p.name }));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "มองดูเว็บ", locale: "th_TH", url, title: p.name, description, images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title: p.name, description, images: images.map((i) => i.url) },
  };
}

function productLd(p: Detail) {
  const url = absUrl(`/product/${encodeURIComponent(p.slug)}`);
  const text = htmlToText(p.description || p.shortDescription || "");
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: p.name,
    sku: p.sku,
    mpn: p.sku,
    url,
    category: p.category.th,
    description: (text || describe(p)).slice(0, 5000),
    brand: { "@type": "Brand", name: "มองดูเว็บ" },
    ...(p.images.length ? { image: p.images.map((i) => absUrl(i.full)) } : {}),
    // ราคา 0 = "สอบถามราคา" → ไม่ใส่ offers (ห้ามมีราคาว่าง/0 ใน schema)
    ...(p.price > 0
      ? {
          offers: {
            "@type": "Offer",
            url,
            price: p.price.toFixed(2),
            priceCurrency: "THB",
            availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@type": "Organization", name: "มองดูเว็บ", url: absUrl("/") },
          },
        }
      : {}),
  };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const slug = decode((await params).slug);
  const p = await getProductDetail(slug);
  // URL เดิมของเว็บ WooCommerce ถูก redirect ที่ src/proxy.ts ก่อนถึงหน้านี้แล้ว
  if (!p) notFound();
  const [{ catalog }, info] = await Promise.all([getShopData(), getPublicShopInfo()]);
  const pairs = pairedProducts(p, catalog, 4, htmlToText(`${p.shortDescription ?? ""} ${p.description ?? ""}`));
  const paired = new Set(pairs.map((x) => x.item.id));
  // สินค้าในหมวดเดียวกัน (ไม่รวมตัวเองและที่อยู่ใน "ซื้อคู่กัน" แล้ว) สูงสุด 4 ชิ้น
  const related = catalog.filter((x) => x.id !== p.slug && x.catId === p.category.slug && !paired.has(x.id)).slice(0, 4);
  const selfHref = `/product/${encodeURIComponent(p.slug)}`;
  const catHref = `/category/${encodeURIComponent(p.category.slug)}`;
  const canBuy = p.price > 0 && p.inStock;
  const badge = p.badge ?? (p.compareAt ? `ลด ${Math.round((1 - p.price / p.compareAt) * 100)}%` : null);
  const max = Math.min(999, p.stockLeft ?? 999);
  const low = p.stockLeft != null && p.stockLeft <= 5;
  const crumbs = [{ label: "สินค้าทั้งหมด", href: "/products" }, { label: p.category.th, href: catHref }, { label: p.name }];

  // ข้อความที่พิมพ์ไว้ให้ในแชท LINE: ชื่อสินค้า + รหัส + ลิงก์ (ร้านรู้ทันทีว่าลูกค้าถามรุ่นไหน)
  const ask = (what: string) => lineMessageUrl(info.lineId, `สวัสดีครับ/ค่ะ ${what}\n${p.name}\nรหัสสินค้า: ${p.sku}\n${absUrl(selfHref)}`, info.lineUrl);
  const lineAsk =
    p.price <= 0 ? ask("ขอสอบถามราคาสินค้า") : !p.inStock ? ask("ขอสอบถามวันที่สินค้าเข้า") : ask("ขอสอบถามเพิ่มเติมเกี่ยวกับสินค้า");

  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={crumbs} selfHref={selfHref} title="" />
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
              {p.compareAt && (
                <s>
                  <span className="sr-only">ราคาปกติ </span>
                  {formatBaht(p.compareAt)}
                </s>
              )}
            </div>
            <div className="pdp-meta">
              รหัสสินค้า {p.sku}
              {p.price > 0 && ` · ราคาต่อ${p.unit} · ยังไม่รวมค่าจัดส่ง`}
            </div>
            {p.price > 0 &&
              (p.inStock ? (
                <div className={`pdp-stock ${low ? "low" : "ok"}`}>{low ? `เหลือ ${p.stockLeft} ${p.unit}` : "มีสินค้าพร้อมส่ง"}</div>
              ) : (
                <div className="pdp-stock out">สินค้าหมดชั่วคราว</div>
              ))}
            {p.shortDescription && <div className="pdp-short" dangerouslySetInnerHTML={{ __html: descriptionHtml(p.shortDescription) }} />}
            {canBuy ? (
              <>
                <BuyBox
                  slug={p.slug}
                  max={max}
                  stockLeft={p.stockLeft}
                  unit={p.unit}
                  name={p.name}
                  price={formatBaht(p.price)}
                  img={p.images[0]?.sm}
                />
                <p className="pdp-ask">
                  <a className="link-more" href={lineAsk} target="_blank" rel="noopener">
                    สอบถามเพิ่มเติมทาง LINE
                  </a>
                </p>
              </>
            ) : (
              <div className="pdp-actions">
                <a className="btn btn-line pdp-line" href={lineAsk} target="_blank" rel="noopener" data-line-ask>
                  {p.price > 0 ? "สอบถามวันที่สินค้าเข้า ทาง LINE" : "สอบถามราคาทาง LINE"}
                </a>
                <p className="pdp-qty-note">
                  {p.price > 0
                    ? "สินค้าหมดชั่วคราว — ทักร้านเพื่อจองหรือสอบถามรุ่นใกล้เคียง"
                    : "ราคาขึ้นกับจำนวนและหน้างาน — กดปุ่มเพื่อส่งชื่อและรหัสสินค้าให้ร้านทาง LINE"}
                </p>
              </div>
            )}
            {!p.isAccessory && ["underwater-light", "pool-light", "fountain-light", "garden-light", "uplight-led"].includes(p.category.slug) && (
              <p className="pdp-note">
                {p.includesPsu ? "ชุดพร้อมใช้ มีหม้อแปลงไฟในกล่องแล้ว · " : "ไฟแรงดันต่ำ ต้องต่อผ่านหม้อแปลง · "}
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

        {pairs.length > 0 && (
          <section className="pdp-related pdp-pair" aria-labelledby="pair-h">
            <div className="sec-head">
              <h2 className="sec-title" id="pair-h">
                ซื้อคู่กัน
              </h2>
              <p className="sec-sub">อุปกรณ์ที่ใช้กับรุ่นนี้ได้ เลือกใส่ตะกร้าพร้อมกันได้เลย</p>
            </div>
            <div className="prod-grid">
              {pairs.map((x) => (
                <ProductCard key={x.item.id} p={x.item} note={x.reason} />
              ))}
            </div>
          </section>
        )}

        {p.description && (
          <section className="prose-desc" aria-labelledby="desc-h">
            <h2 id="desc-h" className="sec-title" style={{ fontSize: 24 }}>
              รายละเอียดสินค้า
            </h2>
            {/* คำอธิบายผ่านการล้าง HTML แล้วตอนนำเข้า/บันทึก (src/lib/html.ts) — รูปในคำอธิบายโหลดแบบ lazy + async */}
            <div dangerouslySetInnerHTML={{ __html: descriptionHtml(p.description) }} />
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
        <RecentlyViewed currentId={p.slug} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(productLd(p)) }} />
    </main>
  );
}
