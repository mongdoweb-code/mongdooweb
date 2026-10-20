// URL หมวดของเว็บเดิม (/product-category/...) → redirect 301 ไปหน้าหมวดใหม่ (ไม่เสียอันดับ Google)
// เทียบจากส่วนท้ายของ path กับ Category.legacySlug
import { prisma } from "@/lib/prisma";

// หมวดเดิมที่ไม่มีหน้าตรงตัว
const EXTRA: Record<string, string> = {
  "outdoor-lighting-supermarket": "/category/bollard-led",
  "ไฟแอลอีดี-ไฟใต้น้ำ-ไฟสระน้ำ-ไฟใต้น้ำ-ไฟส่องกำแพง-ไฟส่องต้นไม้-ไฟดาวน์ไลท์-ไฟสปร์อตไลท์-ไฟเส้นแอลอีดี": "/products",
};

export async function GET(req: Request, ctx: RouteContext<"/product-category/[...path]">) {
  const { path } = await ctx.params;
  const segs = path.map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  }).filter((p) => p && p !== "page" && !/^\d+$/.test(p));
  const last = segs.at(-1) ?? "";
  let to = EXTRA[last] ?? null;
  if (!to && last) {
    const c = await prisma.category.findFirst({ where: { legacySlug: last, isActive: true }, select: { slug: true } });
    if (c) to = `/category/${encodeURIComponent(c.slug)}`;
  }
  return Response.redirect(new URL(to ?? "/products", req.url), 301);
}
