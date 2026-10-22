// ค่าจัดส่งและยอดรวมคำสั่งซื้อ (U20/U21/U22) — ฟังก์ชันล้วน ใช้ได้ทั้ง server และเทสต์หน่วย (เงินเป็นสตางค์)
// ค่าส่ง = ค่าส่งตามยอดสินค้า (ขั้นค่าส่ง) [+ ส่งด่วน] + ค่าส่งตามน้ำหนักรวม + ค่าส่งพื้นที่ห่างไกล (ตามรหัสไปรษณีย์)
// รับที่ร้าน = ไม่มีค่าส่ง · เก็บเงินปลายทาง (COD) = ค่าธรรมเนียมแยก + ยอดสูงสุดที่รับ COD
// ยอดชำระ = ยอดสินค้า − ส่วนลดคูปอง + ค่าส่ง + ค่าธรรมเนียม COD

export type ShippingTier = { minSatang: number; feeSatang: number };
export type WeightTier = { maxGram: number; extraSatang: number };
export type ShipMethod = "std" | "express" | "pickup";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** ขั้นค่าส่งเรียงตามยอดขั้นต่ำ ขั้นแรกเริ่มที่ 0 เสมอ */
export function parseShippingTiers(v: unknown): ShippingTier[] {
  const list = Array.isArray(v)
    ? v
        .filter(isObj)
        .map((t) => ({ minSatang: Math.max(0, Math.round(Number(t.minSatang))), feeSatang: Math.max(0, Math.round(Number(t.feeSatang))) }))
        .filter((t) => Number.isFinite(t.minSatang) && Number.isFinite(t.feeSatang))
    : [];
  list.sort((a, b) => a.minSatang - b.minSatang);
  const uniq = list.filter((t, i) => i === 0 || t.minSatang !== list[i - 1].minSatang);
  if (!uniq.length || uniq[0].minSatang !== 0) uniq.unshift({ minSatang: 0, feeSatang: uniq[0]?.feeSatang ?? 0 });
  return uniq;
}

/** ค่าส่งตามยอดสินค้า (สตางค์) */
export function tierFee(tiers: ShippingTier[], subtotalSatang: number) {
  let fee = tiers[0]?.feeSatang ?? 0;
  for (const t of tiers) if (subtotalSatang >= t.minSatang) fee = t.feeSatang;
  return fee;
}

/** ยอดขั้นต่ำที่ได้ส่งฟรี (ขั้นแรกที่ค่าส่ง 0 และสูงกว่า 0) — null = ไม่มีส่งฟรี */
export function freeShipFrom(tiers: ShippingTier[]) {
  return tiers.find((t) => t.feeSatang === 0 && t.minSatang > 0)?.minSatang ?? null;
}

/** ขั้นค่าส่งตามน้ำหนัก เรียง maxGram น้อยไปมาก (ไม่ซ้ำ) — ว่าง = ไม่คิดตามน้ำหนัก */
export function parseWeightTiers(v: unknown): WeightTier[] {
  const list = Array.isArray(v)
    ? v
        .filter(isObj)
        .map((t) => ({ maxGram: Math.round(Number(t.maxGram)), extraSatang: Math.round(Number(t.extraSatang)) }))
        .filter((t) => Number.isFinite(t.maxGram) && t.maxGram > 0 && Number.isFinite(t.extraSatang) && t.extraSatang >= 0)
    : [];
  list.sort((a, b) => a.maxGram - b.maxGram);
  return list.filter((t, i) => i === 0 || t.maxGram !== list[i - 1].maxGram);
}

/** ค่าส่งเพิ่มตามน้ำหนักรวม: ขั้นแรกที่ น้ำหนัก ≤ maxGram · หนักเกินขั้นสุดท้าย = ใช้ขั้นสุดท้าย */
export function weightExtra(tiers: WeightTier[], totalGram: number) {
  if (!tiers.length || totalGram <= 0) return 0;
  return (tiers.find((t) => totalGram <= t.maxGram) ?? tiers[tiers.length - 1]).extraSatang;
}

/** รหัสไปรษณีย์พื้นที่ห่างไกล: ตัวเลข 2–5 หลัก (ขึ้นต้น) — ตัดค่าที่ผิดรูปแบบและซ้ำ */
export function parseRemoteZips(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,;]+/) : [];
  return [...new Set(raw.map((x) => String(x ?? "").trim()).filter((x) => /^\d{2,5}$/.test(x)))].slice(0, 2000);
}

export const isRemoteZip = (zip: string, prefixes: string[]) => /^\d{5}$/.test(zip) && prefixes.some((p) => zip.startsWith(p));

export type ShipConfig = {
  tiers: ShippingTier[];
  expressEnabled: boolean;
  expressExtraSatang: number;
  weightTiers: WeightTier[];
  remoteZips: string[];
  remoteFeeSatang: number;
  pickupEnabled: boolean;
  codEnabled: boolean;
  codFeeSatang: number;
  codMaxSatang: number;
};

export type ShipQuote = {
  method: ShipMethod;
  baseSatang: number; // ค่าส่งตามยอด (+ ส่งด่วน)
  weightSatang: number; // ค่าส่งตามน้ำหนัก
  remoteSatang: number; // ค่าส่งพื้นที่ห่างไกล
  shippingSatang: number; // รวมทั้งหมด (เก็บใน Order.shippingSatang)
  totalGram: number;
  remote: boolean;
};

/** ค่าส่งของคำสั่งซื้อ (สตางค์) — รับที่ร้าน = 0 · พื้นที่ห่างไกลคิดเมื่อรู้รหัสไปรษณีย์แล้วเท่านั้น */
export function quoteShipping(cfg: ShipConfig, input: { method: ShipMethod; subtotalSatang: number; totalGram: number; zip?: string }): ShipQuote {
  const method: ShipMethod = input.method === "pickup" && cfg.pickupEnabled ? "pickup" : input.method === "express" && cfg.expressEnabled ? "express" : "std";
  if (method === "pickup") return { method, baseSatang: 0, weightSatang: 0, remoteSatang: 0, shippingSatang: 0, totalGram: input.totalGram, remote: false };
  const baseSatang = tierFee(cfg.tiers, input.subtotalSatang) + (method === "express" ? cfg.expressExtraSatang : 0);
  const weightSatang = weightExtra(cfg.weightTiers, input.totalGram);
  const remote = !!input.zip && cfg.remoteFeeSatang > 0 && isRemoteZip(input.zip, cfg.remoteZips);
  const remoteSatang = remote ? cfg.remoteFeeSatang : 0;
  return { method, baseSatang, weightSatang, remoteSatang, shippingSatang: baseSatang + weightSatang + remoteSatang, totalGram: input.totalGram, remote };
}

/** เก็บเงินปลายทางใช้ได้หรือไม่ (ยอดรวมที่ลูกค้าต้องจ่ายปลายทาง รวมค่าธรรมเนียมแล้ว ต้องไม่เกินเพดาน) */
export function codAllowed(cfg: Pick<ShipConfig, "codEnabled" | "codFeeSatang" | "codMaxSatang">, method: ShipMethod, totalBeforeFeeSatang: number) {
  if (!cfg.codEnabled) return { ok: false as const, message: "ร้านยังไม่เปิดเก็บเงินปลายทาง" };
  if (method === "pickup") return { ok: false as const, message: "รับสินค้าที่ร้านไม่ต้องใช้เก็บเงินปลายทาง — เลือกโอนเงิน/พร้อมเพย์" };
  const total = totalBeforeFeeSatang + cfg.codFeeSatang;
  if (cfg.codMaxSatang > 0 && total > cfg.codMaxSatang)
    return { ok: false as const, message: `เก็บเงินปลายทางได้ไม่เกิน ฿${(cfg.codMaxSatang / 100).toLocaleString("th-TH")} ต่อคำสั่งซื้อ กรุณาเลือกโอนเงิน` };
  return { ok: true as const, feeSatang: cfg.codFeeSatang };
}

/** ยอดรวมคำสั่งซื้อ */
export const orderTotal = (p: { subtotalSatang: number; discountSatang: number; shippingSatang: number; codFeeSatang: number }) =>
  Math.max(0, p.subtotalSatang - p.discountSatang) + p.shippingSatang + p.codFeeSatang;
