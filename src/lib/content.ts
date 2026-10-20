// เนื้อหาหน้าที่แก้ได้จากหลังบ้าน (Page) — เก็บเป็นข้อความแบบง่าย แล้วแปลงเป็น HTML ที่ปลอดภัย
// รูปแบบที่รองรับ: "## หัวข้อ", "### หัวข้อย่อย", "- รายการ", "1. รายการเรียงเลข", บรรทัดว่าง = ย่อหน้าใหม่,
// **ตัวหนา**, [ข้อความ](ลิงก์ — เฉพาะ /, #, https://, tel:, mailto:), ตัวแปร {{phone}} {{lineId}} {{email}} {{address}} {{name}}
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";

export const PAGE_SLUGS = ["privacy", "warranty", "about", "how-to-order"] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];
export const isPageSlug = (s: string): s is PageSlug => (PAGE_SLUGS as readonly string[]).includes(s);
export const PAGE_TITLES: Record<PageSlug, string> = {
  privacy: "นโยบายความเป็นส่วนตัว",
  warranty: "การรับประกันและเคลมสินค้า",
  about: "เกี่ยวกับเรา",
  "how-to-order": "วิธีสั่งซื้อและชำระเงิน",
};

/** เนื้อหาเริ่มต้น (ใช้เมื่อยังไม่มีการแก้ในหลังบ้าน) — ล็อต 2 เติมเนื้อหาจริงของแต่ละหน้า */
export const DEFAULT_PAGE_BODIES: Record<PageSlug, string> = {
  privacy: "",
  warranty: "",
  about: "",
  "how-to-order": "",
};

export type PageContent = { slug: PageSlug; title: string; body: string; updatedAt: string | null; isDefault: boolean };

/** อ่านเนื้อหาหน้า (แคช + ล้างด้วย tag storefront เมื่อแก้ในหลังบ้าน) */
export async function getPage(slug: PageSlug): Promise<PageContent> {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const p = await prisma.page.findUnique({ where: { slug } });
  if (p && p.body.trim()) return { slug, title: p.title || PAGE_TITLES[slug], body: p.body, updatedAt: p.updatedAt.toISOString(), isDefault: false };
  return { slug, title: PAGE_TITLES[slug], body: DEFAULT_PAGE_BODIES[slug], updatedAt: null, isDefault: true };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeHref = (h: string) => /^(\/(?!\/)|#|https:\/\/|tel:|mailto:)\S*$/i.test(h);

function inline(text: string, vars: Record<string, string>) {
  let s = esc(text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? ""));
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    const h = href.replace(/&amp;/g, "&");
    if (!safeHref(h)) return label;
    const ext = /^https:\/\//i.test(h);
    return `<a href="${esc(h)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
  });
  return s;
}

/** ข้อความแบบง่าย → HTML (escape ทุกอย่างก่อน จึงไม่มี HTML/สคริปต์จากผู้แก้หลุดออกไป) */
export function renderBody(body: string, vars: Record<string, string> = {}) {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map((l) => inline(l, vars)).join("<br>")}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    const ul = /^\s*[-•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if (h) {
      flushPara();
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2], vars)}</h${h[1].length}>`);
    } else if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1], vars)}</li>`);
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara();
  closeList();
  return out.join("\n");
}
