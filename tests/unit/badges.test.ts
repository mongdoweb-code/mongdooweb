// ป้ายหลายป้ายบนการ์ดสินค้า (src/lib/badges.ts)
import assert from "node:assert/strict";
import { badgesOf, cleanOpacity, parseBadges } from "../../src/lib/badges";

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };
eq(parseBadges([{ t: " 3000K ", c: "orange" }, { t: "12-24V", c: "blue" }]), [{ t: "3000K", c: "orange" }, { t: "12-24V", c: "blue" }], "ปกติ");
eq(parseBadges('[{"t":"a","c":"pink"},{"t":"A"},{"t":""},"ขายดี"]'), [{ t: "a", c: "orange" }, { t: "ขายดี", c: "orange" }], "สีไม่รู้จัก = ส้ม · ตัดซ้ำ/ว่าง · ข้อความล้วนได้");
eq(parseBadges([1, 2, 3, 4, 5, 6].map((i) => ({ t: `b${i}` }))).length, 4, "สูงสุด 4");
eq(parseBadges([{ t: "x".repeat(30) }])[0].t.length, 20, "ยาวสุด 20");
eq(parseBadges("{bad"), [], "JSON เสีย");
eq(badgesOf({ badges: [], badge: "ขายดี" }), [{ t: "ขายดี", c: "orange" }], "ช่องเดิม");
eq(badgesOf({ badges: [{ t: "ใหม่", c: "green" }], badge: "ขายดี" }), [{ t: "ใหม่", c: "green" }], "รายการใหม่ก่อน");
eq([cleanOpacity(62), cleanOpacity(87), cleanOpacity(140), cleanOpacity("x")], [70, 85, 100, 85], "ความทึบ 70–100 ทีละ 5");
console.log(`badges: ผ่าน ${n} ข้อ`);
