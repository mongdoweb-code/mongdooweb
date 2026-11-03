// /admin/posts — บทความ (A10): ร่าง / เผยแพร่ / ตั้งเวลา
import Link from "next/link";
import { Pagination, paginate } from "../../_components/Pagination";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RowActions } from "../../_components/RowActions";
import { deletePost } from "./actions";
import "../_lot10/lot10.css";

export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** เวลาปัจจุบัน (หน้าหลังบ้าน render ทุกครั้งที่เปิด) */
const nowMs = () => Date.now();
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function PostsPage({ searchParams }: PageProps<"/admin/posts">) {
  const owner = (await requireAdmin()).role === "OWNER";
  const sp = await searchParams;
  const rows = await prisma.post.findMany({
    orderBy: [{ publishAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    select: { id: true, title: true, slug: true, status: true, publishAt: true, updatedAt: true, tags: true, coverKey: true },
    take: 500,
  });
  const now = nowMs();
  const state = (p: (typeof rows)[number]) =>
    p.status === "DRAFT" ? { t: "ร่าง", c: "gray" } : p.publishAt && p.publishAt.getTime() > now ? { t: `ตั้งเวลา ${fmt(p.publishAt)}`, c: "warn" } : { t: "เผยแพร่แล้ว", c: "ok" };
  const pq = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase().slice(0, 60);
  const pg = paginate(pq ? rows.filter((r) => `${r.title} ${r.slug} ${r.tags.join(" ")}`.toLowerCase().includes(pq)) : rows, sp, "/admin/posts", ["q"]);
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>บทความ</h1>
          <p>บทความความรู้ที่หน้า /blog — ร่างไว้ก่อน เผยแพร่ทันที หรือตั้งเวลาให้ขึ้นเอง · มีรูปปก SEO แท็ก และสินค้าที่เกี่ยวข้อง</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/blog" target="_blank" rel="noopener">ดูหน้าบทความ</a>
          <Link className="btn btn-primary" href="/admin/posts/new" id="newPost">+ เขียนบทความ</Link>
        </div>
      </div>
      {one(sp.deleted) === "1" && <div className="ok-box l10-ok" role="status">ลบบทความแล้ว</div>}
      <section className="panel">
        <form className="toolbar2" action="/admin/posts" role="search">
          <label className="search" style={{ flex: 1, minWidth: 220 }}>
            <span className="sr-only">ค้นหาหัวข้อ ลิงก์ หรือแท็ก</span>
            <input name="q" type="search" defaultValue={typeof sp.q === "string" ? sp.q : ""} placeholder="ค้นหาหัวข้อ ลิงก์ หรือแท็ก" />
          </label>
          <button className="btn btn-outline btn-sm" type="submit">ค้นหา</button>
        </form>
        <table className="tbl">
          <thead>
            <tr>
              <th>หัวข้อ</th>
              <th>สถานะ</th>
              <th>แท็ก</th>
              <th>แก้ไขล่าสุด</th>
              <th className="r col-acts">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {pg.rows.map((p) => {
              const s = state(p);
              return (
                <tr key={p.id}>
                  <td>
                    <Link className="link" href={`/admin/posts/${p.id}`}>{p.title}</Link>
                    <span className="sub l10-path">/blog/{p.slug}</span>
                  </td>
                  <td><span className={`chip ${s.c}`}>{s.t}</span></td>
                  <td>{p.tags.join(", ") || "—"}</td>
                  <td>{fmt(p.updatedAt)}</td>
                  <td className="r">
                    <RowActions
                      name={p.title}
                      viewHref={`/blog/${p.slug}`}
                      viewTip="ดูบนเว็บ"
                      viewDisabled={s.c === "ok" ? undefined : "ยังไม่เผยแพร่ — ดูไม่ได้"}
                      editHref={`/admin/posts/${p.id}`}
                      del={{ action: deletePost, id: p.id, title: "ลบบทความนี้?", body: `${p.title} — ลบถาวร ลิงก์เดิมจะขึ้นหน้าไม่พบ`, label: "ลบบทความ", disabled: owner ? undefined : "ลบได้เฉพาะเจ้าของร้าน" }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={pg.page} pages={pg.pages} total={pg.total} shown={pg.rows.length} per={pg.per} href={pg.href} unit="บทความ" />
        {!rows.length && (
          <div className="empty">
            <b>ยังไม่มีบทความ</b>บทความช่วยให้ลูกค้าเจอร้านจาก Google มากขึ้น เช่น “วิธีเลือกไฟสระว่ายน้ำ” “ไฟใต้น้ำต้องใช้หม้อแปลงอะไร”
          </div>
        )}
      </section>
    </main>
  );
}
