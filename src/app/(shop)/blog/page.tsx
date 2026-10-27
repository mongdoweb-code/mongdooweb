// บทความ (U13): หน้ารวม แบ่งหน้า (?page=) กรองตามแท็ก (?tag=) — บทความที่ตั้งเวลาไว้ขึ้นเองเมื่อถึงเวลา
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { POSTS_PER_PAGE, getPublishedPosts, thaiDay, visibleNow } from "@/lib/blog";
import { PageHead } from "../_components/PageHead";

const TITLE = "บทความ ความรู้เรื่องไฟ LED — มองดูเว็บ";
const DESCRIPTION = "บทความและคู่มือเลือกไฟ LED ใต้น้ำ ไฟสระว่ายน้ำ ไฟน้ำพุ ไฟสวน วิธีติดตั้ง การเลือกหม้อแปลง และการดูแลรักษา จากร้านมองดูเว็บ";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
  openGraph: { type: "website", siteName: "มองดูเว็บ", locale: "th_TH", url: "/blog", title: TITLE, description: DESCRIPTION },
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function List({ searchParams }: { searchParams: PageProps<"/blog">["searchParams"] }) {
  const sp = await searchParams;
  await connection(); // "ถึงเวลาเผยแพร่หรือยัง" ตัดสินตอนเปิดหน้า
  const tag = one(sp.tag).slice(0, 40);
  const all = visibleNow(await getPublishedPosts());
  const tags = [...new Set(all.flatMap((p) => p.tags))].slice(0, 20);
  const list = tag ? all.filter((p) => p.tags.includes(tag)) : all;
  const pages = Math.max(1, Math.ceil(list.length / POSTS_PER_PAGE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(one(sp.page))) || 1));
  const shown = list.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);
  const href = (n: number, t = tag) => {
    const q = new URLSearchParams(Object.entries({ tag: t, page: n > 1 ? String(n) : "" }).filter(([, v]) => v)).toString();
    return `/blog${q ? `?${q}` : ""}`;
  };
  if (!all.length)
    return (
      <div className="pg-empty">
        <b>เร็วๆ นี้</b>
        <p>บทความแนะนำการเลือกและติดตั้งไฟ LED กำลังจะมา — ระหว่างนี้สอบถามทีมงานทาง LINE ได้เลย</p>
      </div>
    );
  return (
    <>
      {tags.length > 0 && (
        <nav className="lst-chips l10-kinds" aria-label="หัวข้อบทความ">
          <a className={`chip${!tag ? " on" : ""}`} href="/blog" aria-current={!tag ? "page" : undefined}>
            ทั้งหมด
          </a>
          {tags.map((t) => (
            <a key={t} className={`chip${tag === t ? " on" : ""}`} href={href(1, t)} aria-current={tag === t ? "page" : undefined}>
              {t}
            </a>
          ))}
        </nav>
      )}
      <div className="l10-cards">
        {shown.map((p, i) => (
          <article key={p.slug} className="l10-card">
            <a href={`/blog/${encodeURIComponent(p.slug)}`} className="l10-card-img" tabIndex={-1} aria-hidden="true">
              {p.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- รูปย่อ WebP จาก /media
                <img src={p.cover.sm} alt="" width={480} height={360} loading={i < 3 ? "eager" : "lazy"} decoding="async" />
              ) : (
                <span className="ph" />
              )}
            </a>
            <div className="l10-card-body">
              <div className="prod-cat">
                <time dateTime={p.date}>{thaiDay(p.date)}</time>
                {p.tags[0] ? ` · ${p.tags[0]}` : ""}
              </div>
              <h2 className="l10-card-t">
                <a href={`/blog/${encodeURIComponent(p.slug)}`}>{p.title}</a>
              </h2>
              {p.excerpt && <p>{p.excerpt}</p>}
            </div>
          </article>
        ))}
      </div>
      {!shown.length && <p className="pg-empty">ไม่พบบทความ</p>}
      {pages > 1 && (
        <nav className="l10-pager" aria-label="หน้าบทความ">
          {page > 1 ? (
            <a className="btn btn-outline btn-sm" href={href(page - 1)} rel="prev">
              ← ใหม่กว่า
            </a>
          ) : (
            <span />
          )}
          <span>
            หน้า {page} / {pages}
          </span>
          {page < pages ? (
            <a className="btn btn-outline btn-sm" href={href(page + 1)} rel="next">
              เก่ากว่า →
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

export default function BlogPage({ searchParams }: PageProps<"/blog">) {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "บทความ" }]} selfHref="/blog" eyebrow="ความรู้เรื่องไฟ" title="บทความ" sub="คู่มือเลือกไฟ วิธีติดตั้ง และเคล็ดลับดูแลไฟ LED สำหรับงานน้ำและภายนอกอาคาร" />
      <div className="container pg-body">
        <Suspense fallback={<div className="pg-empty">กำลังโหลดบทความ…</div>}>
          <List searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
