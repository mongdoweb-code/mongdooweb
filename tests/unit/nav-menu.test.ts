// ทดสอบหน่วย: เมนูหลักหน้าร้าน (src/lib/nav-menu.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { NAV_BUILTINS, NAV_CUSTOM_MAX, NAV_VISIBLE_MAX, navMenuToJson, parseNavMenu, renderDrawerNavHtml, renderNavHtml, safeNavHref } from "../../src/lib/nav-menu";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n++; };
const shown = (v: unknown) => parseNavMenu(v).items.filter((i) => i.show).map((i) => i.key);

// ค่าเริ่มต้น = เมนูเดิม 7 รายการ
eq(shown({}), ["home", "cats", "all", "best", "finder", "howto", "contact"], "{} = เมนูเดิม");
eq(shown(null), shown({}), "null = เมนูเดิม");
eq(parseNavMenu({}).icons, { theme: true, search: true, track: true, wishlist: true }, "ไอคอนเปิดทั้งหมด");
// เรียง/ซ่อน/เปลี่ยนชื่อ · เมนูในระบบที่ไม่มีในค่าที่บันทึก ต่อท้ายแบบซ่อน
const m = parseNavMenu({ items: [{ key: "contact", label: "  ติดต่อ  ร้าน ", show: true }, { key: "home", show: false }, { key: "blog", show: true }], icons: { search: false } });
eq(m.items.slice(0, 3).map((i) => [i.key, i.label, i.show]), [["contact", "ติดต่อ ร้าน", true], ["home", "หน้าแรก", false], ["blog", "บทความ", true]], "เรียง + ชื่อ + ซ่อน");
eq(m.items.length, NAV_BUILTINS.length, "เมนูในระบบครบ");
eq(m.items.filter((i) => i.show).map((i) => i.key), ["contact", "blog"], "ที่เหลือต่อท้ายแบบซ่อน");
eq(m.icons.search, false, "ซ่อนค้นหา");
// ลิงก์เพิ่มเอง: ปลอดภัยเท่านั้น · จำกัดจำนวน · เปิดแท็บใหม่เฉพาะ https
eq(safeNavHref("/blog"), "/blog", "ลิงก์ในเว็บ");
eq(safeNavHref("https://shopee.co.th/x"), "https://shopee.co.th/x", "https");
eq([safeNavHref("//evil.com"), safeNavHref("javascript:alert(1)"), safeNavHref("http://x.com"), safeNavHref('/a"b')], [null, null, null, null], "ลิงก์อันตรายถูกปฏิเสธ");
const c = parseNavMenu({ items: [{ key: "c1", label: "Shopee", href: "https://shopee.co.th/mdw", newTab: true }, { key: "c2", label: "ภายใน", href: "/blog", newTab: true }, { key: "c3", label: "แย่", href: "javascript:x" }, { key: "c4", label: "", href: "/x" }] });
eq(c.items.filter((i) => i.custom).map((i) => [i.key, i.newTab]), [["c1", true], ["c2", false]], "ลิงก์ผิด/ไม่มีชื่อถูกตัด · แท็บใหม่เฉพาะ https");
const many = parseNavMenu({ items: Array.from({ length: 8 }, (_, i) => ({ key: `c${i + 1}`, label: `L${i}`, href: "/x" })) });
eq(many.items.filter((i) => i.custom).length, NAV_CUSTOM_MAX, "ลิงก์เพิ่มเองไม่เกินที่กำหนด");
const lots = parseNavMenu({ items: NAV_BUILTINS.map((b) => ({ key: b.key, show: true })) });
eq(lots.items.filter((i) => i.show).length, NAV_VISIBLE_MAX, "แสดงพร้อมกันไม่เกินที่กำหนด");
eq(parseNavMenu({ items: [{ key: "home" }, { key: "home", show: false }] }).items.filter((i) => i.key === "home").length, 1, "ไม่ซ้ำ");
// บันทึกแล้วอ่านกลับได้ค่าเดิม
eq(parseNavMenu(navMenuToJson(m)), m, "ไป-กลับ");
// HTML: escape · ป้ายจำนวน · เมนูเลื่อนลง · มือถือไม่ซ้ำหน้าแรก/หมวด
const x = parseNavMenu({ items: [{ key: "home" }, { key: "cats", label: "<b>หมวด</b>" }, { key: "all" }, { key: "c1", label: "ร้าน & Shopee", href: "https://s.co/?a=1&b=2", newTab: true }] });
const h = renderNavHtml(x, { productCount: 1234 });
eq(h.includes("&lt;b&gt;หมวด&lt;/b&gt;") && h.includes('id="megaBtn"'), true, "escape + เมนูเลื่อนลง");
eq(/nav-count[^>]*>1,234</.test(h), true, "ป้ายจำนวนสินค้า");
eq(h.includes('href="https://s.co/?a=1&amp;b=2" target="_blank" rel="noopener">ร้าน &amp; Shopee'), true, "ลิงก์ภายนอก");
const d = renderDrawerNavHtml(x, { productCount: 3 });
eq(d.includes('href="/"') || d.includes("megaBtn"), false, "มือถือไม่ซ้ำหน้าแรก/หมวด");
eq(d.includes("dr-count"), true, "มือถือมีป้ายจำนวน");
console.log(`nav-menu: ${n} ข้อผ่าน`);
