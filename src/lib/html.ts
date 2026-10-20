// ทำความสะอาด HTML คำอธิบายสินค้า (จากเว็บเดิมหรือที่แอดมินพิมพ์) ก่อนเก็บ/แสดง
// อนุญาตเฉพาะแท็กจัดรูปแบบพื้นฐาน ลิงก์ http(s)/ภายใน และรูปจาก https หรือ /media
import sanitizeHtml from "sanitize-html";

export function sanitizeDescription(html: string, rewriteImg?: (src: string) => string | null) {
  const cleaned = html
    .replace(/\\n/g, "\n") // ตัว \n ที่ติดมาจากไฟล์ส่งออกของ WooCommerce
    .replace(/\[\/?[a-z_][^\]]*\]/gi, "") // shortcode ของ WordPress เช่น [gallery ...]
    .trim();
  const out = sanitizeHtml(cleaned, {
    allowedTags: ["p", "br", "h2", "h3", "h4", "ul", "ol", "li", "strong", "b", "em", "i", "u", "a", "img", "table", "thead", "tbody", "tr", "td", "th", "hr", "blockquote", "span", "div", "figure", "figcaption"],
    allowedAttributes: { a: ["href", "title"], img: ["src", "alt", "width", "height", "loading"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedSchemes: ["http", "https", "tel", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    transformTags: {
      h1: "h2",
      a: (tag, attribs) => ({ tagName: "a", attribs: { ...attribs, rel: "nofollow noopener", target: "_blank" } }),
      img: (tag, attribs) => {
        const src = rewriteImg ? rewriteImg(attribs.src ?? "") : attribs.src;
        return src && /^(https:\/\/|\/media\/)/i.test(src) ? { tagName: "img", attribs: { ...attribs, src, loading: "lazy" } } : { tagName: "span", attribs: {} };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "p" && !frame.text.trim() && !frame.mediaChildren.length,
  });
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** ข้อความล้วนจาก HTML (ใช้ทำ meta description / ค้นหา) */
export function htmlToText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}
