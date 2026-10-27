// /admin/posts — บทความ (A10): ร่าง / เผยแพร่ / ตั้งเวลา
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import "../_lot10/lot10.css";

export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** เวลาปัจจุบัน (หน้าหลังบ้าน render ทุกครั้งที่เปิด) */
const nowMs = () => Date.now();
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function PostsPage({ searchParams }: PageProps<"/admin/posts">) {
  await requireAdmin();
  const sp = await searchParams;
  const rows = await prisma.post.findMany({
    orderBy: [{ publishAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    select: { id: true, title: true, slug: true, status: true, publishAt: true, updatedAt: true, tags: true, coverKey: true },
    take: 500,
  });
  const now = nowMs();
  const state = (p: (typeof rows)[number]) =>
    p.status === "DRAFT" ? { t: "ร่าง", c: "gray" } : p.publishAt && p.publishAt.getTime() > now ? { t: `ตั้งเวลา ${fmt(p.publishAt)}`, c: "warn" } : { t: "เผยแพร่แล้ว", c: "ok" };
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
        <table className="tbl">
          <thead>
            <tr>
              <th>หัวข้อ</th>
              <th>สถานะ</th>
              <th>แท็ก</th>
              <th>แก้ไขล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
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
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <b>ยังไม่มีบทความ</b>บทความช่วยให้ลูกค้าเจอร้านจาก Google มากขึ้น เช่น “วิธีเลือกไฟสระว่ายน้ำ” “ไฟใต้น้ำต้องใช้หม้อแปลงอะไร”
          </div>
        )}
      </section>
    </main>
  );
}
