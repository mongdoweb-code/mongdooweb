// หมวดยอดนิยมหน้าแรก (การ์ดหมวด + ลิงก์ย่อย) — ฟังก์ชันล้วน ใช้ได้ทั้งหน้าร้าน หลังบ้าน และเบราว์เซอร์
// ค่าเก็บใน ShopSetting.popularCats: { title, items: [{ cat: slug, bg: สีพื้น, links: [{ label, href }] }] }
// ค่าที่ผิดรูปแบบถูกข้ามอย่างนุ่มนวล — หน้าแรกต้องแสดงได้เสมอ

/** สีพื้นหลังรูปบนการ์ด (โทนพาสเทลเข้ากับธีมครีม/ส้มของร้าน) */
export const POPULAR_BG = {
  cream: { label: "ครีม", color: "#F2EDE3" },
  peach: { label: "พีช", color: "#F9E1D6" },
  rose: { label: "ชมพู", color: "#F6E0E3" },
  sand: { label: "ทราย", color: "#EEE4D2" },
  lemon: { label: "เหลือง", color: "#F4EFD2" },
  mint: { label: "เขียวมิ้นต์", color: "#E0EFE4" },
  sky: { label: "ฟ้า", color: "#DDE9F4" },
  lavender: { label: "ม่วงอ่อน", color: "#E7E3F4" },
} as const;
export type PopularBgKey = keyof typeof POPULAR_BG;
/** สีพื้น: ชื่อสีพาสเทลด้านบน หรือรหัสสีที่เลือกเองจากตารางสี (#RRGGBB) */
export type PopularBg = PopularBgKey | `#${string}`;
export const POPULAR_BG_KEYS = Object.keys(POPULAR_BG) as PopularBgKey[];
const HEX = /^#[0-9a-f]{6}$/i;
/** ค่าที่เก็บ → สี CSS (ค่าผิดรูปแบบ = ครีม) */
export const popularBgColor = (bg: string): string =>
  bg in POPULAR_BG ? POPULAR_BG[bg as PopularBgKey].color : HEX.test(bg) ? bg.toUpperCase() : POPULAR_BG.cream.color;

export const POPULAR_MAX_ITEMS = 12;
export const POPULAR_MAX_LINKS = 5;
export const POPULAR_DEFAULT_TITLE = "หมวดหมู่ยอดนิยม";

export type PopularLink = { label: string; href: string };
export type PopularItem = { cat: string; bg: PopularBg; links: PopularLink[] };
export type PopularConfig = { title: string; items: PopularItem[] };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** ลิงก์ที่ยอมรับ: /path ในเว็บ (ไม่ใช่ //) หรือ http(s):// */
export const safePopularHref = (h: unknown) => {
  const s = text(h, 300);
  return /^(\/(?!\/)|https?:\/\/)[^\s"'<>]*$/i.test(s) ? s : null;
};

/** ShopSetting.popularCats → ค่าที่ใช้ได้ (หมวดซ้ำ/ลิงก์ผิดถูกตัดทิ้ง) · items ว่าง = ให้ระบบเลือกอัตโนมัติ */
export function parsePopular(v: unknown): PopularConfig {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const items: PopularItem[] = [];
  for (const x of Array.isArray(o.items) ? o.items : []) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const cat = text(r.cat, 80);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cat) || seen.has(cat)) continue;
    seen.add(cat);
    const bg: PopularBg =
      typeof r.bg === "string" && r.bg in POPULAR_BG ? (r.bg as PopularBgKey)
      : typeof r.bg === "string" && HEX.test(r.bg) ? (r.bg.toUpperCase() as PopularBg)
      : POPULAR_BG_KEYS[items.length % POPULAR_BG_KEYS.length];
    const links = (Array.isArray(r.links) ? r.links : [])
      .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
      .map((l) => ({ label: text(l.label, 40), href: safePopularHref(l.href) }))
      .filter((l): l is PopularLink => !!l.label && !!l.href)
      .slice(0, POPULAR_MAX_LINKS);
    items.push({ cat, bg, links });
    if (items.length >= POPULAR_MAX_ITEMS) break;
  }
  return { title: text(o.title, 60) || POPULAR_DEFAULT_TITLE, items };
}
