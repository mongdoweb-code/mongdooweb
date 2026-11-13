// ทดสอบหน่วย: แถบเมนูด่วน (src/lib/quick-menu.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { QUICK_DEFAULT, QUICK_ITEMS, QUICK_MAX, availableQuickItems, parseQuickMenu } from "../../src/lib/quick-menu";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n++; };

eq(parseQuickMenu(null, true), QUICK_DEFAULT, "ยังไม่เคยตั้ง = ค่าเริ่มต้น");
eq(parseQuickMenu(undefined, false), QUICK_DEFAULT, "ค่าเริ่มต้นไม่มีเมนูเฉพาะเจ้าของร้าน (พนักงานเห็นครบ)");
eq(parseQuickMenu("x", true), QUICK_DEFAULT, "ค่าเสีย = ค่าเริ่มต้น");
eq(parseQuickMenu([], true), [], "เลือกว่าง = ซ่อนทุกเมนู (เหลือปุ่มตั้งค่า)");
eq(parseQuickMenu(["stock", "qt-new", "stock", "nope", 5], true), ["stock", "qt-new"], "ตัดซ้ำ/ไม่รู้จัก/ไม่ใช่ข้อความ และคงลำดับ");
eq(parseQuickMenu(["settings", "po-new", "products"], false), ["products"], "พนักงาน: ตัดเมนูเฉพาะเจ้าของร้าน");
eq(parseQuickMenu(["settings", "po-new", "products"], true), ["settings", "po-new", "products"], "เจ้าของร้าน: ใช้ได้ครบ");
eq(parseQuickMenu(QUICK_ITEMS.map((i) => i.key), true).length, QUICK_MAX, `สูงสุด ${QUICK_MAX} เมนู`);
eq(availableQuickItems(false).some((i) => i.ownerOnly), false, "รายการให้เลือกของพนักงานไม่มีเมนูเจ้าของร้าน");
eq(new Set(QUICK_ITEMS.map((i) => i.key)).size, QUICK_ITEMS.length, "คีย์ไม่ซ้ำ");
eq(QUICK_ITEMS.every((i) => i.href.startsWith("/")), true, "ลิงก์ภายในเว็บทั้งหมด");
eq(QUICK_DEFAULT.every((k) => QUICK_ITEMS.some((i) => i.key === k && !i.ownerOnly)), true, "ค่าเริ่มต้นมีอยู่จริงและพนักงานใช้ได้");

console.log(`quick-menu: ผ่าน ${n} ข้อ`);
