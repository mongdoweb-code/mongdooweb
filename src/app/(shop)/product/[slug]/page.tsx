// หน้ารายละเอียดสินค้า — ปุ่ม "ใส่ตะกร้า" ใช้ตะกร้ากลางใน shell.js (data-add)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductDetail, getShopData, jsonForScript } from "@/lib/storefront";
import { PageHead } from "../../_components/PageHead";
import { ProductGrid, formatBaht, phClass } from "../../_components/ProductCard";

export async function generateStaticParams() {
  const { catalog } = await getShopData();
  return catalog.map((p) => ({ slug: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const p = await getProductDetail(decodeURIComponent((await params).slug));
  if (!p) return {};
  return {
    title: `${p.name} — มองดูเว็บ`,
    description: `${p.name} ราคา ${formatBaht(p.price)} ${p.specs.map((s) => s.value).join(" ")}`,
    alternates: { canonical: `/product/${p.slug}` },
  };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const p = await getProductDetail(decodeURIComponent((await params).slug));
  if (!p) notFound();
  const { catalog } = await getShopData();
  // สินค้าในหมวดเดียวกัน + อุปกรณ์เสริม (ไม่รวมตัวเอง) สูงสุด 4 ชิ้น
  const related = catalog
    .filter((x) => x.id !== p.slug && (x.catId === p.category.slug || x.acc))
    .slice(0, 4);
  const catHref = `/category/${encodeURIComponent(p.category.slug)}`;

  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    category: p.category.th,
    brand: { "@type": "Brand", name: "มองดูเว็บ" },
    offers: {
      "@type": "Offer",
      price: p.price,
      priceCurrency: "THB",
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      url: `/product/${p.slug}`,
    },
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
          {/* TODO: รูปสินค้าจริง (Product.images) ต่อกับ storage driver ในขั้นที่ 4 */}
          <div className="pdp-media">
            {p.badge && <span className="prod-badge">{p.badge}</span>}
            <div className={phClass({ acc: p.isAccessory, color: p.lightColor as "white" | "rgb" | "any" })} />
          </div>
          <div>
            <a className="eyebrow" href={catHref}>
              {p.category.th}
            </a>
            <h1>{p.name}</h1>
            <div className="pdp-price">{formatBaht(p.price)}</div>
            <div className="pdp-meta">
              รหัสสินค้า {p.sku} · ราคาต่อ{p.unit} · ยังไม่รวมค่าจัดส่ง
            </div>
            <div className="pdp-actions">
              <button className="btn btn-primary" type="button" data-add={p.slug}>
                ใส่ตะกร้า <span className="arr">→</span>
              </button>
              <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">
                สอบถามทาง LINE
              </a>
            </div>
            {!p.isAccessory && (
              <p className="pdp-note">
                {p.includesPsu
                  ? "ชุดพร้อมใช้ มีหม้อแปลงไฟในกล่องแล้ว · "
                  : "ใช้ไฟ DC12V ต้องต่อผ่านหม้อแปลง · "}
                <b>ห้ามต่อไฟบ้าน 220V โดยตรง</b>
              </p>
            )}
            {/* สเปกที่ยังไม่มีหัวข้อ (ข้อมูลตัวอย่าง) แสดงเป็นป้าย, ที่มีหัวข้อแสดงเป็นตาราง */}
            {p.specs.some((s) => !s.label) && (
              <div className="prod-specs" style={{ marginTop: 20 }}>
                {p.specs.filter((s) => !s.label).map((s, i) => (
                  <span key={i}>{s.value}</span>
                ))}
              </div>
            )}
            {p.specs.some((s) => s.label) && (
              <table className="spec-table">
                <caption className="sr-only">สเปกสินค้า</caption>
                <tbody>
                  {p.specs.filter((s) => s.label).map((s, i) => (
                    <tr key={i}>
                      <th scope="row">{s.label}</th>
                      <td>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {p.description && <div className="pdp-desc">{p.description}</div>}
          </div>
        </div>

        {related.length > 0 && (
          <section className="pdp-related" aria-labelledby="related-h">
            <div className="sec-head">
              <h2 className="sec-title" id="related-h">
                สินค้าที่เกี่ยวข้อง
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
