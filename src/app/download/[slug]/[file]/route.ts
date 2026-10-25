// GET /download/:slug/:file — ไฟล์ดาวน์โหลดของสินค้า (สเปกชีต/คู่มือ PDF) จากหน้าสินค้า
// เปิดได้เฉพาะไฟล์ที่ผูกกับสินค้าที่เปิดขายอยู่ · ชื่อไฟล์ตอนบันทึก = ชื่อที่ร้านตั้ง (รองรับภาษาไทย)
// ?view=1 = เปิดดูในเบราว์เซอร์ (inline) แทนการดาวน์โหลด
import { prisma } from "@/lib/prisma";
import { contentDisposition, fileId, isPdf, parseDownloads } from "@/lib/product-downloads";
import { storage } from "@/lib/storage";

const notFound = () => new Response("ไม่พบไฟล์", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });

export async function GET(req: Request, ctx: RouteContext<"/download/[slug]/[file]">) {
  const { slug: rawSlug, file } = await ctx.params;
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {}
  if (!/^[a-z0-9]{10,40}$/.test(file) || slug.length > 200) return notFound();
  const p = await prisma.product.findFirst({
    where: { slug, isActive: true, isService: false, category: { isActive: true } },
    select: { downloads: true },
  });
  const d = p ? parseDownloads(p.downloads).find((x) => fileId(x.key) === file) : undefined;
  if (!d) return notFound();
  let data: Buffer | null = null;
  try {
    data = await storage().get(d.key);
  } catch {
    data = null;
  }
  if (!data || !isPdf(data)) return notFound();
  const inline = new URL(req.url).searchParams.get("view") === "1";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": contentDisposition(d.name, inline),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
