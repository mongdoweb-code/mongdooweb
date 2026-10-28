// แปลงคำอธิบายแบบ "ขึ้นบรรทัดด้วย Enter" (จาก WooCommerce — เว็บเดิมใช้ wpautop) เป็นย่อหน้า/ขึ้นบรรทัดจริง
// ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์ (แสดงหน้าร้าน) และในตัวแก้ไขข้อความหลังบ้าน — HTML ที่มี <p>/<br>/<div> อยู่แล้วไม่แตะ
const TAG = /(<\/?(?:h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|blockquote|figure|figcaption|hr)\b[^>]*>)/i;
const VOID = /^<hr\b/i;

export function autoParagraph(html: string) {
  if (!html || /<(p|br|div)\b/i.test(html) || !html.includes("\n")) return html;
  const out: string[] = [];
  let depth = 0;
  let inline = "";
  // ข้อความนอกบล็อก: บรรทัดว่าง = ย่อหน้าใหม่, Enter = ขึ้นบรรทัด
  const flush = () => {
    for (const para of inline.split(/\n\s*\n/)) {
      const t = para.trim();
      if (t) out.push(`<p>${t.replace(/\s*\n\s*/g, "<br>\n")}</p>`);
    }
    inline = "";
  };
  for (const part of html.replace(/\r\n?/g, "\n").split(TAG)) {
    if (!part) continue;
    if (TAG.test(part) && part.startsWith("<")) {
      if (depth === 0) flush();
      out.push(part);
      if (!VOID.test(part)) depth = Math.max(0, depth + (part.startsWith("</") ? -1 : 1));
    } else if (depth === 0) inline += part;
    else out.push(part);
  }
  flush();
  return out.join("");
}
