// รูปภาพประกอบใต้ Data Sheet (src/lib/product-gallery.ts)
import assert from "node:assert/strict";
import { GALLERY_LAYOUTS, GALLERY_MAX, LAYOUT_ICON, galleryBlocks, parseGallery, splitClip } from "../../src/lib/product-gallery";

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
eq(GALLERY_LAYOUTS.length, 18, "18 รูปแบบ");
console.log(`product-gallery: ผ่าน ${n} ข้อ`);
