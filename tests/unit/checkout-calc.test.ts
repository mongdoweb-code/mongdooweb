// ทดสอบหน่วย: ส่วนลดคูปอง (U2) และค่าส่ง/ยอดรวม (U20–U22) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { couponEnd, couponStart, discountFor, evaluateCoupon, normCouponCode, ymdOfEnd, ymdOfStart, type CouponRule } from "../../src/lib/coupon-calc";
import {
  codAllowed, freeShipFrom, isRemoteZip, orderTotal, parseRemoteZips, parseShippingTiers, parseWeightTiers, quoteShipping, tierFee, weightExtra, type ShipConfig,
} from "../../src/lib/shipping";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n++; };
const eq = <T>(a: T, b: T, msg: string) => { assert.deepEqual(a, b, msg); n++; };

// ---------- คูปอง ----------
const base: CouponRule = {
  code: "SAVE10", kind: "PERCENT", value: 1000, minOrderSatang: 0, maxDiscountSatang: null, startsAt: null, endsAt: null, categoryIds: [], isActive: true,
};
const lines = [{ categoryId: "A", lineSatang: 150000 }, { categoryId: "B", lineSatang: 50000 }];
const res = (c: Partial<CouponRule>, l = lines, now?: Date) => evaluateCoupon({ ...base, ...c }, l, now);

eq(res({}), { ok: true, discountSatang: 20000, eligibleSatang: 200000 }, "10% ของ 2,000 = 200");
eq(res({ maxDiscountSatang: 15000 }).ok && (res({ maxDiscountSatang: 15000 }) as { discountSatang: number }).discountSatang, 15000, "เพดานส่วนลด");
eq((res({ kind: "FIXED", value: 30000 }) as { discountSatang: number }).discountSatang, 30000, "ลดบาท");
eq((res({ kind: "FIXED", value: 999999 }) as { discountSatang: number }).discountSatang, 200000, "ลดบาทไม่เกินยอด");
eq((res({ categoryIds: ["B"] }) as { discountSatang: number }).discountSatang, 5000, "ลดเฉพาะหมวด B");
eq((res({ categoryIds: ["B"], kind: "FIXED", value: 80000 }) as { discountSatang: number }).discountSatang, 50000, "ลดบาทเฉพาะหมวด ไม่เกินยอดหมวด");
eq(res({ categoryIds: ["Z"] }).ok, false, "ไม่มีสินค้าหมวดที่ร่วมรายการ");
eq((res({ minOrderSatang: 200001 }) as { reason: string }).reason, "minOrder", "ยอดไม่ถึงขั้นต่ำ");
eq(res({ minOrderSatang: 200000 }).ok, true, "ยอดเท่าขั้นต่ำใช้ได้");
eq((res({ isActive: false }) as { reason: string }).reason, "inactive", "ปิดใช้งาน");
const now = new Date("2026-10-22T05:00:00Z"); // 12:00 เวลาไทย
eq((res({ startsAt: couponStart("2026-10-23") }, lines, now) as { reason: string }).reason, "notStarted", "ยังไม่เริ่ม");
eq((res({ endsAt: couponEnd("2026-10-21") }, lines, now) as { reason: string }).reason, "expired", "หมดอายุเมื่อวาน");
eq(res({ endsAt: couponEnd("2026-10-22") }, lines, new Date("2026-10-22T16:59:00Z")).ok, true, "ใช้ได้ถึง 23:59 เวลาไทยของวันสุดท้าย");
eq(res({ endsAt: couponEnd("2026-10-22") }, lines, new Date("2026-10-22T17:00:00Z")).ok, false, "หมดเมื่อขึ้นวันใหม่เวลาไทย");
eq(res({ startsAt: couponStart("2026-10-22") }, lines, new Date("2026-10-21T17:00:00Z")).ok, true, "เริ่มเที่ยงคืนเวลาไทย");
eq(ymdOfStart(couponStart("2026-10-22")), "2026-10-22", "แปลงวันเริ่มกลับ");
eq(ymdOfEnd(couponEnd("2026-10-31")), "2026-10-31", "แปลงวันสิ้นสุดกลับ");
eq(discountFor({ kind: "PERCENT", value: 333, maxDiscountSatang: null }, 9999), 332, "ปัดลงเป็นสตางค์ (3.33% ของ 99.99)");
eq(discountFor({ kind: "PERCENT", value: 20000, maxDiscountSatang: null }, 5000), 5000, "เกิน 100% = ลดเต็มยอด");
eq(normCouponCode(" save-10 "), "SAVE-10", "โค้ดตัวพิมพ์ใหญ่");
eq(normCouponCode("ab"), "", "สั้นเกิน");
eq(normCouponCode("ลด10"), "", "อักษรไทยใช้ไม่ได้");

// ---------- ค่าส่ง ----------
const tiers = parseShippingTiers([{ minSatang: 100000, feeSatang: 10000 }, { minSatang: 0, feeSatang: 6000 }, { minSatang: 2000000, feeSatang: 0 }]);
eq(tiers.map((t) => t.minSatang), [0, 100000, 2000000], "เรียงขั้นค่าส่ง");
eq(tierFee(tiers, 99999), 6000, "ต่ำกว่า 1,000 = 60");
eq(tierFee(tiers, 100000), 10000, "1,000 พอดี = 100");
eq(freeShipFrom(tiers), 2000000, "ส่งฟรีตั้งแต่ 20,000");
const wt = parseWeightTiers([{ maxGram: 10000, extraSatang: 5000 }, { maxGram: 3000, extraSatang: 0 }, { maxGram: -1, extraSatang: 1 }, { maxGram: 30000, extraSatang: 20000 }]);
eq(wt.map((t) => t.maxGram), [3000, 10000, 30000], "ขั้นน้ำหนักเรียง/ตัดค่าผิด");
eq(weightExtra(wt, 0), 0, "ไม่มีน้ำหนัก = 0");
eq(weightExtra(wt, 3000), 0, "3 กก. พอดี = ขั้นแรก");
eq(weightExtra(wt, 3001), 5000, "เกิน 3 กก.");
eq(weightExtra(wt, 50000), 20000, "หนักเกินขั้นสุดท้าย = ขั้นสุดท้าย");
eq(weightExtra([], 99999), 0, "ไม่ตั้งขั้นน้ำหนัก");
eq(parseRemoteZips("95, 96000 ,abc 1 9512"), ["95", "96000", "9512"], "รหัสไปรษณีย์ห่างไกลจากข้อความ");
ok(isRemoteZip("95120", ["95"]) && !isRemoteZip("10110", ["95"]) && !isRemoteZip("951", ["95"]), "ตรวจรหัสขึ้นต้น");

const cfg: ShipConfig = {
  tiers, expressEnabled: true, expressExtraSatang: 4000, weightTiers: wt, remoteZips: ["95", "63170"], remoteFeeSatang: 5000,
  pickupEnabled: true, codEnabled: true, codFeeSatang: 3000, codMaxSatang: 1000000,
};
const q1 = quoteShipping(cfg, { method: "std", subtotalSatang: 50000, totalGram: 12000, zip: "95120" });
eq([q1.baseSatang, q1.weightSatang, q1.remoteSatang, q1.shippingSatang, q1.remote], [6000, 20000, 5000, 31000, true], "ธรรมดา + น้ำหนัก + ห่างไกล");
const q2 = quoteShipping(cfg, { method: "express", subtotalSatang: 150000, totalGram: 500, zip: "10110" });
eq(q2.shippingSatang, 14000, "ส่งด่วน = ขั้นค่าส่ง + 40");
eq(quoteShipping({ ...cfg, expressEnabled: false }, { method: "express", subtotalSatang: 150000, totalGram: 0 }).method, "std", "ปิดส่งด่วน → ส่งธรรมดา");
const q3 = quoteShipping(cfg, { method: "pickup", subtotalSatang: 50000, totalGram: 99000, zip: "95120" });
eq([q3.method, q3.shippingSatang], ["pickup", 0], "รับที่ร้านไม่มีค่าส่ง");
eq(quoteShipping({ ...cfg, pickupEnabled: false }, { method: "pickup", subtotalSatang: 50000, totalGram: 0 }).method, "std", "ปิดรับที่ร้าน → ส่งธรรมดา");
eq(quoteShipping(cfg, { method: "std", subtotalSatang: 50000, totalGram: 0 }).remote, false, "ยังไม่รู้รหัสไปรษณีย์ = ไม่คิดห่างไกล");

// ---------- COD + ยอดรวม ----------
eq(codAllowed(cfg, "std", 500000), { ok: true, feeSatang: 3000 }, "COD ใช้ได้");
eq(codAllowed(cfg, "std", 997001).ok, false, "เกินเพดาน COD (รวมค่าธรรมเนียม)");
eq(codAllowed(cfg, "std", 997000).ok, true, "เท่าเพดานพอดีใช้ได้");
eq(codAllowed({ ...cfg, codMaxSatang: 0 }, "std", 99_999_999).ok, true, "เพดาน 0 = ไม่จำกัด");
eq(codAllowed({ ...cfg, codEnabled: false }, "std", 1000).ok, false, "ปิด COD");
eq(codAllowed(cfg, "pickup", 1000).ok, false, "รับที่ร้านไม่ใช้ COD");
eq(orderTotal({ subtotalSatang: 200000, discountSatang: 20000, shippingSatang: 31000, codFeeSatang: 3000 }), 214000, "ยอดรวม = สินค้า − ส่วนลด + ค่าส่ง + COD");
eq(orderTotal({ subtotalSatang: 1000, discountSatang: 5000, shippingSatang: 6000, codFeeSatang: 0 }), 6000, "ส่วนลดไม่ทำให้ยอดสินค้าติดลบ");

console.log(`checkout-calc: ${n} cases passed`);
