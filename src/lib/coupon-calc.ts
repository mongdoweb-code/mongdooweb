// คิดส่วนลดคูปอง (U2/A2) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล ใช้ได้ทั้ง server และเทสต์หน่วย
// เงินเป็นสตางค์ · PERCENT เก็บเป็น basis point (1000 = 10%) · FIXED เก็บเป็นสตางค์
// กติกา: เปิดใช้อยู่ · อยู่ในช่วงวัน (เวลาไทย) · ยอดสินค้ารวมถึงขั้นต่ำ · ลดเฉพาะรายการในหมวดที่กำหนด (ว่าง = ทุกหมวด)
//        PERCENT มีเพดาน maxDiscount ได้ · ส่วนลดไม่เกินยอดของรายการที่ร่วมรายการ
// จำนวนครั้งรวม/ต่อเบอร์ ตรวจใน transaction ที่ src/lib/coupons.ts (ต้องนับจากฐานข้อมูล)

export type CouponRule = {
  code: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  minOrderSatang: number;
  maxDiscountSatang: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  categoryIds: string[];
  isActive: boolean;
};

export type CouponLine = { categoryId: string; lineSatang: number };

export type CouponResult =
  | { ok: true; discountSatang: number; eligibleSatang: number }
  | { ok: false; reason: CouponReason; message: string };

export type CouponReason = "inactive" | "notStarted" | "expired" | "minOrder" | "noEligible" | "used" | "phoneUsed" | "notFound" | "format";

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** ข้อความภาษาไทยของแต่ละเหตุผล (ลูกค้าเห็นใต้ช่องคูปอง) */
export function couponMessage(reason: CouponReason, c?: Pick<CouponRule, "minOrderSatang">) {
  switch (reason) {
    case "inactive":
    case "notFound":
      return "ไม่พบโค้ดส่วนลดนี้ หรือปิดใช้งานแล้ว";
    case "notStarted":
      return "โค้ดส่วนลดนี้ยังไม่เริ่มใช้";
    case "expired":
      return "โค้ดส่วนลดนี้หมดอายุแล้ว";
    case "minOrder":
      return `ใช้โค้ดนี้ได้เมื่อยอดสินค้าตั้งแต่ ฿${baht(c?.minOrderSatang ?? 0)} ขึ้นไป`;
    case "noEligible":
      return "โค้ดนี้ใช้ได้เฉพาะสินค้าบางหมวด และไม่มีสินค้าหมวดนั้นในตะกร้า";
    case "used":
      return "โค้ดส่วนลดนี้ถูกใช้ครบจำนวนแล้ว";
    case "phoneUsed":
      return "เบอร์โทรนี้ใช้โค้ดส่วนลดนี้ครบจำนวนแล้ว";
    default:
      return "รูปแบบโค้ดส่วนลดไม่ถูกต้อง";
  }
}

/** โค้ดคูปอง: ตัวพิมพ์ใหญ่ A–Z 0–9 และ - ยาว 3–30 ตัว — คืน "" ถ้าไม่ถูกรูปแบบ */
export function normCouponCode(v: unknown) {
  const s = typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
  return /^[A-Z0-9][A-Z0-9-]{2,29}$/.test(s) ? s : "";
}

/** ส่วนลด (สตางค์) จากยอดที่ร่วมรายการ — ปัดลงเป็นสตางค์ (ไม่ลดเกินที่ประกาศ) */
export function discountFor(c: Pick<CouponRule, "kind" | "value" | "maxDiscountSatang">, eligibleSatang: number) {
  if (eligibleSatang <= 0 || c.value <= 0) return 0;
  let d = c.kind === "PERCENT" ? Math.floor((eligibleSatang * Math.min(c.value, 10000)) / 10000) : c.value;
  if (c.kind === "PERCENT" && c.maxDiscountSatang != null && c.maxDiscountSatang > 0) d = Math.min(d, c.maxDiscountSatang);
  return Math.max(0, Math.min(d, eligibleSatang));
}

/** ตรวจคูปองกับตะกร้า (ไม่รวมการนับจำนวนครั้ง) */
export function evaluateCoupon(c: CouponRule, lines: CouponLine[], now: Date = new Date()): CouponResult {
  const fail = (reason: CouponReason): CouponResult => ({ ok: false, reason, message: couponMessage(reason, c) });
  if (!c.isActive) return fail("inactive");
  if (c.startsAt && now < c.startsAt) return fail("notStarted");
  if (c.endsAt && now >= c.endsAt) return fail("expired");
  const subtotal = lines.reduce((s, l) => s + l.lineSatang, 0);
  if (subtotal < c.minOrderSatang) return fail("minOrder");
  const scope = new Set(c.categoryIds);
  const eligibleSatang = lines.filter((l) => !scope.size || scope.has(l.categoryId)).reduce((s, l) => s + l.lineSatang, 0);
  if (eligibleSatang <= 0) return fail("noEligible");
  const discountSatang = discountFor(c, eligibleSatang);
  if (discountSatang <= 0) return fail("noEligible");
  return { ok: true, discountSatang, eligibleSatang };
}

/** วันที่จากฟอร์มหลังบ้าน (YYYY-MM-DD เวลาไทย) → เริ่ม 00:00 ของวันนั้น / สิ้นสุด = 00:00 ของวันถัดไป (ใช้ได้ถึงสิ้นวัน) */
export const couponStart = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(`${ymd}T00:00:00+07:00`) : null);
export const couponEnd = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(new Date(`${ymd}T00:00:00+07:00`).getTime() + 864e5) : null);
/** กลับเป็น YYYY-MM-DD สำหรับแสดงในฟอร์ม (endsAt เก็บเป็นวันถัดไป → ลบ 1 วัน) */
export const ymdOfStart = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10) : "");
export const ymdOfEnd = (d: Date | null) => (d ? new Date(d.getTime() - 864e5 + 7 * 3600e3).toISOString().slice(0, 10) : "");

/** คำอธิบายสั้นของคูปอง เช่น "ลด 10% (สูงสุด ฿200)" */
export function couponLabel(c: Pick<CouponRule, "kind" | "value" | "maxDiscountSatang" | "minOrderSatang">) {
  const main = c.kind === "PERCENT" ? `ลด ${(c.value / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}%` : `ลด ฿${baht(c.value)}`;
  const cap = c.kind === "PERCENT" && c.maxDiscountSatang ? ` (สูงสุด ฿${baht(c.maxDiscountSatang)})` : "";
  const min = c.minOrderSatang > 0 ? ` · ขั้นต่ำ ฿${baht(c.minOrderSatang)}` : "";
  return main + cap + min;
}
