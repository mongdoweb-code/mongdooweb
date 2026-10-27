// ทดสอบหน่วยตรวจซ้ำรอบ 3: ต้นทุน ณ วันขายในรายงานกำไร (D5), ใบปะหน้า COD ทีละใบ (D2), อีเมลรับที่ร้าน (D3), ราคาตามจำนวน (D10/D11)
// รัน: npm run test:unit
import assert from "node:assert/strict";
import { DEFAULT_TEMPLATES, PICKUP_DONE_TEMPLATE, parseTemplates, renderTemplate, templateFor } from "../../src/lib/email-templates";
import { labelSetHtml, type LabelData, type LabelOpts } from "../../src/lib/doc-render";
import { unitPriceSatang } from "../../src/lib/pricing";
import { profitBy, profitTotals, type Sale } from "../../src/lib/sales-calc";

// ---------- D5: ต้นทุน ณ วันขาย ก่อนต้นทุนปัจจุบัน ----------
const sale = (lines: Sale["lines"], discountSatang = 0): Sale => ({ at: new Date(), day: "2026-10-27", month: "2026-10", channel: "WEB", ref: "X", totalSatang: 0, shippingSatang: 0, lines, discountSatang });
const line = (productId: string | null, qty: number, amountSatang: number, unitCostSatang?: number | null) =>
  ({ productId, sku: productId ?? "", name: productId ?? "อื่นๆ", categoryId: "c", categoryName: "หมวด", qty, amountSatang, unitCostSatang });
const current = new Map<string, number | null>([["A", 30000], ["B", 10000], ["C", null]]);
const rows = profitBy([sale([line("A", 2, 100000, 20000), line("B", 1, 50000), line("C", 1, 30000), line(null, 1, 5000)])], current, "product");
const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
assert.equal(byKey.A.costSatang, 40000); // ใช้ต้นทุนที่บันทึกไว้ (200) ไม่ใช่ต้นทุนปัจจุบัน (300)
assert.equal(byKey.A.profitSatang, 60000);
assert.equal(byKey.B.costSatang, 10000); // รายการเก่า (ไม่มีบันทึก) → ต้นทุนปัจจุบัน
assert.equal(byKey.C.unknownRevenueSatang, 30000); // ไม่ทราบต้นทุนทั้งสองแบบ
assert.equal(byKey["name:อื่นๆ"].unknownQty, 1); // ไม่ผูกสินค้า
// ต้นทุนบันทึกเป็น 0 (ของแถม) ≠ ไม่ทราบต้นทุน
assert.equal(profitBy([sale([line("C", 1, 1000, 0)])], current, "product")[0].profitSatang, 1000);
// งวดชำระไม่คิดต้นทุนแม้มีค่า
const inst = profitBy([sale([{ ...line(null, 1, 9000, 500), installment: true }])], current, "product")[0];
assert.equal(inst.unknownRevenueSatang, 9000);
assert.equal(profitTotals(rows).costSatang, 50000);

// ---------- D2: ใบปะหน้า COD ทีละใบ ----------
const opts: LabelOpts = { size: "A6", boxes: 1, codSatang: 9900, marks: { fragile: false, noThrow: false, upright: false }, showItems: false };
const sender = { name: "ร้าน", phone: "", address: "", logo: "" };
const L = (ref: string, codSatang?: number): LabelData => ({ ref, name: "ผู้รับ", phone: "0800000000", addr: "ที่อยู่", zip: "10100", carrier: "", items: [], ...(codSatang === undefined ? {} : { codSatang }) });
const html = labelSetHtml([L("MDW-A", 123400), L("MDW-B", 0), L("DOC-1")], opts, sender);
const sections = html.split('<section class="label">').slice(1);
assert.match(sections[0], /เก็บเงินปลายทาง ฿1,234\.00/);
assert.doesNotMatch(sections[1], /lb-cod/); // คำสั่งซื้อโอนเงิน: ไม่ใช้ยอดรวมจาก ?cod=
assert.match(sections[2], /เก็บเงินปลายทาง ฿99\.00/); // เอกสาร: ใช้ค่าจากตัวเลือก

// ---------- D3: อีเมลรับที่ร้านไม่มีเลขพัสดุ ----------
const t = parseTemplates(null);
assert.equal(templateFor(t, "SHIPPED", { shippingMethod: "pickup" }), PICKUP_DONE_TEMPLATE);
assert.equal(templateFor(t, "SHIPPED", { shippingMethod: "std" }), t.SHIPPED);
assert.equal(templateFor(t, "PAID", { shippingMethod: "pickup" }), t.PAID);
assert.ok(!PICKUP_DONE_TEMPLATE.body.includes("{tracking}") && !PICKUP_DONE_TEMPLATE.subject.includes("{tracking}"));
assert.ok(DEFAULT_TEMPLATES.SHIPPED.body.includes("{tracking}"));
assert.match(renderTemplate(PICKUP_DONE_TEMPLATE.body, { name: "สมชาย", orderNo: "MDW-1", orderUrl: "u", shop: "ร้าน" }), /คุณสมชาย[\s\S]*MDW-1 ที่ร้าน/);

// ---------- D10/D11: ราคาตามจำนวน (ราคาที่ใช้ตั้งต้นในหลังบ้าน) ----------
const tiered = { priceSatang: 50000, tierPrices: [{ minQty: 3, priceSatang: 40000 }, { minQty: 5, priceSatang: 35000 }] };
assert.equal(unitPriceSatang(tiered, 1), 50000);
assert.equal(unitPriceSatang(tiered, 3), 40000);
assert.equal(unitPriceSatang(tiered, 6), 35000);
// ราคาลด (ตั้งต้น 1 ชิ้น) + ขั้นราคาส่งที่ต่ำกว่า → ใช้ค่าต่ำสุด (ตัวแก้ไขเอกสาร/ฟอร์มคำสั่งซื้อส่ง priceSatang = ราคาลดแล้ว)
assert.equal(unitPriceSatang({ priceSatang: 45000, tierPrices: tiered.tierPrices }, 3), 40000);
assert.equal(unitPriceSatang({ priceSatang: 38000, tierPrices: tiered.tierPrices }, 3), 38000);

console.log("recheck3: ok");
