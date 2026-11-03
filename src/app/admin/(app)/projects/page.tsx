// /admin/projects — ผลงานติดตั้ง (A9)
import Link from "next/link";
import { Pagination, paginate } from "../../_components/Pagination";
import { requireAdmin } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { RowActions } from "../../_components/RowActions";
import { deleteProject } from "./actions";
import "../_lot10/lot10.css";

export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProjectsAdminPage({ searchParams }: PageProps<"/admin/projects">) {
  const owner = (await requireAdmin()).role === "OWNER";
  const sp = await searchParams;
  const rows = await prisma.project.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  const pq = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase().slice(0, 60);
  const pg = paginate(pq ? rows.filter((r) => `${r.title} ${r.slug} ${r.kind ?? ""} ${r.location ?? ""}`.toLowerCase().includes(pq)) : rows, sp, "/admin/projects", ["q"]);
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>ผลงานติดตั้ง</h1>
          <p>รูปงานจริงที่หน้า /projects แยกตามประเภทงาน พร้อมสินค้าที่ใช้ — ช่วยให้ลูกค้าเห็นภาพและมั่นใจก่อนซื้อ</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/projects" target="_blank" rel="noopener">ดูหน้าผลงาน</a>
          <Link className="btn btn-primary" href="/admin/projects/new" id="newProject">+ เพิ่มผลงาน</Link>
        </div>
      </div>
      {one(sp.deleted) === "1" && <div className="ok-box l10-ok" role="status">ลบผลงานแล้ว</div>}
      <section className="panel">
        <form className="toolbar2" action="/admin/projects" role="search">
          <label className="search" style={{ flex: 1, minWidth: 220 }}>
            <span className="sr-only">ค้นหาชื่อผลงาน ประเภท หรือสถานที่</span>
            <input name="q" type="search" defaultValue={typeof sp.q === "string" ? sp.q : ""} placeholder="ค้นหาชื่อผลงาน ประเภท หรือสถานที่" />
          </label>
          <button className="btn btn-outline btn-sm" type="submit">ค้นหา</button>
        </form>
        <table className="tbl">
          <thead>
            <tr>
              <th><span className="sr-only">รูป</span></th>
              <th>ผลงาน</th>
              <th>ประเภท / สถานที่</th>
              <th>สถานะ</th>
              <th className="r">รูป</th>
              <th className="r col-acts">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {pg.rows.map((p) => (
              <tr key={p.id}>
                <td style={{ width: 72 }}>
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- รูปจาก /media
                    <img src={mediaUrl(p.images[0], "sm")!} alt="" width={56} height={42} style={{ objectFit: "cover" }} />
                  ) : null}
                </td>
                <td>
                  <Link className="link" href={`/admin/projects/${p.id}`}>{p.title}</Link>
                  <span className="sub l10-path">/projects/{p.slug}</span>
                </td>
                <td>{[p.kind, p.location].filter(Boolean).join(" · ") || "—"}</td>
                <td>{p.isPublished ? <span className="chip ok">เผยแพร่</span> : <span className="chip gray">ซ่อน</span>}</td>
                <td className="r num">{p.images.length}</td>
                <td className="r">
                  <RowActions
                    name={p.title}
                    viewHref={`/projects/${p.slug}`}
                    viewTip="ดูบนเว็บ"
                    viewDisabled={p.isPublished ? undefined : "ซ่อนอยู่ — ดูไม่ได้"}
                    editHref={`/admin/projects/${p.id}`}
                    del={{ action: deleteProject, id: p.id, title: "ลบผลงานนี้?", body: `${p.title} — ลบรูปทั้งหมดด้วย กู้คืนไม่ได้`, label: "ลบผลงาน", disabled: owner ? undefined : "ลบได้เฉพาะเจ้าของร้าน" }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={pg.page} pages={pg.pages} total={pg.total} shown={pg.rows.length} per={pg.per} href={pg.href} unit="ผลงาน" />
        {!rows.length && (
          <div className="empty">
            <b>ยังไม่มีผลงาน</b>เพิ่มรูปงานติดตั้งจริงของลูกค้า (ขออนุญาตลูกค้าก่อนเผยแพร่รูป)
          </div>
        )}
      </section>
    </main>
  );
}
