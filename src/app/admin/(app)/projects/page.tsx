// /admin/projects — ผลงานติดตั้ง (A9)
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import "../_lot10/lot10.css";

export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProjectsAdminPage({ searchParams }: PageProps<"/admin/projects">) {
  await requireAdmin();
  const sp = await searchParams;
  const rows = await prisma.project.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
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
        <table className="tbl">
          <thead>
            <tr>
              <th><span className="sr-only">รูป</span></th>
              <th>ผลงาน</th>
              <th>ประเภท / สถานที่</th>
              <th>สถานะ</th>
              <th className="r">รูป</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
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
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <b>ยังไม่มีผลงาน</b>เพิ่มรูปงานติดตั้งจริงของลูกค้า (ขออนุญาตลูกค้าก่อนเผยแพร่รูป)
          </div>
        )}
      </section>
    </main>
  );
}
