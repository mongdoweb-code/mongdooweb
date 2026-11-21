// ทดสอบหน่วย: แถบเมนูด่วน (src/lib/quick-menu.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { QUICK_DEFAULT, QUICK_ITEMS, QUICK_MAX, availableQuickItems, parseQuickMenu } from "../../src/lib/quick-menu";
import { ADMIN_MENU, menuFor } from "../../src/lib/admin-menu";
import { ICON } from "../../src/app/admin/_components/admin-icons";

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

// ทุกเมนูซ้ายเลือกในเมนูด่วนได้ (สร้างจากรายการเดียวกัน → เมนูใหม่มีให้เลือกเอง)
eq(ADMIN_MENU.every((m) => QUICK_ITEMS.some((q) => q.key === m.key && q.href === m.href && q.label === m.label && !!q.ownerOnly === !!m.ownerOnly)), true, "ทุกเมนูซ้ายอยู่ในเมนูด่วน");
eq(QUICK_ITEMS.length, ADMIN_MENU.length + 6, "เมนูด่วน = ปุ่มสร้างใหม่ 6 + เมนูซ้ายทั้งหมด");
eq(new Set(ADMIN_MENU.map((m) => m.href)).size, ADMIN_MENU.length, "ลิงก์เมนูซ้ายไม่ซ้ำ");
eq(ADMIN_MENU.every((m) => m.icon in ICON) && QUICK_ITEMS.every((q) => q.icon in ICON), true, "ไอคอนมีอยู่จริง");
// คีย์ที่ผู้ใช้เคยบันทึกไว้ก่อนรวมรายการยังใช้ได้
const OLD = ["qt-new", "iv-new", "product-new", "order-new", "customer-new", "po-new", "products", "categories", "stock", "stock-count", "po", "orders", "quotes", "invoices", "receipts", "customers", "inquiries", "tasks", "dashboard", "reports", "daily", "receivables", "settings", "shop"];
eq(OLD.every((k) => QUICK_ITEMS.some((q) => q.key === k)), true, "คีย์เดิมยังอยู่ครบ");
// กลุ่มของเมนูซ้ายต้องอยู่ติดกัน (หัวข้อกลุ่มไม่ซ้ำ)
const seq = ADMIN_MENU.map((m) => m.group).filter((g, i, a) => g !== a[i - 1]);
eq(new Set(seq).size, seq.length, "กลุ่มเมนูซ้ายอยู่ติดกัน");
eq(menuFor(false).some((m) => m.ownerOnly), false, "พนักงานไม่เห็นเมนูเจ้าของร้าน");
eq(parseQuickMenu(["expenses", "product-order", "wht"], false), ["expenses", "product-order", "wht"], "เลือกเมนูซ้ายใหม่ ๆ ได้");
eq(parseQuickMenu(["users", "line"], false), [], "พนักงานเลือกเมนูเจ้าของร้านไม่ได้");

console.log(`quick-menu: ผ่าน ${n} ข้อ`);
