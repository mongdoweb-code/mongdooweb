// ทดสอบหน่วย: คลังไอคอนหมวด (src/lib/icons.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORY_ICON_LIST, CATEGORY_ICONS, ICON_GROUPS, ICON_KEYS, iconPath } from "../../src/lib/icons";

let n = 0;
const ok = (v: unknown, msg: string) => { assert.ok(v, msg); n++; };

// ไอคอนเดิม 12 ตัวต้องยังอยู่ (ข้อมูลหมวดเก่าใช้ key เหล่านี้)
for (const k of ["water", "pool", "fountain", "uplight", "garden", "spot", "wash", "wall", "down", "strip", "stage", "deco"]) ok(ICON_KEYS.includes(k), `มีไอคอนเดิม ${k}`);
ok(CATEGORY_ICON_LIST.length >= 40, "คลังไอคอน ≥ 40");
ok(ICON_KEYS.includes("pendant") && ICON_KEYS.includes("chandelier"), "มีโคมไฟแขวน/แชนเดอเลียร์");
ok(new Set(ICON_KEYS).size === ICON_KEYS.length, "key ไม่ซ้ำ");

// ทุกไอคอนต้องผ่านตัวกรองของหน้าร้าน (public/js/shell.js normCat) — ไม่งั้นหน้าร้านจะไม่แสดง
const shell = readFileSync("public/js/shell.js", "utf8");
const m = shell.match(/iconSvg: typeof c\.iconSvg === 'string' && (\/.+?\/)\.test\(c\.iconSvg\)/);
ok(m, "พบตัวกรอง iconSvg ใน shell.js");
const re = new RegExp(m![1].slice(1, -1));
for (const i of CATEGORY_ICON_LIST) {
  ok(re.test(i.path), `ไอคอน ${i.key} ผ่านตัวกรองหน้าร้าน`);
  ok(i.label.trim().length > 1, `ไอคอน ${i.key} มีชื่อไทย`);
  ok((ICON_GROUPS as readonly string[]).includes(i.group), `ไอคอน ${i.key} อยู่ในกลุ่มที่รู้จัก`);
  ok(CATEGORY_ICONS[i.key] === i.path, `map ${i.key}`);
}
ok(iconPath("nope") === CATEGORY_ICONS.deco, "key ไม่รู้จัก → deco");
ok(iconPath(null) === CATEGORY_ICONS.deco, "ว่าง → deco");

console.log(`icons: ผ่าน ${n} ข้อ`);
