// ทดสอบหน่วยล็อต 9: ราคา (ลดตามเวลา/ขายส่ง), ตัวเลือกสินค้า, สเปก + ตัวกรอง, เครื่องคำนวณหม้อแปลง — รัน: npm run test:unit
import assert from "node:assert/strict";
import { nextPriceChange, priceAfterPercent, revalidateFor, saleInfo, unitForQty, unitPriceSatang, viewPrice } from "../../src/lib/pricing";
import { neededWatt, recommendPsu, wattOf, type PsuItem } from "../../src/lib/product-psu";
import { cleanAttrs, defsFor, formatAttr, matchSpecs, readSpecFilter, type SpecDef } from "../../src/lib/specs";
import { guessOptions, selectorRows, suggestGroups, validateGroup, type VariantGroupView } from "../../src/lib/variants";

const H = 3600e3;
const now = new Date("2026-10-25T12:00:00Z");

// ---------- ราคา ----------
const p = { priceSatang: 50000, salePriceSatang: 45000, saleStartsAt: new Date(now.getTime() - H), saleEndsAt: new Date(now.getTime() + H), tierPrices: [{ minQty: 10, priceSatang: 40000 }, { minQty: 2, priceSatang: 99999 }] };
assert.equal(unitPriceSatang(p, 1, now), 45000);
assert.equal(unitPriceSatang(p, 10, now), 40000);
assert.equal(unitPriceSatang(p, 1, new Date(now.getTime() + 2 * H)), 50000); // หมดเวลาแล้ว
assert.equal(unitPriceSatang({ ...p, priceSatang: 0 }, 10, now), 0); // สอบถามราคา
const si = saleInfo(p, now)!;
assert.deepEqual([si.p, si.r], [450, 500]);
assert.equal(saleInfo(p, new Date(now.getTime() + 2 * H)), null);
assert.equal(viewPrice({ price: 450, sale: si }, now.getTime() + 2 * H).price, 500);
assert.equal(viewPrice({ price: 450, sale: si }, now.getTime()).compareAt, 500);
assert.equal(viewPrice({ price: 500, sale: { ...si, f: now.getTime() + H } }, now.getTime()).on, false); // ยังไม่เริ่ม
assert.equal(unitForQty(450, [[10, 400]], 9), 450);
assert.equal(unitForQty(450, [[10, 400]], 10), 400);
assert.equal(nextPriceChange([p], now)?.getTime(), now.getTime() + H);
assert.equal(revalidateFor(new Date(now.getTime() + 5000), now), 300);
assert.equal(revalidateFor(null, now), 3600);
assert.equal(priceAfterPercent(99900, 15), 84900);

// ---------- ตัวเลือก ----------
const g: VariantGroupView = {
  id: "g", name: "x", optionNames: ["สี", "วัตต์"], primarySlug: "w3",
  members: [
    { slug: "w3", name: "", sku: "", inStock: true, price: 1, options: { สี: "ขาว", วัตต์: "3W" } },
    { slug: "w6", name: "", sku: "", inStock: true, price: 1, options: { สี: "ขาว", วัตต์: "6W" } },
    { slug: "r3", name: "", sku: "", inStock: false, price: 1, options: { สี: "RGB", วัตต์: "3W" } },
  ],
};
const rows = selectorRows(g, "w6");
assert.deepEqual(rows[0].values.map((v) => [v.value, v.slug, v.current, v.out]), [["ขาว", "w6", true, false], ["RGB", "r3", false, true]]);
const onRgb = selectorRows(g, "r3");
assert.deepEqual(onRgb[1].values.map((v) => [v.value, v.slug]), [["3W", "r3"], ["6W", null]]); // RGB 6W ไม่มี = ปิดปุ่ม
assert.match(validateGroup(["สี"], [{ label: "a", options: { สี: "ขาว" } }, { label: "b", options: { สี: "ขาว" } }])!, /ซ้ำ/);
assert.match(validateGroup(["สี"], [{ label: "a", options: { สี: "" } }])!, /ยังไม่ได้ใส่/);
assert.deepEqual(guessOptions("ไฟส่องต้นไม้ 12W แสงวอร์มไวท์ 3200K"), { watt: "12W", color: "วอร์มไวท์" });
assert.deepEqual(guessOptions("LED Strip (Red/Green/Blue/Warm) - สีน้ำเงิน (BLUE)"), { watt: null, color: "สีน้ำเงิน" });
const sg = suggestGroups([
  { id: "1", name: "โคมทดสอบ 3W แสงขาว", sku: "A", categoryId: "c", priceSatang: 1, isActive: true },
  { id: "2", name: "โคมทดสอบ 6W แสงขาว", sku: "B", categoryId: "c", priceSatang: 2, isActive: true },
  { id: "3", name: "โคมทดสอบ 6W แสงขาว", sku: "C", categoryId: "c", priceSatang: 3, isActive: true },
  { id: "4", name: "โคมทดสอบ 6W แสงขาว", sku: "D", categoryId: "other", priceSatang: 3, isActive: true },
]);
assert.equal(sg.length, 1);
assert.deepEqual(sg[0].optionNames, ["วัตต์"]);
assert.deepEqual(sg[0].members.map((m) => m.sku), ["A", "B"]);
assert.equal(sg[0].skipped[0].sku, "C");

// ---------- สเปก ----------
const defs: SpecDef[] = [
  { id: "1", categoryId: null, code: "ip", label: "IP", unit: null, type: "ENUM", options: ["IP67", "IP68"], filterable: true, sortOrder: 1 },
  { id: "2", categoryId: "c", code: "watt", label: "วัตต์", unit: "W", type: "NUMBER", options: [], filterable: true, sortOrder: 0 },
  { id: "3", categoryId: "c", code: "ip", label: "กันน้ำ", unit: null, type: "ENUM", options: ["IP68"], filterable: true, sortOrder: 2 },
];
assert.deepEqual(defsFor(defs, "c").map((d) => d.label), ["วัตต์", "กันน้ำ"]); // หมวดทับสเปกกลาง
assert.deepEqual(defsFor(defs, null).map((d) => d.label), ["IP"]);
assert.deepEqual(cleanAttrs(defsFor(defs, "c"), { watt: "12.5W", ip: "ip68", junk: "x" }), { attrs: { watt: 12.5, ip: "IP68" }, bad: [] });
assert.deepEqual(cleanAttrs(defsFor(defs, "c"), { watt: "abc", ip: "IP65" }).bad, ["watt", "ip"]);
assert.equal(formatAttr(defs[1], 12), "12 W");
assert.equal(formatAttr({ type: "NUMBER", unit: "°" }, 36), "36°");
const sf = readSpecFilter({ f_ip: ["IP67", "IP68"], f_watt_min: "5" }, defsFor(defs, "c"));
assert.ok(matchSpecs({ ip: "IP68", watt: 6 }, sf));
assert.ok(!matchSpecs({ ip: "IP68", watt: 3 }, sf));
assert.ok(matchSpecs({ ip: "IP68", watt: 3 }, sf, "watt"));
assert.ok(!matchSpecs({ watt: 6 }, sf));

// ---------- หม้อแปลง ----------
assert.equal(wattOf("Switching Power Supply 12V 10A 120W"), 120);
assert.equal(wattOf("LED 9x1W DC12V"), 9);
assert.equal(wattOf("หม้อแปลง DC12V"), null);
assert.equal(neededWatt([{ watt: 3, qty: 10 }, { watt: 10, qty: 5 }]), 96);
const psus: PsuItem[] = [
  { id: "a", name: "", price: 300, inStock: true, watt: 60, power: { v: "12", ac: false } },
  { id: "b", name: "", price: 200, inStock: true, watt: 100, power: { v: "12", ac: null } },
  { id: "c", name: "", price: 100, inStock: true, watt: 40, power: { v: "24", ac: true } },
  { id: "d", name: "", price: 100, inStock: false, watt: 50, power: { v: "12", ac: false } },
];
assert.deepEqual(recommendPsu(48, { v: "12", ac: false }, psus).single.map((x) => x.item.id), ["a", "b"]);
const multi = recommendPsu(250, { v: "12", ac: false }, psus);
assert.deepEqual([multi.single.length, multi.multi?.item.id, multi.multi?.qty], [0, "b", 3]);

console.log("lot9 unit tests: ok");
