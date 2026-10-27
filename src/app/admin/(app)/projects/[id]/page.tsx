// /admin/projects/:id — เพิ่ม/แก้ผลงานติดตั้ง ("new" = ผลงานใหม่)
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { skusOf } from "../../_lot10/content-shared";
import { ProjectEditor, type ProjectValues } from "../ProjectEditor";
import { deleteProject } from "../actions";
import "../../_lot10/lot10.css";

export const instant = false;

export default async function ProjectEditPage({ params, searchParams }: PageProps<"/admin/projects/[id]">) {
  const admin = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = id === "new" ? null : await prisma.project.findUnique({ where: { id: id.slice(0, 40) } });
  if (id !== "new" && !p) notFound();
  const kinds = (await prisma.project.findMany({ where: { kind: { not: null } }, select: { kind: true }, distinct: ["kind"] })).map((k) => k.kind!);
  const v: ProjectValues = {
    id: p?.id ?? "",
    title: p?.title ?? "",
    slug: p?.slug ?? "",
    kind: p?.kind ?? "",
    location: p?.location ?? "",
    summary: p?.summary ?? "",
    body: p?.body ?? "",
    images: (p?.images ?? []).map((k) => ({ key: k, url: mediaUrl(k, "sm")! })),
    products: await skusOf(p?.productIds ?? []),
    isPublished: p?.isPublished ?? true,
    sortOrder: p?.sortOrder ?? 0,
  };
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/projects">← ผลงานทั้งหมด</Link></p>
          <h1>{p ? "แก้ไขผลงาน" : "เพิ่มผลงานติดตั้ง"}</h1>
        </div>
        {p && admin.role === "OWNER" && (
          <form action={deleteProject} className="head-actions">
            <input type="hidden" name="id" value={p.id} />
            <ConfirmSubmit title="ลบผลงาน" body={`ลบ "${p.title}" และรูปทั้งหมดถาวร? ถ้าแค่ไม่อยากแสดง ให้ปิด "เผยแพร่" แทน`} confirmLabel="ลบผลงาน" className="btn btn-ghost">
              ลบผลงาน
            </ConfirmSubmit>
          </form>
        )}
      </div>
      <ProjectEditor v={v} kinds={kinds} saved={(Array.isArray(sp.saved) ? sp.saved[0] : sp.saved) === "1"} />
    </main>
  );
}
