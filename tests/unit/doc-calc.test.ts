// ทดสอบหน่วย: จำนวนเงินเป็นตัวอักษรไทย, การคำนวณ VAT, เลขผู้เสียภาษี, PromptPay CRC — รัน: npm run test:unit
import assert from "node:assert/strict";
import { bahtText, calcTotals, promptPayPayload } from "../../src/lib/doc-calc";
import { isValidThaiTaxId } from "../../src/lib/format";

const cases: [number, string][] = [
  [0, "ศูนย์บาทถ้วน"], [1, "หนึ่งบาทถ้วน"], [11, "สิบเอ็ดบาทถ้วน"], [21, "ยี่สิบเอ็ดบาทถ้วน"], [101, "หนึ่งร้อยเอ็ดบาทถ้วน"],
  [1580, "หนึ่งพันห้าร้อยแปดสิบบาทถ้วน"], [1000001, "หนึ่งล้านเอ็ดบาทถ้วน"], [2250, "สองพันสองร้อยห้าสิบบาทถ้วน"], [10, "สิบบาทถ้วน"],
  [20, "ยี่สิบบาทถ้วน"], [0.5, "ห้าสิบสตางค์"], [0.01, "หนึ่งสตางค์"], [0.21, "ยี่สิบเอ็ดสตางค์"], [1.01, "หนึ่งบาทหนึ่งสตางค์"],
  [1690.6, "หนึ่งพันหกร้อยเก้าสิบบาทหกสิบสตางค์"], [11000000, "สิบเอ็ดล้านบาทถ้วน"], [21000021, "ยี่สิบเอ็ดล้านยี่สิบเอ็ดบาทถ้วน"],
  [1000000, "หนึ่งล้านบาทถ้วน"], [1000000000000, "หนึ่งล้านล้านบาทถ้วน"], [2000000000001, "สองล้านล้านเอ็ดบาทถ้วน"], [100, "หนึ่งร้อยบาทถ้วน"],
  [1001, "หนึ่งพันเอ็ดบาทถ้วน"], [120000.75, "หนึ่งแสนสองหมื่นบาทเจ็ดสิบห้าสตางค์"],
];
let n = 0;
for (const [baht, want] of cases) {
  assert.equal(bahtText(Math.round(baht * 100)), want, `bahtText(${baht})`);
  n++;
}
// VAT: 1,000 บาท แยกนอก = 1,070 · รวมใน = VAT 65.42 ก่อน VAT 934.58
const items = [{ qtyMilli: 2000, priceSatang: 50000, discountSatang: 0 }];
assert.deepEqual(calcTotals(items, 0, "NONE", 700).grand, 100000);
assert.deepEqual(calcTotals(items, 0, "EXCLUSIVE", 700).grand, 107000);
const inc = calcTotals(items, 0, "INCLUSIVE", 700);
assert.equal(inc.vat, 6542);
assert.equal(inc.beforeVat, 93458);
assert.equal(inc.grand, 100000);
// ส่วนลดท้ายบิลไม่เกินยอดรวม, จำนวนทศนิยม 2.5 เมตร × 120.00 = 300.00
assert.equal(calcTotals(items, 999999, "NONE", 700).grand, 0);
assert.equal(calcTotals([{ qtyMilli: 2500, priceSatang: 12000, discountSatang: 0 }], 0, "NONE", 700).grand, 30000);
// เลขผู้เสียภาษี
assert.ok(isValidThaiTaxId("0105536084045"));
assert.ok(!isValidThaiTaxId("0105536084041"));
// PromptPay: payload มี CRC 4 หลัก และยอดเงิน
const pp = promptPayPayload("0812345678", 15800);
assert.match(pp, /^000201010212/);
assert.match(pp, /5406158\.00/);
assert.match(pp, /6304[0-9A-F]{4}$/);
console.log(`ok — bahtText ${n} cases + VAT/taxId/PromptPay checks passed`);
