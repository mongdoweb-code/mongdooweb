// หน้าวิดีโอ (/videos) + วิดีโอในหน้าสินค้า + ส่วน "วิดีโอแนะนำ" หน้าแรก — ข้อมูลแคชไว้ (tag storefront)
// "ถึงเวลาเผยแพร่หรือยัง" ตัดสินตอนเปิดหน้า (visibleVideos) เหมือนบทความ — คลิปที่ตั้งเวลาไว้ขึ้นเองตรงเวลา
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { mediaUrl } from "@/lib/media";
import { unitPriceSatang } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";
import { VIDEO_SOURCES, embedUrl, type VideoSourceKey } from "@/lib/video-links";

export type VideoCard = {
  id: string;
  source: VideoSourceKey;
  sourceName: string;
  title: string;
  topic: string | null;
  vertical: boolean;
  /** รูปปก (อัปโหลด/สร้างจากคลิป หรือของ YouTube) · null = พื้นสีของแพลตฟอร์ม */
  poster: string | null;
  /** ตัวเล่นของแพลตฟอร์ม (โหลดเมื่อกดเล่นเท่านั้น) */
  embed: string | null;
  /** ไฟล์ที่อัปโหลด (/media/videos/…mp4) */
  file: string | null;
  hevc: boolean;
  seconds: number | null;
  /** ลิงก์เปิดในแอป (แพลตฟอร์มภายนอก) */
  url: string | null;
  views: number;
  featured: boolean;
  publishAt: string | null;
  createdAt: string;
  product: { slug: string; name: string; price: number; img: string | null } | null;
};

export async function getVideos(): Promise<VideoCard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const rows = await prisma.video.findMany({
    where: { isActive: true },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      product: {
        select: { slug: true, name: true, isActive: true, images: true, priceSatang: true, salePriceSatang: true, saleStartsAt: true, saleEndsAt: true, tierPrices: true, category: { select: { isActive: true } } },
      },
    },
  });
  return rows
    .filter((v) => v.source !== "UPLOAD" || v.fileKey)
    .map((v) => {
      const pr = v.product && v.product.isActive && v.product.category.isActive ? v.product : null;
      return {
        id: v.id,
        source: v.source,
        sourceName: VIDEO_SOURCES[v.source].name,
        title: v.title,
        topic: v.topic,
        vertical: v.vertical,
        poster: (v.posterKey && mediaUrl(v.posterKey, "sm")) || v.thumbUrl || null,
        embed: embedUrl(v),
        file: v.source === "UPLOAD" && v.fileKey ? mediaUrl(v.fileKey) : null,
        hevc: v.hevc,
        seconds: v.seconds,
        url: v.source === "UPLOAD" ? null : v.url,
        views: v.views,
        featured: v.featured,
        publishAt: v.publishAt?.toISOString() ?? null,
        createdAt: v.createdAt.toISOString(),
        product: pr ? { slug: pr.slug, name: pr.name, price: unitPriceSatang(pr), img: pr.images[0] ? mediaUrl(pr.images[0], "sm") : null } : null,
      };
    });
}

/** เฉพาะคลิปที่ถึงเวลาเผยแพร่แล้ว (เรียกหลัง connection() — ใช้เวลาปัจจุบัน) */
export const visibleVideos = (list: VideoCard[], now = Date.now()) => list.filter((v) => !v.publishAt || Date.parse(v.publishAt) <= now);
