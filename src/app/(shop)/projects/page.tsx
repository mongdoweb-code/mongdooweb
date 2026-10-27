// ผลงานติดตั้ง (U12) — รูปงานจริงแยกตามประเภทงาน (?kind=) + ลิงก์ไปหน้ารายละเอียด (สินค้าที่ใช้ในงานนั้น)
import type { Metadata } from "next";
import { Suspense } from "react";
import { getProjects } from "@/lib/blog";
import { PageHead } from "../_components/PageHead";

const TITLE = "ผลงานติดตั้ง — มองดูเว็บ";
const DESCRIPTION = "ภาพงานติดตั้งจริงของลูกค้าร้านมองดูเว็บ: ไฟสระว่ายน้ำ ไฟน้ำพุ ไฟสวน และไฟส่องอาคาร พร้อมรายการสินค้าที่ใช้ในแต่ละงาน";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/projects" },
  openGraph: { type: "website", siteName: "มองดูเว็บ", locale: "th_TH", url: "/projects", title: TITLE, description: DESCRIPTION },
};

async function Grid({ searchParams }: { searchParams: PageProps<"/projects">["searchParams"] }) {
  const raw = (await searchParams).kind;
  const kind = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 60) ?? "";
  const all = await getProjects();
  const kinds = [...new Set(all.map((p) => p.kind).filter((k): k is string => !!k))];
  const list = kind ? all.filter((p) => p.kind === kind) : all;
  if (!all.length)
    return (
      <div className="pg-empty">
        <b>กำลังรวบรวมผลงาน</b>
        <p>ดูตัวอย่างงานจริงเพิ่มเติมหรือส่งรูปหน้างานมาปรึกษาได้ทาง LINE</p>
      </div>
    );
  return (
    <>
      {kinds.length > 1 && (
        <nav className="lst-chips l10-kinds" aria-label="ประเภทงาน">
          <a className={`chip${!kind ? " on" : ""}`} href="/projects" aria-current={!kind ? "page" : undefined}>
            ทั้งหมด <span>{all.length}</span>
          </a>
          {kinds.map((k) => (
            <a key={k} className={`chip${kind === k ? " on" : ""}`} href={`/projects?kind=${encodeURIComponent(k)}`} aria-current={kind === k ? "page" : undefined}>
              {k} <span>{all.filter((p) => p.kind === k).length}</span>
            </a>
          ))}
        </nav>
      )}
      <div className="l10-cards">
        {list.map((p, i) => (
          <article key={p.slug} className="l10-card">
            <a href={`/projects/${encodeURIComponent(p.slug)}`} className="l10-card-img" tabIndex={-1} aria-hidden="true">
              {p.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- รูปย่อ WebP จาก /media
                <img src={p.cover.sm} alt="" width={480} height={360} loading={i < 3 ? "eager" : "lazy"} decoding="async" />
              ) : (
                <span className="ph" />
              )}
            </a>
            <div className="l10-card-body">
              <div className="prod-cat">{[p.kind, p.location].filter(Boolean).join(" · ") || "งานติดตั้ง"}</div>
              <h2 className="l10-card-t">
                <a href={`/projects/${encodeURIComponent(p.slug)}`}>{p.title}</a>
              </h2>
              {p.summary && <p>{p.summary}</p>}
            </div>
          </article>
        ))}
      </div>
      {!list.length && <p className="pg-empty">ยังไม่มีผลงานประเภทนี้</p>}
    </>
  );
}

export default function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "ผลงานติดตั้ง" }]}
        selfHref="/projects"
        eyebrow="งานจริงจากลูกค้า"
        title="ผลงานติดตั้ง"
        sub="ตัวอย่างงานไฟสระว่ายน้ำ น้ำพุ สวน และอาคาร ที่ใช้สินค้าจากร้าน — กดดูรายละเอียดและสินค้าที่ใช้ในแต่ละงาน"
      />
      <div className="container pg-body">
        <Suspense fallback={<div className="pg-empty">กำลังโหลดผลงาน…</div>}>
          <Grid searchParams={searchParams} />
        </Suspense>
        <div className="l10-cta">
          <div>
            <b>อยากได้งานแบบนี้?</b>
            <p>ส่งรูปและขนาดพื้นที่มา ทีมงานช่วยเลือกรุ่นและจำนวนที่เหมาะให้ฟรี</p>
          </div>
          <a className="btn btn-primary" href="/quote">
            ขอใบเสนอราคา
          </a>
          <a className="btn btn-line" href="#" data-line target="_blank" rel="noopener">
            ปรึกษาทาง LINE
          </a>
        </div>
      </div>
    </main>
  );
}
