// ทำความสะอาด HTML คำอธิบายสินค้า (จากเว็บเดิมหรือที่แอดมินพิมพ์) ก่อนเก็บ/แสดง
// อนุญาตเฉพาะแท็กจัดรูปแบบพื้นฐาน ลิงก์ http(s)/ภายใน และรูปจาก https หรือ /media
import sanitizeHtml from "sanitize-html";

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/i;

export function sanitizeDescription(html: string, rewriteImg?: (src: string) => string | null) {
  const cleaned = html
    .replace(/\\n/g, "\n") // ตัว \n ที่ติดมาจากไฟล์ส่งออกของ WooCommerce
    .replace(/\[\/?[a-z_][^\]]*\]/gi, "") // shortcode ของ WordPress เช่น [gallery ...]
    .trim();
  const out = sanitizeHtml(cleaned, {
    allowedTags: ["p", "br", "h2", "h3", "h4", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup", "a", "img", "table", "thead", "tbody", "tr", "td", "th", "hr", "blockquote", "span", "div", "figure", "figcaption"],
    allowedAttributes: { "*": ["style"], a: ["href", "title"], img: ["src", "alt", "width", "height", "loading"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    // ตัวแก้ไขข้อความหลังบ้าน: จัดชิดขอบ ขนาด/สีตัวอักษร ไฮไลต์ ย่อหน้าเข้า — สไตล์อื่นถูกตัดทิ้ง
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        "font-size": [/^\d{1,2}(\.\d+)?(px|pt|em|rem)$/, /^(x-small|small|medium|large|x-large|xx-large|xxx-large)$/],
        color: [COLOR],
        "background-color": [COLOR],
        "margin-left": [/^\d{1,3}px$/],
        "font-weight": [/^(bold|[4-9]00)$/],
        "font-style": [/^italic$/],
        "text-decoration": [/^(underline|line-through)( (underline|line-through))?$/],
      },
      img: { width: [/^\d{1,4}(px|%)$/] },
    },
    allowedSchemes: ["http", "https", "tel", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    transformTags: {
      h1: "h2",
      font: (_tag, attribs) => ({ tagName: "span", attribs: (attribs.color && COLOR.test(attribs.color) ? { style: `color:${attribs.color}` } : {}) as Record<string, string> }),
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
