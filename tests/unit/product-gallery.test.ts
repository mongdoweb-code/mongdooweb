// รูปภาพประกอบใต้ Data Sheet (src/lib/product-gallery.ts)
import assert from "node:assert/strict";
import { GALLERY_LAYOUTS, GALLERY_MAX, HEART_MASK, LAYOUT_ICON, galleryBlocks, parseGallery, ratioOf, splitClip } from "../../src/lib/product-gallery";
import { WM_DEFAULT, parseWatermark, wmPreviewStyle, wmUrl, wmVersion } from "../../src/lib/watermark";

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const k = (i: number) => `products/2026/11/g${i}.webp`;

eq(parseGallery(null).items, [], "ว่าง");
eq(parseGallery("{bad").layout, "col2", "JSON เสีย = ค่าเริ่มต้น");
const g = parseGallery({ title: "  ภาพ  งาน ", layout: "bigLeft", gap: 999, pad: -5, radius: "12", caption: "below", items: [{ key: k(1), cap: " หน้า  บ้าน " }, { key: k(1) }, { key: "https://evil/x.webp" }, { key: "../etc/passwd" }, { key: k(2), cap: "x".repeat(300) }] });
eq([g.title, g.layout, g.gap, g.pad, g.radius, g.caption], ["ภาพ งาน", "bigLeft", 40, 0, 12, "below"], "จำกัดช่วง/ตัดช่องว่าง");
eq(g.items.map((x) => x.key), [k(1), k(2)], "รับเฉพาะไฟล์ของร้าน ไม่ซ้ำ");
eq(g.items[1].cap.length, 120, "คำบรรยายยาวสุด 120");
eq(parseGallery({ layout: "nope", caption: "x" }).layout, "col2", "รูปแบบไม่รู้จัก = เรียง 2");
eq(parseGallery({ items: Array.from({ length: 40 }, (_, i) => ({ key: k(i) })) }).items.length, GALLERY_MAX, "สูงสุด 24 รูป");
// แบ่งบล็อก
const items = Array.from({ length: 7 }, (_, i) => ({ key: k(i), cap: "" }));
eq(galleryBlocks({ layout: "col3", items }).map((b) => [b.layout, b.items.length]), [["col3", 7]], "แบบเรียง = บล็อกเดียว");
eq(galleryBlocks({ layout: "bigLeft", items }).map((b) => [b.layout, b.items.length]), [["bigLeft", 3], ["bigLeft", 3], ["col1", 1]], "คอลลาจซ้ำ · เศษ 1 = เรียง 1");
eq(galleryBlocks({ layout: "diagL", items: items.slice(0, 5) }).map((b) => b.layout), ["diagL", "diagL", "col1"], "แบ่งเส้นทีละ 2");
eq(galleryBlocks({ layout: "free", items: items.slice(0, 5) }).map((b) => b.layout), ["free", "col2"], "เศษ 2 = เรียง 2");
eq(galleryBlocks({ layout: "bigTop", items: items.slice(0, 4) })[1].items[0].i, 3, "ลำดับรูปรวม (เปิดเต็มจอ)");
ok(/^polygon\(/.test(splitClip("curveS")) && splitClip("curveS").split(",").length > 20, "เส้นโค้งเป็น polygon");
ok(GALLERY_LAYOUTS.every((l) => LAYOUT_ICON[l.key]), "ทุกรูปแบบมีไอคอน");
eq(GALLERY_LAYOUTS.length, 24, "24 รูปแบบ");
// รูปแบบใหม่ + อัตราส่วน
eq(galleryBlocks({ layout: "hex", items }).map((b) => [b.layout, b.items.length]), [["hex", 7]], "รังผึ้ง 7 รูป");
eq(galleryBlocks({ layout: "cross4", items }).map((b) => b.layout), ["cross4", "bigLeft"], "กากบาท 4 · เศษ 3 = ใหญ่ซ้าย");
const heart = galleryBlocks({ layout: "heart", items: items.slice(0, 3) });
eq([heart.length, heart[0].items.length, heart[0].items[3].i], [1, HEART_MASK.join("").replace(/0/g, "").length, 0], "หัวใจวนรูปจนเต็ม");
eq(ratioOf("col1", ""), 16 / 9, "เรียง 1 ค่าเริ่มต้น 16:9");
eq(ratioOf("col1", "9:16"), 9 / 16, "เรียง 1 แนวตั้ง");
eq(ratioOf("col2", "auto"), null, "ตามรูปจริง");
eq(ratioOf("bigLeft", "1:1"), 4 / 3, "แบบคอลลาจไม่ใช้อัตราส่วนที่ตั้ง");
eq([parseGallery({ ratio: "9:16", fit: "contain", wm: false }).ratio, parseGallery({ ratio: "7:3" }).ratio, parseGallery({}).wm, parseGallery({ fit: "x" }).fit], ["9:16", "", true, "cover"], "ตรวจอัตราส่วน/การแสดง/ลายน้ำ");
// ลายน้ำ
const w = parseWatermark({ key: "logo/2026/11/wm.webp", pos: "br", size: 99, opacity: 5, margin: 3, main: true });
eq([w.size, w.opacity, w.pos, w.main], [60, 10, "br", true], "จำกัดช่วงลายน้ำ");
eq(parseWatermark({ key: "../x.webp", pos: "zz" }).key + parseWatermark({ pos: "zz" }).pos, WM_DEFAULT.pos, "ไฟล์/ตำแหน่งที่ไม่ถูกต้อง");
ok(wmUrl("products/2026/11/a.webp", w).startsWith(`/media/wm/${wmVersion(w)}/products/`), "URL ลายน้ำ");
eq(wmUrl("products/2026/11/a-sm.webp", w), "/media/products/2026/11/a-sm.webp", "รูปย่อไม่ใส่ลายน้ำ");
eq(wmUrl("products/2026/11/a.webp", { ...w, key: "" }), "/media/products/2026/11/a.webp", "ไม่มีไฟล์ลายน้ำ = URL เดิม");
ok(wmVersion(w) !== wmVersion({ ...w, size: 30 }) && wmVersion(w) === wmVersion({ ...w, main: false }), "รุ่นเปลี่ยนเมื่อค่าที่มีผลกับรูปเปลี่ยน");
eq([wmPreviewStyle(w).right, wmPreviewStyle(w).bottom, wmPreviewStyle(w).width], ["3%", "3%", "60%"], "ตำแหน่งตัวอย่าง");
console.log(`product-gallery: ผ่าน ${n} ข้อ`);
