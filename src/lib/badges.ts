// ป้ายบนการ์ดสินค้า (หลายป้ายต่อสินค้า) — ฟังก์ชันล้วน ใช้ทั้งหลังบ้าน หน้าร้าน และเทสต์
// เก็บใน Product.badges = [{ t: ข้อความ, c: สี }] · Product.badge (เดิม) = ข้อความป้ายแรก (ให้ส่วนเก่าที่อ่าน badge ยังทำงาน)

export const BADGE_MAX = 4;
export const BADGE_TEXT_MAX = 20;
/** สีป้าย (ค่า RGB สำหรับ rgb(... / ความทึบ)) — ทุกสีอ่านตัวอักษรขาวได้ชัดที่ความทึบ ≥ 85% */
export const BADGE_COLORS = {
  orange: { label: "ส้ม", rgb: "168 60 18" },
  green: { label: "เขียว", rgb: "21 112 62" },
  blue: { label: "ฟ้า", rgb: "29 78 150" },
  dark: { label: "ดำ", rgb: "20 20 20" },
} as const;
export type BadgeColor = keyof typeof BADGE_COLORS;
export const BADGE_COLOR_KEYS = Object.keys(BADGE_COLORS) as BadgeColor[];
export type Badge = { t: string; c: BadgeColor };

/** ป้ายที่ใช้บ่อย (ปุ่มเพิ่มเร็วในหลังบ้าน) */
export const BADGE_SUGGEST = ["ขายดี", "ใหม่", "แนะนำ", "กันน้ำ IP68", "12V", "24V", "RGB", "ประกัน 1 ปี"];

/** แบบจัดวางบนการ์ด: 1 เรียงลงแนวตั้ง · 2 เรียงแนวนอน · 3 แยกมุม (ป้ายแรกซ้ายบน ที่เหลือขวาบน) */
export const BADGE_LAYOUTS = {
  "1": { label: "เรียงลงแนวตั้ง", hint: "มุมซ้ายบน ป้ายละบรรทัด อ่านง่าย" },
  "2": { label: "เรียงแนวนอน", hint: "ต่อกันในแถว เต็มแล้วขึ้นบรรทัดใหม่ บังรูปน้อย" },
  "3": { label: "แยกมุม", hint: "ป้ายแรกซ้ายบน · ป้ายที่เหลือเรียงลงมุมขวาบน" },
} as const;
export type BadgeLayout = keyof typeof BADGE_LAYOUTS;
export const isBadgeLayout = (v: unknown): v is BadgeLayout => typeof v === "string" && v in BADGE_LAYOUTS;

/** ความทึบของพื้นป้าย (%) — ต่ำกว่า 85 ตัวอักษรอาจอ่านยากบนรูปพื้นขาว */
export const BADGE_OPACITY_MIN = 70;
export const BADGE_OPACITY_MAX = 100;
export const BADGE_OPACITY_DEFAULT = 85;
export const cleanOpacity = (v: unknown) => {
  const n = Math.round(Number(v) / 5) * 5;
  return Number.isFinite(n) ? Math.min(BADGE_OPACITY_MAX, Math.max(BADGE_OPACITY_MIN, n)) : BADGE_OPACITY_DEFAULT;
};

const text = (v: unknown) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, BADGE_TEXT_MAX) : "");

/** ค่าจากฐานข้อมูล/ฟอร์ม → รายการป้ายที่ถูกต้อง (ตัดว่าง ตัดซ้ำ สีไม่รู้จัก = ส้ม สูงสุด 4) */
export function parseBadges(raw: unknown): Badge[] {
  const arr = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
  if (!Array.isArray(arr)) return [];
  const out: Badge[] = [];
  for (const x of arr) {
    const t = text(typeof x === "string" ? x : x?.t);
    if (!t || out.some((b) => b.t.toLowerCase() === t.toLowerCase())) continue;
    const c = typeof x === "object" && x && BADGE_COLOR_KEYS.includes(x.c) ? (x.c as BadgeColor) : "orange";
    out.push({ t, c });
    if (out.length >= BADGE_MAX) break;
  }
  return out;
}

/** ป้ายของสินค้า: รายการใหม่ ถ้าว่างใช้ช่องเดิม (ป้ายเดียว สีส้ม) */
export const badgesOf = (p: { badges?: unknown; badge?: string | null }): Badge[] => {
  const list = parseBadges(p.badges);
  return list.length ? list : p.badge ? parseBadges([{ t: p.badge, c: "orange" }]) : [];
};
