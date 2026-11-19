// ทดสอบหน่วย: ภาษีหัก ณ ที่จ่าย (src/lib/wht.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { WHT_RATE_SET, whtAmount, whtBase, whtError, whtLine } from "../../src/lib/wht";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n++; };
const money = (s: number) => (s / 100).toFixed(2);

// ฐานภาษี = ยอดก่อน VAT ตามสัดส่วน
eq(whtBase(1_000_000, { grandSatang: 1_000_000, vatSatang: 0 }), 1_000_000, "ไม่มี VAT: ฐาน = ยอดชำระ");
eq(whtBase(1_070_000, { grandSatang: 1_070_000, vatSatang: 70_000 }), 1_000_000, "VAT 7%: ฐาน = ก่อน VAT");
eq(whtBase(535_000, { grandSatang: 1_070_000, vatSatang: 70_000 }), 500_000, "ชำระครึ่งหนึ่ง: ฐานครึ่งหนึ่ง");
eq(whtBase(0, { grandSatang: 1_000, vatSatang: 0 }), 0, "ยอด 0");
eq(whtBase(100, { grandSatang: 0, vatSatang: 0 }), 0, "ใบแจ้งหนี้ 0 บาท");
// ภาษีที่หัก
eq(whtAmount(1_000_000, 300), 30_000, "3% ของ 10,000 = 300");
eq(whtAmount(600_000, 300), 18_000, "3% ของ 6,000 = 180");
eq(whtAmount(333_333, 300), 10_000, "ปัดสตางค์");
eq(whtAmount(1_000_000, 100), 10_000, "1%");
eq([...WHT_RATE_SET].sort(), [100, 200, 300, 500], "อัตราที่รองรับ");
// ตรวจค่า
eq(whtError(600_000, 0, 0), null, "ไม่หัก = ถูกต้อง");
eq(whtError(600_000, 300, 18_000), null, "หัก 3% ถูกต้อง");
eq(whtError(600_000, 700, 18_000), "เลือกอัตราภาษีหัก ณ ที่จ่าย", "อัตราไม่รองรับ");
eq(whtError(600_000, 300, 0), "กรุณาใส่ยอดภาษีที่ลูกค้าหักไว้", "ติ๊กหักแต่ยอด 0");
eq(whtError(600_000, 300, -5), "กรุณาใส่ยอดภาษีที่ลูกค้าหักไว้", "ยอดติดลบ");
eq(whtError(100_000, 300, 50_000)?.includes("สูงเกินไป"), true, "เกิน 15% = ผิด");
eq(whtError(100_000, 500, 15_000), null, "15% พอดี = ได้");
// ข้อความ
eq(whtLine({ rateBp: 300, satang: 18_000, certNo: "A-1" }, 600_000, money), "หักภาษี ณ ที่จ่าย 3% 180.00 บาท (หนังสือรับรองเลขที่ A-1) · รับเงินสุทธิ 5820.00 บาท", "ข้อความ");

console.log(`wht: ${n} ข้อผ่าน`);
