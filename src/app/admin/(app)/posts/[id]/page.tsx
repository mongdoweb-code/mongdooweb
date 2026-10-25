// /admin/posts/:id — เขียน/แก้บทความ ("new" = บทความใหม่)
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { skusOf, toBkkInput } from "../../_lot10/content-shared";
import { PostEditor, type PostValues } from "../PostEditor";
import { deletePost } from "../actions";
import "../../_lot10/lot10.css";

export const instant = false;

export default async function PostEditPage({ params, searchParams }: PageProps<"/admin/posts/[id]">) {
  const admin = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = id === "new" ? null : await prisma.post.findUnique({ where: { id: id.slice(0, 40) } });
  if (id !== "new" && !p) notFound();
  const v: PostValues = {
    id: p?.id ?? "",
    title: p?.title ?? "",
    slug: p?.slug ?? "",
    excerpt: p?.excerpt ?? "",
    body: p?.body ?? "",
    cover: p?.coverKey ? mediaUrl(p.coverKey, "sm") : null,
    seoTitle: p?.seoTitle ?? "",
    seoDescription: p?.seoDescription ?? "",
    status: p?.status ?? "DRAFT",
    publishAt: toBkkInput(p?.publishAt ?? null),
    tags: p?.tags.join(", ") ?? "",
    products: await skusOf(p?.productIds ?? []),
    wpId: p?.wpId ? String(p.wpId) : "",
    legacyPath: p?.legacyPath ?? "",
    authorName: p?.authorName ?? "",
  };
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/posts">← บทความทั้งหมด</Link></p>
          <h1>{p ? "แก้ไขบทความ" : "เขียนบทความใหม่"}</h1>
        </div>
        {p && admin.role === "OWNER" && (
          <form action={deletePost} className="head-actions">
            <input type="hidden" name="id" value={p.id} />
            <ConfirmSubmit title="ลบบทความ" body={`ลบ "${p.title}" ถาวร? ถ้าแค่ไม่อยากแสดง ให้เปลี่ยนเป็น "ร่าง" แทน`} confirmLabel="ลบบทความ" className="btn btn-ghost">
              ลบบทความ
            </ConfirmSubmit>
          </form>
        )}
      </div>
      <PostEditor v={v} saved={(Array.isArray(sp.saved) ? sp.saved[0] : sp.saved) === "1"} />
    </main>
  );
}
