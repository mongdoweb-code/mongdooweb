// ค่าหน้าแรก (ลำดับส่วน + ส่วนความน่าเชื่อถือ) จาก ShopSetting — แคช ล้างด้วย tag storefront เมื่อบันทึกใน /admin/home
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { parseHomeSections, parseTrust } from "@/lib/home";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";

export async function getHomeConfig() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { homeSections: true, trust: true } });
  const trust = parseTrust(s?.trust);
  return {
    sections: parseHomeSections(s?.homeSections),
    trust: { ...trust, logos: trust.logos.map((l) => ({ ...l, url: mediaUrl(l.key, "sm")! })) },
  };
}
