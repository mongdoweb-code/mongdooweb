// หน้าแรก: ลำดับส่วนต่างๆ (A30) + ส่วนความน่าเชื่อถือ (U30) + เวลาทำการแบบมีโครงสร้าง (U27)
// ค่าทั้งหมดเก็บใน ShopSetting (homeSections / trust / openingHours) แก้ที่ /admin/home
// ค่าที่ผิดรูปแบบถูกข้ามอย่างนุ่มนวล — หน้าแรกต้องแสดงได้เสมอ

/** ลิงก์จากหลังบ้าน: เฉพาะ /path (ไม่ใช่ //), https://, http:// (ชุดเดียวกับ shop-public.safeHref — แยกไว้ไม่ให้ import วนกัน) */
const safeHref = (h: string | null | undefined) => {
  const s = (h ?? "").trim();
  return /^(\/(?!\/)|https?:\/\/)[^\s"'<>]*$/i.test(s) ? s : null;
};

export const HOME_SECTIONS = {
  slides: "สไลด์ภาพหลัก (บนสุด)",
  highlights: "แถบจุดเด่น (ส่งไว รับประกัน กันน้ำ)",
  categories: "หมวดหมู่สินค้า",
  finder: "ตัวช่วยเลือกไฟ",
  bestsellers: "สินค้าขายดี",
  trust: "ความน่าเชื่อถือ (คะแนนรีวิว โลโก้ลูกค้า ตัวเลข)",
  projects: "ผลงานติดตั้ง",
  why: "ทำไมต้องมองดูเว็บ",
  how: "วิธีสั่งซื้อ",
  posts: "บทความล่าสุด",
  cta: "ปรึกษาทาง LINE / ขอใบเสนอราคา",
} as const;
export type HomeSectionKey = keyof typeof HOME_SECTIONS;
export const HOME_KEYS = Object.keys(HOME_SECTIONS) as HomeSectionKey[];
const isKey = (k: unknown): k is HomeSectionKey => typeof k === "string" && k in HOME_SECTIONS;

export type HomeSection = { key: HomeSectionKey; show: boolean };

/**
 * ShopSetting.homeSections → ลำดับ + แสดง/ซ่อน (รับได้ทั้ง ["slides", …] และ [{ key, show }])
 * ส่วนที่ไม่มีในค่าที่บันทึก (เพิ่มใหม่ภายหลัง) ต่อท้ายและแสดง · สไลด์ซ่อนไม่ได้ (หน้าแรกต้องมีหัวข้อหลัก)
 */
export function parseHomeSections(v: unknown): HomeSection[] {
  const out: HomeSection[] = [];
  const seen = new Set<string>();
  if (Array.isArray(v)) {
    for (const x of v) {
      const key = typeof x === "string" ? x : x && typeof x === "object" ? (x as { key?: unknown }).key : null;
      if (!isKey(key) || seen.has(key)) continue;
      seen.add(key);
      const show = typeof x === "object" && x && "show" in x ? (x as { show?: unknown }).show !== false : true;
      out.push({ key, show: key === "slides" ? true : show });
    }
  }
  for (const key of HOME_KEYS) if (!seen.has(key)) out.push({ key, show: true });
  return out;
}

export type TrustLogo = { name: string; key: string; href: string | null };
export type TrustStat = { value: string; label: string };
export type Trust = { title: string; logos: TrustLogo[]; stats: TrustStat[]; showRating: boolean };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** ShopSetting.trust → { title, logos: [{ name, key, href }], stats: [{ value, label }], showRating } */
export function parseTrust(v: unknown): Trust {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const logos = (Array.isArray(o.logos) ? o.logos : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ name: text(x.name, 80), key: text(x.key, 200), href: safeHref(text(x.href, 300)) }))
    .filter((x) => /^trust\/[a-z0-9/_-]+\.webp$/i.test(x.key))
    .slice(0, 24);
  const stats = (Array.isArray(o.stats) ? o.stats : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ value: text(x.value, 20), label: text(x.label, 60) }))
    .filter((x) => x.value && x.label)
    .slice(0, 6);
  return { title: text(o.title, 80) || "ลูกค้าไว้วางใจมองดูเว็บ", logos, stats, showRating: o.showRating !== false };
}

export const DAY_NAMES = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export type OpeningHour = { day: number; open: string; close: string };
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ShopSetting.openingHours → [{ day: 0–6 (อาทิตย์ = 0), open: "09:00", close: "17:00" }] เรียงตามวัน (วันละหลายช่วงได้) */
export function parseOpeningHours(v: unknown): OpeningHour[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ day: Number(x.day), open: String(x.open ?? ""), close: String(x.close ?? "") }))
    .filter((x) => Number.isInteger(x.day) && x.day >= 0 && x.day <= 6 && HM.test(x.open) && (HM.test(x.close) || x.close === "24:00") && x.open < x.close)
    .sort((a, b) => a.day - b.day || a.open.localeCompare(b.open))
    .slice(0, 28);
}

/** ข้อความสรุปเวลาทำการ เช่น "จันทร์–ศุกร์ 09:00–18:00 · เสาร์ 09:00–12:00" (วันติดกันที่เวลาเหมือนกันรวมเป็นช่วง) */
export function hoursSummary(hours: OpeningHour[]) {
  const byDay = new Map<number, string>();
  for (const h of hours) byDay.set(h.day, [byDay.get(h.day), `${h.open}–${h.close}`].filter(Boolean).join(", "));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const parts: string[] = [];
  let i = 0;
  while (i < order.length) {
    const t = byDay.get(order[i]);
    if (!t) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < order.length && byDay.get(order[j + 1]) === t) j++;
    parts.push(`${DAY_NAMES[order[i]]}${j > i ? `–${DAY_NAMES[order[j]]}` : ""} ${t}`);
    i = j + 1;
  }
  return parts.join(" · ");
}
