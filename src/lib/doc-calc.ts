// คำนวณเอกสารขาย (ใช้ได้ทั้ง server และเบราว์เซอร์) — ย้ายจากต้นแบบ mongdoweb-admin.html
// เงินเป็นสตางค์ (จำนวนเต็ม), จำนวนเป็น qtyMilli (×1000 รองรับ 2.5 เมตร), ปัดครึ่งขึ้นต่อรายการ

export type VatModeT = "NONE" | "EXCLUSIVE" | "INCLUSIVE";
export type DocTypeT = "QUOTATION" | "INVOICE" | "RECEIPT";
export type LineIn = { qtyMilli: number; priceSatang: number; discountSatang: number };

/** ปัดครึ่งขึ้น (ห่างจากศูนย์) */
export const rhu = (n: number) => Math.sign(n) * Math.floor(Math.abs(n) + 0.5 + 1e-9);

export function lineSatang(it: LineIn) {
  return rhu((it.qtyMilli * it.priceSatang) / 1000) - (it.discountSatang || 0);
}

export function calcTotals(items: LineIn[], discountSatang: number, vatMode: VatModeT, vatRateBp: number) {
  const subtotal = items.reduce((s, it) => s + lineSatang(it), 0);
  const discount = Math.min(Math.max(0, discountSatang || 0), Math.max(0, subtotal));
  const after = subtotal - discount;
  const rate = (vatRateBp || 700) / 100; // 700 bp = 7%
  let vat = 0, grand = after, beforeVat = after;
  if (vatMode === "EXCLUSIVE") {
    vat = rhu((after * rate) / 100);
    grand = after + vat;
  } else if (vatMode === "INCLUSIVE") {
    vat = rhu((after * rate) / (100 + rate));
    beforeVat = after - vat;
  }
  return { subtotal, discount, afterDiscount: after, beforeVat, vat, grand };
}
export type Totals = ReturnType<typeof calcTotals>;

/** 158000 → "1,580.00" */
export const money = (satang: number) =>
  (satang < 0 ? "-" : "") + (Math.abs(satang) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 2500 (milli) → "2.50" */
export const qtyFmt = (milli: number) => (milli / 1000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

// ---------- จำนวนเงินเป็นตัวอักษรไทย ----------
// กฎ "เอ็ด": เลข 1 หลักหน่วย (ของแต่ละกลุ่มล้าน) อ่าน "เอ็ด" เมื่อมีหลักที่สูงกว่าไม่เป็นศูนย์ เช่น 11, 101, 1,000,001
const TH_DIG = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const TH_POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
function thaiInt(numStr: string) {
  const s = numStr.replace(/^0+/, "");
  let out = "", seen = false;
  for (let i = 0; i < s.length; i++) {
    const d = +s[i], pos = s.length - 1 - i, p6 = pos % 6;
    if (d) {
      if (p6 === 1) out += d === 1 ? "สิบ" : d === 2 ? "ยี่สิบ" : TH_DIG[d] + "สิบ";
      else if (p6 === 0 && d === 1 && seen) out += "เอ็ด";
      else out += TH_DIG[d] + TH_POS[p6];
      seen = true;
    }
    if (p6 === 0 && pos > 0) out += "ล้าน";
  }
  return out;
}
/** สตางค์ → "หนึ่งพันห้าร้อยแปดสิบบาทถ้วน" */
export function bahtText(satang: number) {
  let s = Math.round(satang);
  const neg = s < 0;
  s = Math.abs(s);
  if (s === 0) return "ศูนย์บาทถ้วน";
  const baht = Math.floor(s / 100), st = s % 100;
  let out = baht ? thaiInt(String(baht)) + "บาท" : "";
  out += st ? thaiInt(String(st)) + "สตางค์" : "ถ้วน";
  return (neg ? "ลบ" : "") + out;
}

// ---------- วันที่ (เวลาไทย) ----------
const TZ = 7 * 3600e3;
/** Date → "YYYY-MM-DD" ตามวันที่ไทย */
export const ymdBkk = (d: Date) => new Date(d.getTime() + TZ).toISOString().slice(0, 10);
export const fromYmd = (s: string) => new Date(`${s}T00:00:00+07:00`);
export const addDaysYmd = (s: string, n: number) => ymdBkk(new Date(fromYmd(s).getTime() + n * 864e5 + 12 * 3600e3));
/** "2026-05-05" → "5/5/2026" หรือ "5/5/2569" */
export function docDate(ymd: string | null | undefined, era: "AD" | "BE") {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d}/${m}/${era === "BE" ? y + 543 : y}`;
}
export function docDateTime(at: Date, era: "AD" | "BE") {
  const x = new Date(at.getTime() + TZ).toISOString();
  return `${docDate(x.slice(0, 10), era)} ${x.slice(11, 19)}`;
}

// ---------- เลขผู้เสียภาษี / ที่อยู่ ----------
export const fmtTaxId = (t: string | null | undefined) => {
  const s = String(t ?? "").replace(/\D/g, "");
  return s.length === 13 ? `${s[0]}-${s.slice(1, 5)}-${s.slice(5, 10)}-${s.slice(10, 12)}-${s[12]}` : s;
};
export type Addr = { line?: string | null; sub?: string | null; dist?: string | null; prov?: string | null; zip?: string | null };
/** ที่อยู่ไทย: เติม ต./อ./จ. หรือ แขวง/เขต (กรุงเทพฯ) ให้อัตโนมัติ */
export function addrText(a: Addr | null | undefined, opts: { noZip?: boolean } = {}) {
  if (!a) return "";
  const bk = /กรุงเทพ/.test(a.prov ?? "");
  const has = (v: string, re: RegExp) => re.test(v);
  const sub = a.sub ? (has(a.sub, /^(ต\.|ตำบล|แขวง)/) ? a.sub : (bk ? "แขวง" : "ต.") + a.sub) : "";
  const dist = a.dist ? (has(a.dist, /^(อ\.|อำเภอ|เขต)/) ? a.dist : (bk ? "เขต" : "อ.") + a.dist) : "";
  const prov = a.prov ? (bk || has(a.prov, /^(จ\.|จังหวัด)/) ? a.prov : "จ." + a.prov) : "";
  return [a.line, sub, dist, prov, opts.noZip ? "" : a.zip].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
}

// ---------- Code128 ชุด B (บาร์โค้ดเลขที่เอกสาร) ----------
const C128 = "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112".split(" ");
export function code128Svg(text: string, cls = "bc") {
  const t = String(text ?? "").replace(/[^\x20-\x7E]/g, "?").slice(0, 40);
  if (!t) return "";
  const codes = [104, ...[...t].map((ch) => ch.charCodeAt(0) - 32)];
  codes.push(codes.reduce((s, c, i) => s + c * (i || 1), 0) % 103, 106);
  let x = 10, bars = "";
  codes.forEach((c) =>
    [...C128[c]].forEach((w, i) => {
      const n = +w;
      if (i % 2 === 0) bars += `M${x} 0h${n}v40h-${n}z`;
      x += n;
    }),
  );
  const W = x + 10;
  return `<svg class="${cls}" viewBox="0 0 ${W} 40" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="บาร์โค้ด ${t.replace(/[<>&"]/g, "")}"><rect width="${W}" height="40" fill="#fff"/><path d="${bars}" fill="#000"/></svg>`;
}

// ---------- PromptPay (EMVCo) ----------
function crc16(s: string) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
export function promptPayPayload(id: string, amountSatang?: number) {
  const f = (tag: string, v: string) => tag + String(v.length).padStart(2, "0") + v;
  const t = String(id).replace(/\D/g, "");
  const acc = t.length >= 13 ? f("02", t) : f("01", ("0000000000000" + t.replace(/^0/, "66")).slice(-13));
  const p = f("00", "01") + f("01", amountSatang ? "12" : "11") + f("29", f("00", "A000000677010111") + acc) + f("53", "764") +
    (amountSatang ? f("54", (amountSatang / 100).toFixed(2)) : "") + f("58", "TH") + "6304";
  return p + crc16(p);
}
