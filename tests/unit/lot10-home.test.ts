// ล็อต 10: ค่าหน้าแรก (ลำดับส่วน / ความน่าเชื่อถือ / เวลาทำการ) — ค่าผิดรูปแบบต้องถูกข้ามอย่างนุ่มนวล
import assert from "node:assert/strict";
import { HOME_KEYS, hoursSummary, parseHomeSections, parseOpeningHours, parseTrust } from "../../src/lib/home";
import { parsePopular, popularBgColor, popularImgUrl } from "../../src/lib/popular-cats";
import * as whyUs from "../../src/lib/why-us";

// ลำดับ: รับทั้ง string และ { key, show }, ตัดซ้ำ/ไม่รู้จัก, คงลำดับที่บันทึกไว้, สไลด์ซ่อนไม่ได้
// ส่วนที่ขาด (เพิ่มใหม่ภายหลัง) แทรกต่อจากส่วนที่อยู่ก่อนหน้าในรายการเริ่มต้น
const s = parseHomeSections(["trust", { key: "slides", show: false }, "bogus", "trust", { key: "finder", show: false }]);
const saved = s.filter((x) => ["trust", "slides", "finder"].includes(x.key));
assert.deepEqual(saved, [{ key: "trust", show: true }, { key: "slides", show: true }, { key: "finder", show: false }]);
assert.equal(s.length, HOME_KEYS.length);
assert.equal(new Set(s.map((x) => x.key)).size, HOME_KEYS.length);
// ร้านที่บันทึกลำดับไว้ก่อนมี "หมวดยอดนิยม" → ได้ส่วนใหม่ต่อจาก "หมวดหมู่สินค้า" (ไม่ใช่ท้ายหน้า) และแสดงอยู่
const old = HOME_KEYS.filter((k) => k !== "popular").reverse();
const withNew = parseHomeSections(old).map((x) => x.key);
assert.equal(withNew.indexOf("popular"), withNew.indexOf("categories") + 1);
assert.deepEqual(withNew.filter((k) => k !== "popular"), old);
assert.deepEqual(parseHomeSections(null).map((x) => x.key), HOME_KEYS);

// ความน่าเชื่อถือ: โลโก้ต้องเป็นไฟล์ trust/ ที่อัปโหลด, ลิงก์อันตรายถูกตัด, ตัวเลขต้องมีทั้งค่าและคำอธิบาย
const t = parseTrust({
  logos: [{ name: "A", key: "trust/2026/10/a.webp", href: "javascript:alert(1)" }, { name: "B", key: "https://evil/x.png" }, { name: "C", key: "trust/c.webp", href: "https://c.co" }],
  stats: [{ value: "500+", label: "งาน" }, { value: "", label: "x" }],
  showRating: false,
});
assert.deepEqual(t.logos, [{ name: "A", key: "trust/2026/10/a.webp", href: null }, { name: "C", key: "trust/c.webp", href: "https://c.co" }]);
assert.deepEqual(t.stats, [{ value: "500+", label: "งาน" }]);
assert.equal(t.showRating, false);
assert.equal(parseTrust(undefined).showRating, true);

// เวลาทำการ
const h = parseOpeningHours([{ day: 1, open: "09:00", close: "18:00" }, { day: 2, open: "09:00", close: "18:00" }, { day: 6, open: "09:00", close: "12:00" }, { day: 3, open: "18:00", close: "09:00" }, { day: 9, open: "09:00", close: "10:00" }, { day: 0, open: "9:00", close: "10:00" }]);
assert.equal(h.length, 3);
assert.equal(hoursSummary(h), "จันทร์–อังคาร 09:00–18:00 · เสาร์ 09:00–12:00");
assert.deepEqual(parseOpeningHours("x"), []);

console.log("lot10-home: ผ่านทั้งหมด");

// สีพื้นการ์ดหมวดยอดนิยม: ชื่อพาสเทล หรือ #RRGGBB จากตารางสี · ค่าผิดรูปแบบ → พาสเทลอัตโนมัติ
{
  const c = parsePopular({ items: [{ cat: "a", bg: "sky" }, { cat: "b", bg: "#d9ead3" }, { cat: "c", bg: "url(x)" }, { cat: "d", bg: "#12345" }] });
  assert.equal(c.items[0].bg, "sky");
  assert.equal(c.items[1].bg, "#D9EAD3");
  assert.ok(!c.items[2].bg.startsWith("#") && !c.items[3].bg.startsWith("#"));
  assert.equal(popularBgColor("sky"), "#DDE9F4");
  assert.equal(popularBgColor("#d9ead3"), "#D9EAD3");
  assert.equal(popularBgColor("red;background:url(x)"), "#F2EDE3");
  console.log("popular bg: ok");
}

// รูปการ์ดหมวดยอดนิยมที่อัปโหลดเอง: รับเฉพาะ popular/YYYY/MM/<id>.webp ที่ระบบสร้าง
{

  const ok = "popular/2026/11/mabc123def0.webp";
  const p = parsePopular({ items: [
    { cat: "pool-light", img: ok },
    { cat: "garden-light", img: "https://evil.example/x.webp" },
    { cat: "spot-light", img: "products/2026/11/abc.webp" },
    { cat: "wall-light", img: "popular/2026/11/../../x.webp" },
    { cat: "fountain-light" },
  ] });
  assert.equal(p.items[0].img, ok);
  for (const it of p.items.slice(1)) assert.equal(it.img, undefined, `ไม่รับรูป ${it.cat}`);
  assert.equal("img" in p.items[4], false, "ไม่มีรูป = ไม่มีคีย์ img");
  assert.equal(popularImgUrl(ok), "/media/popular/2026/11/mabc123def0-sm.webp");
  console.log("popular img: ok");
}

// ส่วน "ทำไมต้องมองดูเว็บ" (src/lib/why-us.ts)
{
  const { parseWhyUs, renderWhyHtml, WHY_DEFAULT, safeWhyHref } = whyUs;
  assert.deepEqual(parseWhyUs({}), WHY_DEFAULT, "{} = ข้อความเดิม");
  assert.deepEqual(parseWhyUs(null), WHY_DEFAULT);
  const c = parseWhyUs({
    eyebrow: "  จุดเด่น  ร้าน ", title: "บรรทัด 1\r\n\r\nบรรทัด 2\nบรรทัด 3\nบรรทัด 4",
    items: [{ title: "ก", text: "x".repeat(300) }, { title: "" }, { title: "ข" }, ...Array.from({ length: 8 }, (_, i) => ({ title: `t${i}` }))],
    imageMode: "upload", imageKey: "why/2026/11/abc123.webp", capTitle: "<b>", capSub: "", href: "javascript:alert(1)",
  });
  assert.equal(c.eyebrow, "จุดเด่น ร้าน");
  assert.equal(c.title, "บรรทัด 1\nบรรทัด 2\nบรรทัด 3", "สูงสุด 3 บรรทัด ไม่มีบรรทัดว่าง");
  assert.equal(c.items.length, 6, "สูงสุด 6 ข้อ · ข้อที่ไม่มีหัวข้อถูกตัด");
  assert.equal(c.items[0].text.length, 200);
  assert.equal(c.href, null, "ลิงก์อันตรายถูกตัด");
  assert.equal(c.imageMode, "upload");
  assert.equal(parseWhyUs({ imageMode: "upload", imageKey: "https://evil/x.webp" }).imageMode, "project", "อัปโหลดแต่รูปไม่ถูกต้อง = ใช้รูปผลงาน");
  assert.equal(parseWhyUs({ imageMode: "none" }).imageMode, "none");
  assert.equal(parseWhyUs({ capTitle: "" }).capTitle, "", "ลบคำบรรยายได้");
  assert.equal(safeWhyHref("/projects"), "/projects");
  assert.equal(safeWhyHref("//evil.com"), null);
  const h = renderWhyHtml(c, { imageUrl: "/media/why/2026/11/abc123.webp" });
  assert.ok(h.includes('<div class="feature-visual reveal has-img"><img src="/media/why/2026/11/abc123.webp"'), "รูปอัปโหลด ไม่มีลิงก์ = div");
  assert.ok(h.includes("<b>&lt;b&gt;</b>") && !h.includes("<span></span>"), "escape + ไม่มีบรรทัดรองว่าง");
  assert.ok(h.includes("บรรทัด 1<br>บรรทัด 2<br>บรรทัด 3"));
  assert.ok(h.includes('<div class="num">06</div>') && !h.includes('<div class="num">07</div>'));
  assert.ok(h.startsWith("<!-- ==================== WHY US") && h.includes('id="why"'));
  const linked = renderWhyHtml({ ...c, href: "https://example.com/x" }, { imageUrl: "/media/why/2026/11/abc123.webp" });
  assert.ok(linked.includes('<a class="feature-visual reveal has-img" href="https://example.com/x" target="_blank" rel="noopener"'));
  const none = renderWhyHtml({ ...WHY_DEFAULT, imageMode: "none" }, { projects: [{ title: "P", kind: null, location: null, cover: { full: "/x.webp" } }] });
  assert.ok(none.includes('<div class="feature-visual reveal"><div class="cap">'), "ไม่ใช้รูป = พื้นไล่สี แม้มีผลงาน");
  // กล่องรูปโปร่งใส + สีข้อความ
  const cc = parseWhyUs({ imageMode: "upload", imageKey: "why/2026/11/abc123.webp", clear: true, colors: { title: "#1a73e8", eyebrow: "red", num: "#12345", capSub: "#ABCDEF\"><script>", itemText: " #00aa00 ", bogus: "#FFFFFF" } });
  assert.equal(cc.clear, true);
  assert.equal(parseWhyUs({ clear: "yes" }).clear, false, "ต้องเป็น true เท่านั้น");
  assert.deepEqual(cc.colors, { title: "#1A73E8", itemText: "#00AA00" }, "รับเฉพาะ #RRGGBB ของช่องที่รู้จัก");
  const hc = renderWhyHtml(cc, { imageUrl: "/media/why/2026/11/abc123.webp" });
  assert.ok(hc.includes("has-img is-clear"), "โปร่งใสเมื่อมีรูป");
  assert.ok(hc.includes('<h2 class="sec-title" data-wc style="--wc:#1A73E8">') && hc.includes('<p data-wc style="--wc:#00AA00">'));
  assert.ok(!hc.includes('class="eyebrow" data-wc'), "ช่องที่ไม่ตั้งสีไม่มี data-wc");
  assert.ok(!renderWhyHtml({ ...cc, imageMode: "none" }).includes("is-clear"), "ไม่มีรูป = ไม่โปร่งใส");
  assert.ok(!renderWhyHtml({ ...cc, colors: { title: "#000;}</style>" } as never }).includes("</style>"), "สีที่ไม่ผ่านรูปแบบไม่ถูกพิมพ์");
  console.log("why-us: ok");
}
