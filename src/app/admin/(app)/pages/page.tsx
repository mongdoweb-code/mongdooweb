// /admin/pages — หน้าเนื้อหา (นโยบายความเป็นส่วนตัว, การรับประกัน, เกี่ยวกับเรา, วิธีสั่งซื้อ) + คำถามที่พบบ่อย
// ?p=<slug>|faq · แสดงเนื้อหาที่เผยแพร่อยู่ (getPage — ตัวเดียวกับหน้าร้าน) + ประวัติเวอร์ชันพร้อมย้อนกลับ
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_FAQ, PAGE_SLUGS, PAGE_TITLES, getPage, isPageSlug, renderBody, type PageSlug } from "@/lib/content";
import { asPagesSnapshot, listVersions, parseFaq } from "@/lib/content-version";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { resetPage, rollbackPages } from "./actions";
import { FaqEditor, PageEditor } from "./PageEditors";
import { PAGE_VARS, pageVars } from "./vars";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const PUBLIC_PATH: Record<PageSlug, string> = { privacy: "/privacy", warranty: "/warranty", about: "/about", "how-to-order": "/how-to-order" };

export default async function PagesAdmin({ searchParams }: PageProps<"/admin/pages">) {
  await requireAdmin();
  const sp = await searchParams;
  const p = one(sp.p);
  const tab: PageSlug | "faq" = p === "faq" ? "faq" : isPageSlug(p) ? p : "privacy";
  const [s, rows, versions] = await Promise.all([getSettings(), prisma.page.findMany({ select: { slug: true, updatedAt: true, updatedBy: true } }), listVersions("PAGES", 12)]);
  const edited = (slug: string) => rows.find((r) => r.slug === slug);
  const page = tab === "faq" ? null : await getPage(tab);
  const faq = parseFaq(s.faq);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>หน้าเนื้อหา / FAQ</h1>
          <p>แก้ข้อความหน้าข้อมูลร้านและคำถามที่พบบ่อยได้เอง — ไม่มีเนื้อหา = ใช้ข้อความเริ่มต้นของระบบ</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href={tab === "faq" ? "/faq" : PUBLIC_PATH[tab]} target="_blank" rel="noopener">ดูหน้าจริง ↗</a>
        </div>
      </div>
      <div className="notice-stack">
        {one(sp.rolled) === "1" && <div className="ok-box" role="status">ย้อนเวอร์ชันแล้ว — หน้าร้านใช้เนื้อหาเวอร์ชันที่เลือก</div>}
        {/^\d+$/.test(one(sp.saved)) && (
          <div className="ok-box" role="status">
            {tab === "faq" ? `บันทึกคำถามที่พบบ่อย ${one(sp.saved)} ข้อแล้ว — แสดงที่หน้า /faq` : "เผยแพร่แล้ว — หน้าร้านแสดงเนื้อหาใหม่ทันที"}
          </div>
        )}
        {one(sp.reset) === "1" && <div className="ok-box" role="status">กลับไปใช้เนื้อหาเริ่มต้นแล้ว</div>}
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {PAGE_SLUGS.map((slug) => (
              <Link key={slug} className={`tab ${tab === slug ? "on" : ""}`} role="tab" aria-selected={tab === slug} href={`/admin/pages?p=${slug}`}>
                {PAGE_TITLES[slug]}{edited(slug) ? null : <em>ค่าเริ่มต้น</em>}
              </Link>
            ))}
            <Link className={`tab ${tab === "faq" ? "on" : ""}`} role="tab" aria-selected={tab === "faq"} href="/admin/pages?p=faq">
              คำถามที่พบบ่อย <em>{faq.length}</em>
            </Link>
          </div>
        </div>
        <div className="pg-wrap">
          {page ? (
            <PageEditor key={`${page.slug}-${versions[0]?.id ?? "v0"}`} slug={page.slug} title={page.title} body={page.body} isDefault={page.isDefault} vars={PAGE_VARS} />
          ) : (
            <FaqEditor key={`${versions[0]?.id ?? "v0"}-${faq.length}`} items={faq} samples={DEFAULT_FAQ} />
          )}
        </div>
      </section>

      <div className="cm-wrap pg-meta">
        {page ? (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>เนื้อหาที่เผยแพร่อยู่</h2>
                <p>{page.isDefault ? "ข้อความเริ่มต้นของระบบ" : `แก้ล่าสุด ${page.updatedAt ? fmt(new Date(page.updatedAt)) : "—"}${edited(page.slug)?.updatedBy ? ` โดย ${edited(page.slug)!.updatedBy}` : ""}`}</p>
              </div>
              {!page.isDefault && (
                <form action={resetPage}>
                  <input type="hidden" name="slug" value={page.slug} />
                  <ConfirmSubmit className="btn btn-outline btn-sm" title="กลับไปใช้เนื้อหาเริ่มต้น?" body="ข้อความที่ร้านแก้ไว้จะถูกแทนด้วยข้อความเริ่มต้นของระบบ (ย้อนกลับได้จากประวัติเวอร์ชัน)" confirmLabel="ใช้ค่าเริ่มต้น">
                    กลับไปใช้ค่าเริ่มต้น
                  </ConfirmSubmit>
                </form>
              )}
            </div>
            <article className="pg-doc pg-live" id="pgLive">
              <h1>{page.title}</h1>
              {page.body.trim() ? <div dangerouslySetInnerHTML={{ __html: renderBody(page.body, pageVars(s)) }} /> : <p className="sub">ยังไม่มีเนื้อหาเริ่มต้นสำหรับหน้านี้</p>}
            </article>
          </section>
        ) : (
          <section className="panel">
            <div className="panel-head"><h2>คำถามที่แสดงอยู่</h2></div>
            <dl className="pg-doc faq-live" id="faqLive">
              {faq.map((x, i) => (
                <div key={i}><dt>{x.q}</dt><dd>{x.a}</dd></div>
              ))}
              {!faq.length && <p className="sub">ยังไม่มีคำถาม</p>}
            </dl>
          </section>
        )}
        <aside className="cm-side">
          <section className="box">
            <h3>ประวัติเวอร์ชัน</h3>
            {versions.length ? (
              <ul className="ver-list" id="pgVersions">
                {versions.map((v, i) => {
                  const snap = asPagesSnapshot(v.snapshot);
                  return (
                    <li key={v.id}>
                      <span>
                        {fmt(v.publishedAt)}
                        <span className="sub">{v.publishedBy ?? "—"} · {snap ? `${snap.pages.length} หน้า · FAQ ${snap.faq.length} ข้อ` : "—"}</span>
                      </span>
                      {i === 0 ? (
                        <span className="chip gray">ปัจจุบัน</span>
                      ) : (
                        <form action={rollbackPages}>
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="back" value={tab} />
                          <ConfirmSubmit className="btn btn-outline btn-sm" title="ย้อนเป็นเวอร์ชันนี้?" body="ทุกหน้าเนื้อหาและคำถามที่พบบ่อยจะกลับเป็นตามเวอร์ชันที่เลือก" confirmLabel="ย้อนเวอร์ชัน">
                            ย้อนเป็นเวอร์ชันนี้
                          </ConfirmSubmit>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="sub">ยังไม่มีการแก้ไข</p>
            )}
            <small className="sub">ทุกครั้งที่เผยแพร่ ระบบเก็บสำเนาทุกหน้า + FAQ ไว้ 30 เวอร์ชันล่าสุด</small>
          </section>
        </aside>
      </div>
    </main>
  );
}
