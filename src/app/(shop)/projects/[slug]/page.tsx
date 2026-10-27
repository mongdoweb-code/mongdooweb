// รายละเอียดผลงานติดตั้ง (U12): รูปงานจริง + รายละเอียด + สินค้าที่ใช้ในงานนี้ (ใส่ตะกร้าได้)
// ผลงานที่ไม่มี/ซ่อนอยู่ → src/proxy.ts ตอบ 404 จริงก่อนถึงหน้านี้
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject, getProjects, thaiDay } from "@/lib/blog";
import { absUrl, getShopData, jsonForScript } from "@/lib/storefront";
import { PageHead } from "../../_components/PageHead";
import { ProductGrid } from "../../_components/ProductCard";

export const instant = false;

export async function generateStaticParams() {
  const list = await getProjects();
  // Cache Components ต้องมีอย่างน้อย 1 ค่า — ยังไม่มีผลงาน = ค่าแทน (หน้านั้นเป็น 404)
  return list.length ? list.slice(0, 30).map((p) => ({ slug: p.slug })) : [{ slug: "_" }];
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const p = await getProject(decode((await params).slug));
  if (!p) return {};
  const url = `/projects/${p.slug}`;
  const images = p.images.slice(0, 4).map((i) => ({ url: absUrl(i.full), alt: p.title }));
  return {
    title: `${p.title} — ผลงานติดตั้ง มองดูเว็บ`,
    description: p.description,
    alternates: { canonical: url },
    openGraph: { type: "article", siteName: "มองดูเว็บ", locale: "th_TH", url, title: p.title, description: p.description, images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title: p.title, description: p.description, images: images.map((i) => i.url) },
  };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  const p = await getProject(decode((await params).slug));
  if (!p) notFound();
  const { catalog } = await getShopData();
  const used = p.productSlugs.map((s) => catalog.find((c) => c.id === s)).filter((x): x is NonNullable<typeof x> => !!x);
  const selfHref = `/projects/${encodeURIComponent(p.slug)}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: p.title,
    url: absUrl(selfHref),
    description: p.description,
    dateCreated: p.date.slice(0, 10),
    ...(p.images.length ? { image: p.images.map((i) => absUrl(i.full)) } : {}),
    ...(p.location ? { locationCreated: { "@type": "Place", name: p.location } } : {}),
    creator: { "@type": "Organization", name: "มองดูเว็บ", url: absUrl("/") },
  };
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "ผลงานติดตั้ง", href: "/projects" }, { label: p.title }]}
        selfHref={selfHref}
        eyebrow={[p.kind, p.location].filter(Boolean).join(" · ") || "ผลงานติดตั้ง"}
        title={p.title}
        sub={p.summary ?? undefined}
      />
      <div className="container pg-body">
        {p.images.length > 0 && (
          <div className={`l10-gallery n${Math.min(p.images.length, 5)}`}>
            {p.images.map((im, i) => (
              <a key={i} href={im.full} target="_blank" rel="noopener" className={i === 0 ? "lead" : ""}>
                {/* eslint-disable-next-line @next/next/no-img-element -- รูป WebP จาก /media */}
                <img src={i === 0 ? im.full : im.sm} alt={`${p.title} รูปที่ ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
              </a>
            ))}
          </div>
        )}
        <div className="l10-article-wrap">
          <article className="prose l10-prose" dangerouslySetInnerHTML={{ __html: p.html }} />
          <aside className="l2-aside">
            <h2>ข้อมูลงาน</h2>
            <ul>
              {p.kind && (
                <li>
                  <span>ประเภทงาน</span>
                  {p.kind}
                </li>
              )}
              {p.location && (
                <li>
                  <span>สถานที่</span>
                  {p.location}
                </li>
              )}
              <li>
                <span>วันที่</span>
                {thaiDay(p.date)}
              </li>
            </ul>
            <a className="btn btn-primary" href="/quote">
              ขอใบเสนอราคางานแบบนี้
            </a>
          </aside>
        </div>
        {used.length > 0 && (
          <section className="pdp-related" aria-labelledby="used-h">
            <div className="sec-head">
              <h2 className="sec-title" id="used-h">
                สินค้าที่ใช้ในงานนี้
              </h2>
            </div>
            <ProductGrid items={used} />
          </section>
        )}
        <p style={{ marginTop: 32 }}>
          <a className="link-more" href="/projects">
            ดูผลงานอื่น
          </a>
        </p>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
    </main>
  );
}
