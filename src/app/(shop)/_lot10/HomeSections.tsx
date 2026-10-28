// ส่วนต่างๆ ของหน้าแรกตามลำดับที่ตั้งในหลังบ้าน (A30) + ส่วนใหม่: ความน่าเชื่อถือ (U30) ผลงานติดตั้ง บทความล่าสุด
// HTML ส่วนเดิมมาจากต้นแบบ (_markup/home.ts) — ตัดเป็นชิ้นตามหัวคอมเมนต์ของแต่ละ section
// ส่วนเดิมที่ถูกซ่อนยังอยู่ในหน้า (hidden) เพราะ public/js/home.js อ้างถึง element ในนั้นตอนเริ่มทำงาน
import { connection } from "next/server";
import { Suspense } from "react";
import { getProjects, getPublishedPosts, thaiDay, visibleNow } from "@/lib/blog";
import type { HomeSectionKey } from "@/lib/home";
import { getHomeConfig } from "@/lib/home-data";
import { getShopRating } from "@/lib/reviews";
import { getPublicShopInfo } from "@/lib/settings";
import { HOME_MAIN } from "../_markup/home";
import { Stars } from "../product/_reviews/ProductReviews";
import { withFeatureProject, withPayOptions } from "./home-chunks";

type Legacy = Exclude<HomeSectionKey, "trust" | "projects" | "posts">;
const MARKERS: [Legacy, string][] = [
  ["slides", "(2) HERO SLIDER"],
  ["highlights", "TRUST STRIP"],
  ["categories", "CATEGORIES"],
  ["finder", "FINDER"],
  ["bestsellers", "BEST SELLERS"],
  ["why", "WHY US"],
  ["how", "HOW TO ORDER"],
  ["cta", "CTA"],
];

/** ตัด HOME_MAIN เป็นชิ้นตามหัวคอมเมนต์ — หาไม่เจอสักอัน = ใช้ทั้งก้อนเป็น "slides" (หน้าแรกยังแสดงครบ) */
function splitHome(): Partial<Record<Legacy, string>> {
  const at = MARKERS.map(([k, m]) => [k, HOME_MAIN.indexOf(`<!-- ==================== ${m}`)] as const);
  if (at.some(([, i]) => i < 0)) return { slides: HOME_MAIN };
  const sorted = [...at].sort((a, b) => a[1] - b[1]);
  const out: Partial<Record<Legacy, string>> = {};
  sorted.forEach(([k, i], n) => (out[k] = HOME_MAIN.slice(i, n + 1 < sorted.length ? sorted[n + 1][1] : undefined)));
  return out;
}
const CHUNKS = splitHome();

function Head({ eyebrow, title, id, more }: { eyebrow: string; title: string; id: string; more?: { href: string; label: string } }) {
  return (
    <div className="sec-head reveal">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="sec-title" id={id}>
          {title}
        </h2>
      </div>
      {more && (
        <a href={more.href} className="link-more">
          {more.label}
        </a>
      )}
    </div>
  );
}

async function TrustSection() {
  const [{ trust }, rating] = await Promise.all([getHomeConfig(), getShopRating()]);
  const showRating = trust.showRating && rating.count > 0;
  if (!showRating && !trust.stats.length && !trust.logos.length) return null;
  return (
    <section className="l10-trust" aria-labelledby="l10-trust-h" data-home="trust">
      <div className="container">
        <Head eyebrow="ความน่าเชื่อถือ" title={trust.title} id="l10-trust-h" />
        {(showRating || trust.stats.length > 0) && (
          <div className="l10-trust-grid reveal">
            {showRating && (
              <div className="l10-trust-rating">
                <b>{rating.avg.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
                <Stars value={rating.avg} />
                <span>คะแนนเฉลี่ยจาก {rating.count.toLocaleString("th-TH")} รีวิวผู้ซื้อจริง</span>
              </div>
            )}
            {trust.stats.map((s, i) => (
              <div className="l10-stat" key={i}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
        {trust.logos.length > 0 && (
          <ul className="l10-logos reveal" aria-label="ลูกค้าองค์กรบางส่วน">
            {trust.logos.map((l, i) => (
              <li key={i}>
                {l.href ? (
                  <a href={l.href} target={/^https?:/i.test(l.href) ? "_blank" : undefined} rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ย่อ WebP จาก /media */}
                    <img src={l.url} alt={l.name || "โลโก้ลูกค้า"} loading="lazy" decoding="async" />
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- โลโก้ย่อ WebP จาก /media
                  <img src={l.url} alt={l.name || "โลโก้ลูกค้า"} loading="lazy" decoding="async" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

async function ProjectsSection() {
  const list = (await getProjects()).slice(0, 3);
  if (!list.length) return null;
  return (
    <section className="l10-home-sec" aria-labelledby="l10-proj-h" data-home="projects">
      <div className="container">
        <Head eyebrow="ผลงานติดตั้ง" title="งานจริงจากลูกค้าของเรา" id="l10-proj-h" more={{ href: "/projects", label: "ดูผลงานทั้งหมด" }} />
        <div className="l10-cards reveal">
          {list.map((p) => (
            <article key={p.slug} className="l10-card">
              <a href={`/projects/${encodeURIComponent(p.slug)}`} className="l10-card-img" tabIndex={-1} aria-hidden="true">
                {p.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- รูปย่อ WebP จาก /media
                  <img src={p.cover.sm} alt="" width={480} height={360} loading="lazy" decoding="async" />
                ) : (
                  <span className="ph" />
                )}
              </a>
              <div className="l10-card-body">
                <div className="prod-cat">{[p.kind, p.location].filter(Boolean).join(" · ") || "งานติดตั้ง"}</div>
                <h3 className="l10-card-t">
                  <a href={`/projects/${encodeURIComponent(p.slug)}`}>{p.title}</a>
                </h3>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

async function PostsSection() {
  await connection(); // บทความที่ตั้งเวลาไว้ขึ้นเองเมื่อถึงเวลา
  const list = visibleNow(await getPublishedPosts()).slice(0, 3);
  if (!list.length) return null;
  return (
    <section className="l10-home-sec" aria-labelledby="l10-posts-h" data-home="posts">
      <div className="container">
        <Head eyebrow="บทความ" title="ความรู้เรื่องไฟ LED" id="l10-posts-h" more={{ href: "/blog", label: "บทความทั้งหมด" }} />
        <div className="l10-cards">
          {list.map((p) => (
            <article key={p.slug} className="l10-card">
              <a href={`/blog/${encodeURIComponent(p.slug)}`} className="l10-card-img" tabIndex={-1} aria-hidden="true">
                {p.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- รูปย่อ WebP จาก /media
                  <img src={p.cover.sm} alt="" width={480} height={360} loading="lazy" decoding="async" />
                ) : (
                  <span className="ph" />
                )}
              </a>
              <div className="l10-card-body">
                <div className="prod-cat">
                  <time dateTime={p.date}>{thaiDay(p.date)}</time>
                </div>
                <h3 className="l10-card-t">
                  <a href={`/blog/${encodeURIComponent(p.slug)}`}>{p.title}</a>
                </h3>
                {p.excerpt && <p>{p.excerpt}</p>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** เนื้อหาหน้าแรกทั้งหมดตามลำดับที่ตั้งไว้ */
export async function HomeSections() {
  const [{ sections }, projects, info] = await Promise.all([getHomeConfig(), getProjects(), getPublicShopInfo()]);
  // ส่วนเดิมที่ปรับตามข้อมูลจริง: รูปผลงานติดตั้ง (ทำไมต้องมองดูเว็บ) · ชิปเก็บเงินปลายทาง/รับที่ร้าน (วิธีสั่งซื้อ)
  const live: Partial<Record<Legacy, string>> = {
    ...CHUNKS,
    ...(CHUNKS.why ? { why: withFeatureProject(CHUNKS.why, projects) } : {}),
    ...(CHUNKS.how ? { how: withPayOptions(CHUNKS.how, info) } : {}),
  };
  return (
    <>
      {sections.map(({ key, show }) => {
        if (key === "trust") return show ? <TrustSection key={key} /> : null;
        if (key === "projects") return show ? <ProjectsSection key={key} /> : null;
        if (key === "posts")
          return show ? (
            <Suspense key={key} fallback={null}>
              <PostsSection />
            </Suspense>
          ) : null;
        const html = live[key];
        if (!html) return null;
        return show ? (
          <div key={key} data-home={key} style={{ display: "contents" }} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div key={key} data-home={key} hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
        );
      })}
    </>
  );
}
