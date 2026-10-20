// หน้าเนื้อหาที่แก้ได้จากหลังบ้าน (นโยบาย/รับประกัน/เกี่ยวกับเรา/วิธีสั่งซื้อ) — เนื้อหาผ่าน renderBody() ที่ escape ทุกอย่างแล้ว
import { getPage, pageVars, plainText, renderBody, type PageSlug } from "@/lib/content";
import { getPublicShopInfo } from "@/lib/settings";
import { PageHead } from "../_components/PageHead";

/** วันที่ปรับปรุงของเนื้อหาเริ่มต้น (ก่อนร้านแก้เองในหลังบ้าน) */
const DEFAULT_UPDATED = "2026-10-20";

export const thaiDate = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Bangkok" });

export async function pageDescription(slug: PageSlug, max = 155) {
  const [page, info] = await Promise.all([getPage(slug), getPublicShopInfo()]);
  const t = plainText(page.body, pageVars(info));
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

export async function ContentPage({
  slug,
  eyebrow,
  showUpdated,
  children,
}: {
  slug: PageSlug;
  eyebrow?: string;
  showUpdated?: boolean;
  children?: React.ReactNode;
}) {
  const [page, info] = await Promise.all([getPage(slug), getPublicShopInfo()]);
  const html = renderBody(page.body, pageVars(info));
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: page.title }]}
        eyebrow={eyebrow}
        title={page.title}
        sub={showUpdated ? `ปรับปรุงล่าสุด ${thaiDate(page.updatedAt ?? DEFAULT_UPDATED)}` : undefined}
      />
      <div className="container pg-body">
        <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
        {children}
      </div>
    </main>
  );
}
