// /admin/videos/:id — แก้ไขคลิป (ชื่อ หัวข้อ แบบคลิป สินค้า รูปปก การแสดง แนะนำ · คลิปจากลิงก์เปลี่ยนลิงก์ได้)
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { docDateTime } from "@/lib/doc-calc";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { VIDEO_SOURCES } from "@/lib/video-links";
import { HistoryLink } from "../../../_components/HistoryLink";
import { VideoForm } from "../VideoForm";
import { bkkInput, videoFormLists } from "../form-data";
import "../videos.css";

export const instant = false;
const nowMs = () => Date.now();

export default async function VideoEditPage({ params }: PageProps<"/admin/videos/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const [v, lists, s] = await Promise.all([prisma.video.findUnique({ where: { id } }), videoFormLists(), getSettings()]);
  if (!v) notFound();
  const scheduled = v.isActive && v.publishAt && v.publishAt.getTime() > nowMs();
  return (
    <main className="main vd-page">
      <div className="page-head">
        <div>
          <p><Link className="link back-btn" href="/admin/videos">← วิดีโอทั้งหมด</Link></p>
          <h1>แก้ไขคลิป</h1>
          <p>{VIDEO_SOURCES[v.source].name} · เพิ่มเมื่อ {docDateTime(v.createdAt, s.dateEra)} · ดู {v.views.toLocaleString("th-TH")} ครั้ง</p>
        </div>
        <div className="head-actions">
          <HistoryLink entity={`Video:${v.id}`} />
          <a className="btn btn-outline" href={`/videos?v=${v.id}`} target="_blank" rel="noopener">ดูบนเว็บ ↗</a>
        </div>
      </div>
      <section className="panel vd-add">
        <VideoForm
          init={{
            id: v.id, source: v.source, url: v.url ?? "", fileUrl: v.fileKey ? mediaUrl(v.fileKey) : null, fileKey: v.fileKey, seconds: v.seconds, hevc: v.hevc,
            posterKey: v.posterKey, posterUrl: v.posterKey ? mediaUrl(v.posterKey, "sm") : null, title: v.title, topic: v.topic ?? "", vertical: v.vertical,
            productId: v.productId ?? "", publish: !v.isActive ? "hidden" : scheduled ? "schedule" : "now", publishAt: bkkInput(v.publishAt), featured: v.featured,
          }}
          products={lists.products}
          topics={lists.topics}
        />
      </section>
    </main>
  );
}
