// /admin/redirects — redirect 301 (A13/A14) + หน้า 404 ที่ถูกเรียกบ่อย (สร้าง redirect ได้ในคลิกเดียว)
// เปลี่ยน slug สินค้า/หมวด/บทความ/ผลงาน → ระบบสร้าง redirect ให้อัตโนมัติ (ที่มา "เปลี่ยนลิงก์")
import { Pagination, readPer } from "../../_components/Pagination";
import type { Prisma, RedirectSource } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { clearNotFound, deleteRedirect, dismissNotFound, saveRedirectAction } from "./actions";
import "../_lot10/lot10.css";

export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const SOURCE: Record<RedirectSource, string> = { MANUAL: "ตั้งเอง", SLUG: "เปลี่ยนลิงก์", NOT_FOUND: "จากหน้า 404" };

/** เดาปลายทางของหน้า 404: สินค้า/หมวด/บทความ slug เดียวกัน → ไม่เจอ = ค้นหาด้วยคำในลิงก์ */
async function suggest(paths: string[]) {
  const segs = paths.map((p) => p.split("/").filter(Boolean).pop() ?? "");
  const [products, cats, posts] = await Promise.all([
    prisma.product.findMany({ where: { slug: { in: segs }, isActive: true }, select: { slug: true } }),
    prisma.category.findMany({ where: { slug: { in: segs }, isActive: true }, select: { slug: true } }),
    prisma.post.findMany({ where: { slug: { in: segs }, status: "PUBLISHED" }, select: { slug: true } }),
  ]);
  return paths.map((_, i) => {
    const s = segs[i];
    if (products.some((p) => p.slug === s)) return `/product/${s}`;
    if (cats.some((c) => c.slug === s)) return `/category/${s}`;
    if (posts.some((p) => p.slug === s)) return `/blog/${s}`;
    const words = s.replace(/\.\w+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 60);
    return words ? `/search?q=${encodeURIComponent(words)}` : "/products";
  });
}

export default async function RedirectsPage({ searchParams }: PageProps<"/admin/redirects">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const PER = readPer(sp.per, 50);
  const q = one(sp.q).trim().slice(0, 100);
  const where: Prisma.RedirectWhereInput = q ? { OR: [{ fromPath: { contains: q, mode: "insensitive" } }, { toPath: { contains: q, mode: "insensitive" } }] } : {};
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [rows, total, nf, nfTotal] = await Promise.all([
    prisma.redirect.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * PER, take: PER }),
    prisma.redirect.count({ where }),
    prisma.notFoundLog.findMany({ orderBy: [{ hits: "desc" }, { lastAt: "desc" }], take: 50 }),
    prisma.notFoundLog.count(),
  ]);
  const guesses = await suggest(nf.map((n) => n.path));
  const self = `/admin/redirects${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  const done = one(sp.done);
  const msg = one(sp.msg);
  const DONE: Record<string, string> = {
    saved: `บันทึก redirect แล้ว: ${msg}`,
    deleted: "ลบ redirect แล้ว",
    dismissed: "ซ่อนหน้า 404 นี้แล้ว",
    cleared: "ล้างบันทึกหน้า 404 แล้ว",
  };
  const pages = Math.max(1, Math.ceil(total / PER));

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Redirect และหน้า 404</h1>
          <p>ส่งต่อลิงก์เดิม (301) ไปหน้าใหม่ เพื่อไม่ให้ลูกค้าและ Google เจอหน้า “ไม่พบหน้า” — ปลายทางเป็นลิงก์ในเว็บ (/...) หรือ https://</p>
        </div>
      </div>
      {done === "err" ? (
        <div className="l10-err" role="alert">{msg || "บันทึกไม่สำเร็จ"}</div>
      ) : (
        DONE[done] && <div className="ok-box l10-ok" role="status">{DONE[done]}</div>
      )}

      <section className="panel" aria-labelledby="nf-h" style={{ marginBottom: 16 }}>
        <div className="panel-head" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 id="nf-h" style={{ fontSize: 16 }}>หน้า 404 ที่ถูกเรียกบ่อย ({nfTotal})</h2>
          {admin.role === "OWNER" && nfTotal > 0 && (
            <form action={clearNotFound}>
              <input type="hidden" name="back" value={self} />
              <ConfirmSubmit title="ล้างบันทึก 404" body="ลบรายการหน้า 404 ทั้งหมด (เริ่มนับใหม่)" confirmLabel="ล้าง" className="btn btn-ghost btn-sm">
                ล้างทั้งหมด
              </ConfirmSubmit>
            </form>
          )}
        </div>
        <table className="l10-mini" id="nfTable">
          <thead>
            <tr>
              <th>ลิงก์ที่ไม่พบ</th>
              <th>ครั้ง</th>
              <th>ล่าสุด / มาจาก</th>
              <th>ส่งต่อไปที่</th>
            </tr>
          </thead>
          <tbody>
            {nf.map((n, i) => (
              <tr key={n.path} data-path={n.path}>
                <td className="l10-path">{n.path}</td>
                <td className="num">{n.hits}</td>
                <td>
                  {fmt(n.lastAt)}
                  {n.referer && <span className="sub l10-path">{n.referer}</span>}
                </td>
                <td>
                  <div className="l10-inline">
                    <form action={saveRedirectAction} className="l10-inline">
                      <input type="hidden" name="from" value={n.path} />
                      <input type="hidden" name="source" value="NOT_FOUND" />
                      <input type="hidden" name="back" value={self} />
                      <label className="sr-only" htmlFor={`nf-to-${i}`}>ปลายทางของ {n.path}</label>
                      <input id={`nf-to-${i}`} name="to" className="sel" defaultValue={guesses[i]} maxLength={500} required style={{ width: 200 }} />
                      <button className="btn btn-dark btn-sm" type="submit">สร้าง redirect</button>
                    </form>
                    <form action={dismissNotFound}>
                      <input type="hidden" name="path" value={n.path} />
                      <input type="hidden" name="back" value={self} />
                      <button className="btn btn-ghost btn-sm" type="submit" aria-label={`ซ่อน ${n.path}`}>ซ่อน</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!nf.length && <div className="empty"><b>ยังไม่มีหน้า 404</b>เมื่อมีคนเปิดลิงก์ที่ไม่มีอยู่ในเว็บ ระบบจะบันทึกไว้ที่นี่</div>}
      </section>

      <section className="panel" aria-labelledby="rd-h">
        <div className="panel-head" style={{ padding: "14px 16px" }}>
          <h2 id="rd-h" style={{ fontSize: 16 }}>Redirect ทั้งหมด ({total})</h2>
        </div>
        <form action={saveRedirectAction} className="l10-inline" style={{ padding: "0 16px 14px" }} id="newRedirect">
          <input type="hidden" name="back" value={self} />
          <div className="field">
            <label htmlFor="rd-from">จากลิงก์เดิม</label>
            <input id="rd-from" name="from" placeholder="/old-page" maxLength={500} required />
          </div>
          <div className="field">
            <label htmlFor="rd-to">ไปที่</label>
            <input id="rd-to" name="to" placeholder="/category/pool-light หรือ https://…" maxLength={500} required />
          </div>
          <button className="btn btn-primary btn-sm" type="submit">เพิ่ม redirect</button>
        </form>
        <form className="toolbar2" action="/admin/redirects" role="search">
          <label className="sr-only" htmlFor="rq">ค้นหา redirect</label>
          <input id="rq" className="sel inq-q" name="q" type="search" defaultValue={q} placeholder="ค้นหาลิงก์" />
          <button className="btn btn-dark btn-sm" type="submit">ค้นหา</button>
        </form>
        <ul className="l10-list" id="redirectList">
          {rows.map((r) => (
            <li key={r.id} className="l10-row" data-from={r.fromPath}>
              <form action={saveRedirectAction} className="l10-inline">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value={self} />
                <div className="field">
                  <label htmlFor={`f-${r.id}`}>จาก <span className="chip gray">{SOURCE[r.source]}</span></label>
                  <input id={`f-${r.id}`} name="from" defaultValue={r.fromPath} maxLength={500} />
                </div>
                <div className="field">
                  <label htmlFor={`t-${r.id}`}>ไปที่</label>
                  <input id={`t-${r.id}`} name="to" defaultValue={r.toPath} maxLength={500} />
                </div>
                <button className="btn btn-outline btn-sm" type="submit">บันทึก</button>
              </form>
              <div className="l10-row-acts">
                <span className="sub">ใช้ {r.hits.toLocaleString("th-TH")} ครั้ง{r.lastHitAt ? ` · ล่าสุด ${fmt(r.lastHitAt)}` : ""}</span>
                <form action={deleteRedirect}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="back" value={self} />
                  <ConfirmSubmit title="ลบ redirect" body={`ลบ ${r.fromPath} → ${r.toPath}? ลิงก์เดิมจะกลายเป็นหน้า 404`} confirmLabel="ลบ" className="btn btn-ghost btn-sm">
                    ลบ
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
        </ul>
        {!rows.length && <div className="empty"><b>{q ? "ไม่พบ redirect ตามที่ค้นหา" : "ยังไม่มี redirect"}</b>เปลี่ยน slug สินค้า/หมวด/บทความ แล้วระบบสร้างให้อัตโนมัติ</div>}
        <Pagination page={page} pages={pages} total={total} shown={rows.length} per={PER} unit="รายการ" href={(n, pp) => `/admin/redirects?${new URLSearchParams({ ...(q ? { q } : {}), ...(n > 1 ? { page: String(n) } : {}), ...(pp !== 50 ? { per: String(pp) } : {}) })}`} />
      </section>
    </main>
  );
}
