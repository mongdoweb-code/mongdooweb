// ทดสอบหน่วยล็อต 12: diff ก่อน/หลัง (A29), srcset รูปหลายขนาด (U14), ZIP เขียน/อ่าน (A26) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { diffOf, visibleDiff } from "../../src/lib/log-diff";
import { mediaBase, srcSetOf } from "../../src/lib/img-srcset";
import { createZip, readZip } from "../../src/lib/zip";

// ---------- diffOf ----------
const d1 = diffOf({ priceSatang: 30000, name: "A", tags: ["x"], at: new Date("2026-01-01T00:00:00Z"), note: null }, { priceSatang: 33300, name: "A", tags: ["x"], at: new Date("2026-01-01T00:00:00Z"), note: "" });
assert.deepEqual(d1, { priceSatang: [30000, 33300] }); // null กับ "" ถือว่าเท่ากัน · วันที่/array เทียบตามค่า
assert.equal(diffOf({ a: 1 }, { a: 1 }), null);
// ฟิลด์ลับไม่ถูกบันทึกเด็ดขาด
assert.equal(diffOf({ passwordHash: "x", totpSecret: "a", publicToken: "t" }, { passwordHash: "y", totpSecret: "b", publicToken: "u" }), null);
// ข้อความยาวถูกตัด
const long = diffOf({ description: "" }, { description: "ก".repeat(1000) })!;
assert.ok(String(long.description[1]).length < 340 && String(long.description[1]).includes("1000 ตัวอักษร"));
// id/createdAt/updatedAt ข้าม
assert.equal(diffOf({ id: "1", updatedAt: new Date(0) }, { id: "2", updatedAt: new Date() }), null);
// พนักงานไม่เห็นต้นทุน
const cost = { costSatang: [100, 200], priceSatang: [1, 2] };
assert.deepEqual(visibleDiff(cost, false), { priceSatang: [1, 2] });
assert.deepEqual(visibleDiff(cost, true), cost);
assert.equal(visibleDiff({ costSatang: [1, 2] }, false), null);
assert.equal(visibleDiff("x", true), null);

// ---------- srcset ----------
assert.equal(mediaBase("/media/products/2026/10/abc.webp"), "/media/products/2026/10/abc");
assert.equal(mediaBase("/media/products/2026/10/abc-sm.webp"), "/media/products/2026/10/abc");
assert.equal(mediaBase("/media/products/2026/10/abc-w640.webp"), null);
assert.equal(mediaBase("https://example.com/a.webp"), null);
assert.equal(srcSetOf("/media/p/a-sm.webp", 640), "/media/p/a-w320.webp 320w, /media/p/a-w640.webp 640w");
assert.equal(srcSetOf("/media/p/a.webp"), "/media/p/a-w320.webp 320w, /media/p/a-w640.webp 640w, /media/p/a-w960.webp 960w, /media/p/a-w1280.webp 1280w, /media/p/a.webp 1600w");
assert.match(srcSetOf("https://images.unsplash.com/photo-1?x=1")!, /^https:\/\/images\.unsplash\.com\/photo-1\?auto=format&fit=crop&w=640&q=72 640w/);
assert.equal(srcSetOf("https://cdn.example.com/a.jpg"), undefined);
assert.equal(srcSetOf(null), undefined);

// ---------- ZIP เขียนแล้วอ่านกลับได้ตรง (ข้อความไทย, ไฟล์ใหญ่บีบอัด, ไฟล์เล็กไม่บีบอัด) ----------
const big = JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ i, name: `สินค้า ${i}` })));
const files = readZip(createZip([{ name: "manifest.json", data: '{"a":1}' }, { name: "tables/ตาราง.json", data: big }, { name: "x.bin", data: Buffer.from([1, 2, 3]) }]));
assert.equal(files.get("manifest.json")!.toString(), '{"a":1}');
assert.equal(files.get("tables/ตาราง.json")!.toString(), big);
assert.deepEqual([...files.get("x.bin")!], [1, 2, 3]);
const broken = createZip([{ name: "a.txt", data: "hello hello hello hello" }]);
broken[40] ^= 0xff; // ข้อมูลเสีย → CRC ไม่ตรง
assert.throws(() => readZip(broken));
assert.throws(() => readZip(Buffer.from("not a zip")), /ไม่ใช่ไฟล์ ZIP/);

console.log("lot12 unit: ok");
