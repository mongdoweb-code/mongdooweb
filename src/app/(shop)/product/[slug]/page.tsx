// หน้ารายละเอียดสินค้า — แกลเลอรี, ราคา/สต็อก, เลือกจำนวน, ซื้อคู่กัน, สเปก, คำอธิบาย, สินค้าในหมวด, ดูล่าสุด
// ล็อต 9: ปุ่มเลือกตัวเลือก (U1), ราคาลดตามเวลา + นับถอยหลัง (U3), รายการโปรด/เปรียบเทียบ (U5/U7),
// ตารางสเปกแบบมีโครงสร้าง (U6), ลิงก์คำนวณหม้อแปลง (U8), ราคาขายส่ง (U10), ไฟล์ดาวน์โหลด (U11)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { htmlToText } from "@/lib/html";
import { fileSize } from "@/lib/product-downloads";
import { getPublicShopInfo } from "@/lib/settings";
import {
  LIGHT_CATS,
  absUrl,
  getProductDetail,
  getShopData,
  jsonForScript,
  lineMessageUrl,
  pairedProducts,
  powerLabel,
  powerOf,
} from "@/lib/storefront";
import { optionLabel, selectorRows } from "@/lib/variants";
import { PageHead } from "../../_components/PageHead";
import { PriceBadge } from "../../_components/PriceBits";
import { ProductCard, ProductGrid, formatBaht } from "../../_components/ProductCard";
import { RecentlyViewed } from "../../_components/RecentlyViewed";
import { PdpPrice } from "./PdpPrice";
import { BuyBox, Gallery } from "./ProductBuy";
import { ProductReviews } from "../_reviews/ProductReviews";
import { StockAlertForm } from "../_reviews/StockAlertForm";

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
  // สินค้าหลายตัวเลือก: canonical ของทุกตัวเลือก = หน้าหลักของกลุ่ม
  const url = `/product/${p.canonicalSlug}`;
  const images = p.images.slice(0, 4).map((i) => ({ url: absUrl(i.full), alt: p.name }));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "มองดูเว็บ", locale: "th_TH", url, title: p.name, description, images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title: p.name, description, images: images.map((i) => i.url) },
  };
}

const offer = (url: string, price: number, inStock: boolean, validUntil?: number | null) =>
  price > 0
    ? {
        offers: {
          "@type": "Offer",
          url,
          price: price.toFixed(2),
          priceCurrency: "THB",
          ...(validUntil ? { priceValidUntil: new Date(validUntil).toISOString().slice(0, 10) } : {}),
          availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@type": "Organization", name: "มองดูเว็บ", url: absUrl("/") },
        },
      }
    : {};

/** ชื่อตัวเลือก → property ของ schema.org (ที่เหลือใส่เป็น additionalProperty) */
const VARIES: Record<string, string> = { สี: "color", สีแสง: "color", ขนาด: "size", ความยาว: "size", วัตต์: "", วัสดุ: "material" };

function productLd(p: Detail) {
  const url = absUrl(`/product/${encodeURIComponent(p.slug)}`);
  const text = htmlToText(p.description || p.shortDescription || "");
  const saleEnd = p.sale && p.price === p.sale.p ? p.sale.t : null;
  const product = {
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
    ...(p.attrs.length ? { additionalProperty: p.attrs.map((a) => ({ "@type": "PropertyValue", name: a.label, value: a.value })) } : {}),
    // ราคา 0 = "สอบถามราคา" → ไม่ใส่ offers (ห้ามมีราคาว่าง/0 ใน schema)
    ...offer(url, p.price, p.inStock, saleEnd),
  };
  const g = p.variants;
  if (!g) return { "@context": "https://schema.org", ...product };
  // สินค้าหลายตัวเลือก: ProductGroup + hasVariant (ตัวเลือกทุกตัวเป็น Product ที่มี URL/ราคาของตัวเอง)
  const groupUrl = absUrl(`/product/${encodeURIComponent(g.primarySlug)}`);
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${groupUrl}#group`,
    name: g.name,
    url: groupUrl,
    productGroupID: g.id,
    brand: { "@type": "Brand", name: "มองดูเว็บ" },
    variesBy: g.optionNames.map((n) => (VARIES[n] ? `https://schema.org/${VARIES[n]}` : n)),
    hasVariant: g.members.map((m) => {
      if (m.slug === p.slug) return product;
      const mUrl = absUrl(`/product/${encodeURIComponent(m.slug)}`);
      return {
        "@type": "Product",
        "@id": `${mUrl}#product`,
        name: m.name,
        sku: m.sku,
        url: mUrl,
        ...(m.img ? { image: absUrl(m.img) } : {}),
        ...Object.fromEntries(g.optionNames.filter((n) => VARIES[n]).map((n) => [VARIES[n], m.options[n]])),
        ...offer(mUrl, m.price, m.inStock),
      };
    }),
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
  const pv = { price: p.price, compareAt: p.compareAt, sale: p.sale };
  // ไฟแรงดันต่ำ 12/24V ที่ต้องใช้หม้อแปลง → ลิงก์เครื่องคำนวณหม้อแปลง (U8)
  const power = powerOf(p.name) ?? powerOf(htmlToText(`${p.shortDescription ?? ""} ${p.description ?? ""}`));
  const psuCalc = !p.isAccessory && !p.includesPsu && LIGHT_CATS.has(p.category.slug) && power;
  const rows = p.variants ? selectorRows(p.variants, p.slug) : [];
  // ตารางสเปก: สเปกแบบมีโครงสร้างก่อน แล้วสเปกอิสระที่หัวข้อไม่ซ้ำ
  const structured = new Set(p.attrs.map((a) => a.label));
  const freeSpecs = p.specs.filter((s) => !structured.has(s.label));
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
          <Gallery images={p.images} alt={p.name} badge={<PriceBadge p={{ ...pv, badge: p.badge }} />} />
          <div>
            <a className="eyebrow" href={catHref}>
              {p.category.th}
            </a>
            <h1>{p.name}</h1>
            <PdpPrice {...pv} tiers={p.tiers} unit={p.unit} />
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
            {p.variants && rows.length > 0 && (
              <div className="pdp-variants" data-variants>
                {rows.map((r) => (
                  <fieldset key={r.name} className="var-row">
                    <legend>
                      {r.name}: <b>{r.values.find((v) => v.current)?.value ?? ""}</b>
                    </legend>
                    <div className="var-opts">
                      {r.values.map((v) =>
                        v.current ? (
                          <span key={v.value} className="var-opt on" aria-current="true">
                            {v.value}
                          </span>
                        ) : v.slug ? (
                          <a
                            key={v.value}
                            className={`var-opt${v.out ? " out" : ""}`}
                            href={`/product/${encodeURIComponent(v.slug)}`}
                            aria-label={`${r.name} ${v.value}${v.out ? " (สินค้าหมด)" : ""}`}
                          >
                            {v.value}
                          </a>
                        ) : (
                          <span key={v.value} className="var-opt off" aria-disabled="true" title={`ไม่มี${r.name}นี้ในตัวเลือกที่เลือกไว้`}>
                            {v.value}
                          </span>
                        ),
                      )}
                    </div>
                  </fieldset>
                ))}
                <p className="var-note">
                  {p.variants.members.length} ตัวเลือก · ตัวที่เลือก: {optionLabel(p.variants.optionNames, p.variants.members.find((m) => m.slug === p.slug)!.options)}
                </p>
              </div>
            )}
            {p.shortDescription && <div className="pdp-short" dangerouslySetInnerHTML={{ __html: descriptionHtml(p.shortDescription) }} />}
            {canBuy ? (
              <>
                <BuyBox
                  slug={p.slug}
                  max={max}
                  stockLeft={p.stockLeft}
                  unit={p.unit}
                  name={p.name}
                  price={pv}
                  tiers={p.tiers}
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
                {p.price > 0 && <StockAlertForm slug={p.slug} />}
                <p className="pdp-qty-note">
                  {p.price > 0
                    ? "สินค้าหมดชั่วคราว — ทักร้านเพื่อจองหรือสอบถามรุ่นใกล้เคียง"
                    : "ราคาขึ้นกับจำนวนและหน้างาน — กดปุ่มเพื่อส่งชื่อและรหัสสินค้าให้ร้านทาง LINE"}
                </p>
              </div>
            )}
            <div className="pdp-tools">
              <button type="button" className="pdp-tool" data-wish={p.slug} aria-pressed="false">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
                </svg>
                รายการโปรด
              </button>
              <button type="button" className="pdp-tool" data-compare={p.slug} aria-pressed="false">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 4v16M17 4v16M3 8h8M13 16h8" />
                </svg>
                เปรียบเทียบ
              </button>
            </div>
            {!p.isAccessory && ["underwater-light", "pool-light", "fountain-light", "garden-light", "uplight-led"].includes(p.category.slug) && (
              <p className="pdp-note">
                {p.includesPsu ? "ชุดพร้อมใช้ มีหม้อแปลงไฟในกล่องแล้ว · " : "ไฟแรงดันต่ำ ต้องต่อผ่านหม้อแปลง · "}
                <b>ห้ามต่อไฟบ้าน 220V โดยตรง</b>
              </p>
            )}
            {psuCalc && (
              <p className="pdp-psu">
                ใช้หลายดวง? <a className="link-more" href={`/tools/psu-calculator?light=${encodeURIComponent(p.slug)}`} data-psu-link>
                  คำนวณหม้อแปลง {powerLabel(psuCalc)} ที่ต้องใช้
                </a>
              </p>
            )}
            {(p.attrs.length > 0 || freeSpecs.length > 0) && (
              <table className="spec-table" data-spec-table>
                <caption className="sr-only">สเปกสินค้า</caption>
                <tbody>
                  {p.attrs.map((a) => (
                    <tr key={a.code} data-attr={a.code}>
                      <th scope="row">{a.label}</th>
                      <td>{a.value}</td>
                    </tr>
                  ))}
                  {freeSpecs.map((s, i) => (
                    <tr key={i}>
                      <th scope="row">{s.label || "คุณสมบัติ"}</th>
                      <td>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {p.downloads.length > 0 && (
              <section className="pdp-dl" aria-labelledby="dl-h">
                <h2 id="dl-h">เอกสารดาวน์โหลด</h2>
                <ul>
                  {p.downloads.map((d) => (
                    <li key={d.href}>
                      <a href={d.href} download>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 3h9l4 4v14H6zM14 3v5h5M12 11v6M9 14l3 3 3-3" />
                        </svg>
                        <span>
                          {d.name}
                          <small>PDF · {fileSize(d.sizeBytes)}</small>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
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
        <ProductReviews slug={p.slug} name={p.name} />
        <RecentlyViewed currentId={p.slug} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(productLd(p)) }} />
    </main>
  );
}
