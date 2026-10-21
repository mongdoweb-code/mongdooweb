// ส่วนแปลง HTML ของ scripts/migrate-description-images.ts (แยกไว้ให้ทดสอบหน่วยได้โดยไม่ต่อฐานข้อมูล)
// โดเมนของเว็บเดิม: มองดูเว็บ.com (punycode), mongdoweb.com — ไม่รวมโดเมนใหม่ mongdooweb.com
const OLD_ORIGIN = String.raw`(?:https?:)?\/\/(?:www\.)?(?:xn--72c0asz6a7a5fqc6c|มองดูเว็บ|mongdoweb)\.com`;
const OLD_ORIGIN_RE = new RegExp(`^${OLD_ORIGIN}(?=[/?#]|$)`, "i");
export const OLD_HOST_SQL = ["xn--72c0asz6a7a5fqc6c.com", "มองดูเว็บ.com", "mongdoweb.com", "s.w.org/images/core/emoji"];
const IMG_EXT = /\.(?:jpe?g|png|gif|webp)$/i;

export const isOldUrl = (u: string) => OLD_ORIGIN_RE.test(u.trim());
const isOldUpload = (u: string) => isOldUrl(u) && /\/wp-content\/uploads\//i.test(u);
const pathOf = (u: string) => u.trim().replace(OLD_ORIGIN_RE, "") || "/";

export type MigrateDeps = {
  /** ดาวน์โหลด+เก็บรูป คืน URL ใหม่ (/media/...) หรือ null เมื่อทำไม่ได้ */
  image: (url: string) => Promise<string | null>;
  /** path ภายในเว็บใหม่สำหรับลิงก์หน้าเว็บเดิม (ไม่รวม /wp-content) */
  link: (path: string) => Promise<string>;
};

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? null;
const setAttr = (tag: string, name: string, value: string) =>
  tag.replace(new RegExp(`(\\s${name}=")[^"]*(")`, "i"), (_m, a: string, b: string) => `${a}${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}${b}`);
const decodeAmp = (s: string) => s.replace(/&amp;/g, "&");

async function replaceAsync(s: string, re: RegExp, fn: (...m: string[]) => Promise<string>) {
  const jobs: Promise<string>[] = [];
  s.replace(re, (...m) => {
    jobs.push(fn(...(m as string[])));
    return "";
  });
  const out = await Promise.all(jobs);
  let i = 0;
  return s.replace(re, () => out[i++]);
}

/** แปลง HTML หนึ่งช่อง — คืน HTML ใหม่ (เท่าเดิมถ้าไม่มีอะไรต้องแก้) */
export async function migrateHtml(html: string, deps: MigrateDeps): Promise<string> {
  let out = html;
  // 1) อีโมจิของ WordPress เป็นรูป → ตัวอักษร
  out = out.replace(/<img\b[^>]*\bsrc="(?:https?:)?\/\/s\.w\.org\/images\/core\/emoji\/[^"]*"[^>]*>/gi, (tag) => attr(tag, "alt") ?? "");
  // 2) ลิงก์ที่ครอบรูปเดียวและชี้ไปไฟล์รูปบนเว็บเดิม → เหลือแต่รูป (เปิดรูปใหญ่ได้จากแกลเลอรีของหน้าสินค้าแทน)
  out = out.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi, (all, href: string, img: string) =>
    isOldUpload(decodeAmp(href)) ? img : all,
  );
  // 3) รูปบนเว็บเดิม → /media/...
  out = await replaceAsync(out, /<img\b[^>]*>/gi, async (tag) => {
    const src = attr(tag, "src");
    if (!src || !isOldUpload(decodeAmp(src))) return tag;
    const to = await deps.image(decodeAmp(src));
    return to ? setAttr(tag, "src", to) : tag;
  });
  // 4) ลิงก์ไปเว็บเดิม
  out = await replaceAsync(out, /<a\b[^>]*>/gi, async (tag) => {
    const href = attr(tag, "href");
    if (!href || !isOldUrl(decodeAmp(href))) return tag;
    const u = decodeAmp(href);
    if (/\/wp-content\//i.test(u)) {
      const clean = u.split(/[?#]/)[0];
      // ไฟล์รูป → รูปที่ย้ายแล้ว · ไฟล์อื่น (เช่น PDF) ย้ายไม่ได้ → ไปหน้าสินค้าทั้งหมดแทนลิงก์เสีย
      const to = IMG_EXT.test(clean) && isOldUpload(u) ? await deps.image(u) : null;
      return to ? setAttr(tag, "href", to) : IMG_EXT.test(clean) ? tag : setAttr(tag, "href", "/products");
    }
    return setAttr(tag, "href", await deps.link(pathOf(u)));
  });
  return out;
}

/** path ของเว็บเดิม → path ในเว็บใหม่ */
export function makeLinkResolver(findLegacy: (legacyPath: string) => Promise<string | null>) {
  const cache = new Map<string, string>();
  return async (raw: string) => {
    if (cache.has(raw)) return cache.get(raw)!;
    let path = raw;
    try {
      path = decodeURI(raw);
    } catch {}
    path = path.normalize("NFC");
    const [p, rest = ""] = path.split(/(?=[?#])/);
    const segs = p.split("/").filter(Boolean);
    let to: string;
    if (!segs.length) to = rest.startsWith("?") ? `/${rest}` : "/"; // /?p=123 → redirect ของ /api/legacy-wp
    else if ((segs[0] === "product" || segs[0] === "สินค้าทั้งหมด") && segs[1]) {
      // ฐานสินค้าเดิมมีทั้ง /product/<ชื่อ> และ /สินค้าทั้งหมด/<ชื่อ>
      const slug = await findLegacy(`/product/${segs[1]}`);
      to = slug ? `/product/${encodeURIComponent(slug)}` : "/products";
    } else if (["product-category", "category", "tag", "product-tag", "shop", "page", "feed", "my-account", "cart"].includes(segs[0]) || /^\d{4}$/.test(segs[0]))
      to = encodeURI(p) + (rest.startsWith("?") ? rest.split("#")[0] : ""); // redirect 301 ใน next.config.ts / proxy รองรับ
    else to = "/products"; // หน้า/บทความเดิม (.html ฯลฯ) ที่เว็บใหม่ไม่มี
    cache.set(raw, to);
    return to;
  };
}
