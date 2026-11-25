// /admin/notices/:id — แก้ไขข้อความแจ้งเตือน (ข้อความ สี ไอคอน การใช้กับสินค้า)
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HistoryLink } from "../../../_components/HistoryLink";
import { noticeFormLists } from "../form-data";
import { NoticeForm } from "../NoticeForm";
import "../notices.css";

export const instant = false;

export default async function NoticeEditPage({ params }: PageProps<"/admin/notices/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const [n, lists] = await Promise.all([prisma.productNotice.findUnique({ where: { id } }), noticeFormLists()]);
  if (!n) notFound();
  return (
    <main className="main ntc-page">
      <div className="page-head">
        <div>
          <p><Link className="link back-btn" href="/admin/notices">← ข้อความแจ้งเตือนทั้งหมด</Link></p>
          <h1>แก้ไขข้อความแจ้งเตือน</h1>
          <p>{n.name}</p>
        </div>
        <div className="head-actions"><HistoryLink entity={`ProductNotice:${n.id}`} /></div>
      </div>
      <section className="panel">
        <NoticeForm
          key={n.updatedAt.toISOString()}
          init={{
            id: n.id, name: n.name, text: n.text, tone: n.tone, icon: n.icon, scope: n.scope, categoryIds: n.categoryIds,
            skipAccessory: n.skipAccessory, isActive: n.isActive, productIds: lists.raw.filter((p) => p.noticeIds.includes(n.id)).map((p) => p.id),
          }}
          categories={lists.categories}
          products={lists.products}
        />
      </section>
    </main>
  );
}
