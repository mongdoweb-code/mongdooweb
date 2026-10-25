// /blog/rss.xml — ฟีด RSS ของบทความ (เฉพาะที่ถึงเวลาเผยแพร่แล้ว) 20 เรื่องล่าสุด
import { connection } from "next/server";
import { getPublishedPosts, visibleNow } from "@/lib/blog";
import { absUrl } from "@/lib/storefront";

const x = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export async function GET() {
  await connection();
  const posts = visibleNow(await getPublishedPosts()).slice(0, 20);
  const items = posts
    .map((p) => {
      const url = absUrl(`/blog/${encodeURIComponent(p.slug)}`);
      return `<item><title>${x(p.title)}</title><link>${x(url)}</link><guid isPermaLink="true">${x(url)}</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate>${p.excerpt ? `<description>${x(p.excerpt)}</description>` : ""}${p.tags.map((t) => `<category>${x(t)}</category>`).join("")}</item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>บทความ — มองดูเว็บ</title><link>${x(absUrl("/blog"))}</link><atom:link href="${x(absUrl("/blog/rss.xml"))}" rel="self" type="application/rss+xml"/><description>ความรู้เรื่องไฟ LED ใต้น้ำ สระว่ายน้ำ น้ำพุ และสวน</description><language>th</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
