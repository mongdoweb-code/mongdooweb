// /videos — รวมคลิปวิดีโอของร้าน: YouTube / Shorts / Facebook / TikTok / Instagram / คลิปที่ร้านถ่ายเอง (จัดการที่ /admin/videos)
// แท็บแนวนอน/แนวตั้ง + หัวข้อ + แหล่ง · ?v=<id> เปิดคลิปนั้นทันที (ลิงก์แชร์) · JSON-LD VideoObject ให้ Google แสดงคลิปในผลค้นหา
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { absUrl } from "@/lib/storefront";
import { isoDuration } from "@/lib/video-links";
import { getVideos, visibleVideos } from "@/lib/videos";
import { PageHead } from "../_components/PageHead";
import { VideoGallery } from "../_components/VideoGallery";

const TITLE = "วิดีโอสินค้าและงานติดตั้ง — มองดูเว็บ";
const DESCRIPTION = "ดูไฟ LED ใต้น้ำ ไฟสระว่ายน้ำ น้ำพุ และไฟสวน ทำงานจริง — รีวิวสินค้า วิธีติดตั้ง และผลงานจากลูกค้า ทั้งคลิปยาวและคลิปสั้น";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/videos" },
  openGraph: { type: "website", siteName: "มองดูเว็บ", locale: "th_TH", url: "/videos", title: TITLE, description: DESCRIPTION },
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 80) ?? "";

async function Gallery({ searchParams }: { searchParams: PageProps<"/videos">["searchParams"] }) {
  await connection(); // คลิปที่ตั้งเวลาเผยแพร่ขึ้นเองตรงเวลา
  const [sp, all] = await Promise.all([searchParams, getVideos()]);
  const list = visibleVideos(all);
  if (!list.length)
    return (
      <div className="pg-empty">
        <b>กำลังรวบรวมคลิปวิดีโอ</b>
        <p>ติดตามคลิปใหม่ได้ทาง LINE หรือดูผลงานติดตั้งของเราไปก่อน</p>
        <a className="btn btn-outline" href="/projects">ดูผลงานติดตั้ง</a>
      </div>
    );
  // ข้อมูลโครงสร้างสำหรับ Google (เฉพาะคลิปที่มีรูปปก — Google ต้องมี thumbnailUrl)
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: list
      .filter((v) => v.poster)
      .slice(0, 50)
      .map((v, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "VideoObject",
          name: v.title,
          description: [v.topic, v.product?.name].filter(Boolean).join(" · ") || v.title,
          thumbnailUrl: absUrl(v.poster!),
          uploadDate: v.publishAt ?? v.createdAt,
          ...(v.seconds ? { duration: isoDuration(v.seconds) } : {}),
          ...(v.file ? { contentUrl: absUrl(v.file) } : v.embed ? { embedUrl: v.embed } : {}),
          url: absUrl(`/videos?v=${encodeURIComponent(v.id)}`),
        },
      })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <VideoGallery videos={list} initial={{ tab: one(sp.tab), topic: one(sp.topic), src: one(sp.src), v: one(sp.v), page: one(sp.page) }} />
    </>
  );
}

export default function VideosPage({ searchParams }: PageProps<"/videos">) {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "วิดีโอ" }]}
        selfHref="/videos"
        eyebrow="ดูของจริงก่อนตัดสินใจ"
        title="วิดีโอสินค้าและงานติดตั้ง"
        sub="รีวิวสินค้า วิธีติดตั้ง และผลงานจากลูกค้า — กดคลิปเพื่อเล่น แล้วกด “ดูสินค้า” เพื่อสั่งซื้อรุ่นในคลิปได้ทันที"
      />
      <div className="container pg-body">
        <Suspense fallback={<div className="pg-empty">กำลังโหลดวิดีโอ…</div>}>
          <Gallery searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
