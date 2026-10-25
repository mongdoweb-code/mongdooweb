// หน้าบทความ (U13): รูปปก หัวข้อ วันที่ เนื้อหา แท็ก สินค้าที่เกี่ยวข้อง + Article JSON-LD + SEO (title/description/OG)
// บทความร่าง/ตั้งเวลาไว้/ไม่มี → src/proxy.ts ตอบ 404 จริงก่อนถึงหน้านี้ (ตรวจเวลา ณ ตอนเปิดหน้า)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost, getPublishedPosts, thaiDay } from "@/lib/blog";
import { getPublicShopInfo } from "@/lib/settings";
import { absUrl, getShopData, jsonForScript, lineMessageUrl } from "@/lib/storefront";
import { PageHead } from "../../_components/PageHead";
import { ProductGrid } from "../../_components/ProductCard";

export const instant = false;

export async function generateStaticParams() {
  const list = await getPublishedPosts();
  // Cache Components ต้องมีอย่างน้อย 1 ค่า — ยังไม่มีบทความ = ค่าแทน (หน้านั้นเป็น 404)
  return list.length ? list.slice(0, 30).map((p) => ({ slug: p.slug })) : [{ slug: "_" }];
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const p = await getPost(decode((await params).slug));
  if (!p) return {};
  const url = `/blog/${p.slug}`;
  const title = p.seoTitle || p.title;
  const images = p.cover ? [{ url: absUrl(p.cover.full), alt: p.title }] : undefined;
  return {
    title: `${title} — มองดูเว็บ`,
    description: p.seoDescription,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "มองดูเว็บ",
      locale: "th_TH",
      url,
      title,
      description: p.seoDescription,
      images,
      publishedTime: p.date,
      modifiedTime: p.updatedAt,
      tags: p.tags,
    },
    twitter: { card: images ? "summary_large_image" : "summary", title, description: p.seoDescription, images: images?.map((i) => i.url) },
  };
}

export default async function PostPage({ params }: PageProps<"/blog/[slug]">) {
  const p = await getPost(decode((await params).slug));
  if (!p) notFound();
  const [{ catalog }, info] = await Promise.all([getShopData(), getPublicShopInfo()]);
  const related = p.productSlugs.map((s) => catalog.find((c) => c.id === s)).filter((x): x is NonNullable<typeof x> => !!x);
  const selfHref = `/blog/${encodeURIComponent(p.slug)}`;
  const url = absUrl(selfHref);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: p.title.slice(0, 110),
    description: p.seoDescription,
    mainEntityOfPage: url,
    url,
    inLanguage: "th-TH",
    datePublished: p.date,
    dateModified: p.updatedAt,
    ...(p.cover ? { image: [absUrl(p.cover.full)] } : {}),
    ...(p.tags.length ? { keywords: p.tags.join(", ") } : {}),
    author: p.authorName ? { "@type": "Person", name: p.authorName } : { "@type": "Organization", name: info.name, url: absUrl("/") },
    publisher: { "@type": "Organization", name: info.name, url: absUrl("/"), logo: { "@type": "ImageObject", url: absUrl("/img/doc-logo.png") } },
  };
  const ask = lineMessageUrl(info.lineId, `สวัสดีครับ/ค่ะ อ่านบทความ "${p.title}" แล้วอยากสอบถามเพิ่มเติม\n${url}`, info.lineUrl);
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "บทความ", href: "/blog" }, { label: p.title }]} selfHref={selfHref} title="" />
      <div className="container pg-body">
        <article className="l10-post">
          <header>
            <h1 className="sec-title">{p.title}</h1>
            <p className="l10-post-meta">
              <time dateTime={p.date}>{thaiDay(p.date)}</time>
              {p.authorName ? ` · โดย ${p.authorName}` : ""}
            </p>
          </header>
          {p.cover && (
            // eslint-disable-next-line @next/next/no-img-element -- รูป WebP จาก /media
            <img className="l10-post-cover" src={p.cover.full} alt={p.title} decoding="async" fetchPriority="high" />
          )}
          <div className="prose l10-prose" dangerouslySetInnerHTML={{ __html: p.html }} />
          {p.tags.length > 0 && (
            <p className="lst-chips l10-tags" aria-label="แท็ก">
              {p.tags.map((t) => (
                <a key={t} className="chip" href={`/blog?tag=${encodeURIComponent(t)}`}>
                  #{t}
                </a>
              ))}
            </p>
          )}
          <div className="l10-cta">
            <div>
              <b>มีคำถามเกี่ยวกับบทความนี้?</b>
              <p>ทักทีมงานทาง LINE เราช่วยเลือกรุ่นที่เหมาะกับงานของคุณ</p>
            </div>
            <a className="btn btn-line" href={ask} target="_blank" rel="noopener">
              ถามทาง LINE
            </a>
          </div>
        </article>
        {related.length > 0 && (
          <section className="pdp-related" aria-labelledby="rel-h">
            <div className="sec-head">
              <h2 className="sec-title" id="rel-h">
                สินค้าที่เกี่ยวข้อง
              </h2>
            </div>
            <ProductGrid items={related} />
          </section>
        )}
        <p style={{ marginTop: 32 }}>
          <a className="link-more" href="/blog">
            บทความทั้งหมด
          </a>
        </p>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
    </main>
  );
}
