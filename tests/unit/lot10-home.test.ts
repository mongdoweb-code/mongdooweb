// ล็อต 10: ค่าหน้าแรก (ลำดับส่วน / ความน่าเชื่อถือ / เวลาทำการ) — ค่าผิดรูปแบบต้องถูกข้ามอย่างนุ่มนวล
import assert from "node:assert/strict";
import { HOME_KEYS, hoursSummary, parseHomeSections, parseOpeningHours, parseTrust } from "../../src/lib/home";
import { parsePopular, popularBgColor } from "../../src/lib/popular-cats";

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
