// รูปภาพประกอบใต้ Data Sheet ของหน้าสินค้า — ตั้งจากหน้าแก้ไขสินค้า (Product.gallery)
// ฟังก์ชันล้วน (ใช้ทั้ง server, หน้าร้าน และตัวอย่างในหลังบ้าน): ตรวจค่า · แบ่งรูปเป็นบล็อกตามรูปแบบ · รูปทรงตัด (clip-path) ของแบบแบ่งเส้น
// รูปต้องเป็นไฟล์ที่อัปโหลดเข้าร้าน (products/…webp) เท่านั้น · ข้อความถูก escape ตอนแสดงผล (React)

export type GalleryLayoutKind = "grid" | "slider" | "masonry" | "collage" | "split" | "shape";
export type GalleryLayout = { key: string; label: string; group: "basic" | "collage" | "split" | "shape"; kind: GalleryLayoutKind; slots: number; cols?: number; square?: boolean; cycle?: boolean };

/** รูปแบบการจัดวาง · slots = จำนวนรูปต่อหนึ่งบล็อก (รูปเกิน = ต่อด้วยแบบเดิมซ้ำ · เหลือไม่ครบบล็อก = เรียง 2/1) */
export const GALLERY_LAYOUTS: GalleryLayout[] = [
  { key: "col1", label: "เรียง 1", group: "basic", kind: "grid", slots: 0, cols: 1 },
  { key: "col2", label: "เรียง 2", group: "basic", kind: "grid", slots: 0, cols: 2 },
  { key: "col3", label: "เรียง 3", group: "basic", kind: "grid", slots: 0, cols: 3 },
  { key: "grid4", label: "ตาราง 2×2", group: "basic", kind: "grid", slots: 0, cols: 2, square: true },
  { key: "slider", label: "สไลด์", group: "basic", kind: "slider", slots: 0 },
  { key: "masonry", label: "Masonry", group: "basic", kind: "masonry", slots: 0 },
  { key: "bigLeft", label: "ใหญ่ซ้าย", group: "collage", kind: "collage", slots: 3 },
  { key: "bigTop", label: "ใหญ่บน", group: "collage", kind: "collage", slots: 3 },
  { key: "bigRight", label: "ใหญ่ขวา", group: "collage", kind: "collage", slots: 3 },
  { key: "bigBottom", label: "ใหญ่ล่าง", group: "collage", kind: "collage", slots: 3 },
  { key: "tallLeft", label: "สูงซ้าย", group: "collage", kind: "collage", slots: 3 },
  { key: "free", label: "อิสระ", group: "collage", kind: "collage", slots: 3 },
  { key: "diagL", label: "เฉียง /", group: "split", kind: "split", slots: 2 },
  { key: "diagR", label: "เฉียง \\", group: "split", kind: "split", slots: 2 },
  { key: "diagH", label: "เฉียงนอน", group: "split", kind: "split", slots: 2 },
  { key: "diagH2", label: "เฉียงนอน 2", group: "split", kind: "split", slots: 2 },
  { key: "curveS", label: "โค้ง S", group: "split", kind: "split", slots: 2 },
  { key: "wave", label: "คลื่น", group: "split", kind: "split", slots: 2 },
  { key: "cross4", label: "กากบาทเฉียง", group: "split", kind: "split", slots: 4 },
  { key: "hex", label: "รังผึ้ง", group: "shape", kind: "shape", slots: 7 },
  { key: "heart", label: "หัวใจ", group: "shape", kind: "shape", slots: 27, cycle: true },
  { key: "stackTilt", label: "ซ้อน 3 + ใหญ่เอียง", group: "shape", kind: "shape", slots: 4 },
  { key: "scatter", label: "กระจายเอียง", group: "shape", kind: "shape", slots: 4 },
  { key: "circle", label: "กรอบ + วงกลม", group: "shape", kind: "shape", slots: 2 },
];
export const LAYOUT_GROUPS: Record<GalleryLayout["group"], string> = { basic: "เรียงปกติ", collage: "กริดคอลลาจ", split: "แบ่งเส้น", shape: "รูปทรงพิเศษ" };

/** อัตราส่วนภาพ (กว้าง:สูง) สำหรับแบบเรียง 1/2/3 และสไลด์ · "" = ค่าเดิมของแบบ (เรียง 1 = 16:9 · อื่น 4:3) · auto = ตามรูปจริง */
export const GALLERY_RATIOS = [
  { key: "", label: "ค่าเริ่มต้น", hint: "เรียง 1 = 16:9 · อื่นๆ = 4:3" },
  { key: "auto", label: "ตามรูปจริง", hint: "ไม่ตัดรูป สูงตามรูป" },
  { key: "1:1", label: "1:1", hint: "จัตุรัส · Instagram" },
  { key: "4:5", label: "4:5", hint: "แนวตั้ง · โพสต์โซเชียล" },
  { key: "3:4", label: "3:4", hint: "แนวตั้ง" },
  { key: "2:3", label: "2:3", hint: "แนวตั้ง · ภาพพิมพ์" },
  { key: "9:16", label: "9:16", hint: "แนวตั้งเต็ม · Story/Reels" },
  { key: "5:4", label: "5:4", hint: "เกือบจัตุรัส · ภาพพิมพ์" },
  { key: "4:3", label: "4:3", hint: "กล้องทั่วไป" },
  { key: "3:2", label: "3:2", hint: "กล้อง DSLR" },
  { key: "16:9", label: "16:9", hint: "จอกว้าง · วิดีโอ" },
  { key: "21:9", label: "21:9", hint: "พาโนรามา" },
] as const;
export type GalleryRatio = (typeof GALLERY_RATIOS)[number]["key"];
/** แบบที่ตั้งอัตราส่วนได้ */
export const RATIO_LAYOUTS = new Set(["col1", "col2", "col3", "slider"]);
/** อัตราส่วนที่ใช้จริง (กว้าง/สูง เป็นตัวเลข) · null = ตามรูปจริง */
export function ratioOf(layout: string, ratio: string): number | null {
  if (ratio === "auto") return null;
  const r = ratio && RATIO_LAYOUTS.has(layout) ? ratio : layout === "col1" ? "16:9" : "4:3";
  const [w, h] = r.split(":").map(Number);
  return w / h;
}
export const FITS = { cover: "เต็มกรอบ (ตัดขอบ)", contain: "แสดงทั้งภาพ" } as const;
export type GalleryFit = keyof typeof FITS;
export const layoutOf = (k: string) => GALLERY_LAYOUTS.find((l) => l.key === k) ?? GALLERY_LAYOUTS[1];

export const GALLERY_MAX = 24;
export const CAPTION_MAX = 120;
export const TITLE_MAX = 80;
export const GAP_MAX = 40, PAD_MAX = 60, RADIUS_MAX = 40;
export const CAPTION_MODES = { over: "แสดงบนรูป", below: "ใต้รูป", none: "ไม่แสดง" } as const;
export type CaptionMode = keyof typeof CAPTION_MODES;

export type GalleryItem = { key: string; cap: string };
export type Gallery = { title: string; layout: string; gap: number; pad: number; radius: number; caption: CaptionMode; ratio: GalleryRatio; fit: GalleryFit; wm: boolean; items: GalleryItem[] };
export const GALLERY_DEFAULT: Gallery = { title: "", layout: "col2", gap: 8, pad: 0, radius: 0, caption: "over", ratio: "", fit: "cover", wm: true, items: [] };

/** key รูปที่อัปโหลดเข้าร้าน (เหมือนรูปสินค้า) */
export const GALLERY_KEY_RE = /^products\/[\w/.-]+\.webp$/;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** ค่าจาก DB/ฟอร์ม → ค่าที่ปลอดภัย (ไม่มีรูป = ว่าง) */
export function parseGallery(raw: unknown): Gallery {
  let src = raw;
  if (typeof raw === "string") {
    try { src = JSON.parse(raw); } catch { src = null; }
  }
  const o = obj(src);
  const seen = new Set<string>();
  const items: GalleryItem[] = [];
  for (const it of Array.isArray(o.items) ? o.items : []) {
    const r = obj(it);
    const key = typeof r.key === "string" ? r.key : "";
    if (!GALLERY_KEY_RE.test(key) || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, cap: text(r.cap, CAPTION_MAX) });
    if (items.length >= GALLERY_MAX) break;
  }
  const layout = typeof o.layout === "string" && GALLERY_LAYOUTS.some((l) => l.key === o.layout) ? o.layout : GALLERY_DEFAULT.layout;
  const caption = typeof o.caption === "string" && o.caption in CAPTION_MODES ? (o.caption as CaptionMode) : GALLERY_DEFAULT.caption;
  return {
    title: text(o.title, TITLE_MAX),
    layout,
    gap: int(o.gap, 0, GAP_MAX, GALLERY_DEFAULT.gap),
    pad: int(o.pad, 0, PAD_MAX, GALLERY_DEFAULT.pad),
    radius: int(o.radius, 0, RADIUS_MAX, GALLERY_DEFAULT.radius),
    caption,
    ratio: GALLERY_RATIOS.some((r) => r.key === o.ratio) ? (o.ratio as GalleryRatio) : "",
    fit: o.fit === "contain" ? "contain" : "cover",
    wm: o.wm !== false,
    items,
  };
}

export type GalleryBlock<T extends GalleryItem = GalleryItem> = { layout: string; items: (T & { i: number })[] };

/**
 * แบ่งรูปเป็นบล็อกตามรูปแบบ (i = ลำดับรูปทั้งหมด ใช้เปิดดูเต็มจอ)
 * · แบบเรียง/สไลด์/masonry = บล็อกเดียว · คอลลาจ 3 รูป/แบ่งเส้น 2 รูป = ซ้ำทุก n รูป · เศษ: 1 รูป = เรียง 1 · 3 รูป = ใหญ่ซ้าย · อื่นๆ = เรียง 2
 */
export function galleryBlocks<T extends GalleryItem>(g: { layout: string; items: T[] }): GalleryBlock<T>[] {
  const L = layoutOf(g.layout);
  const all = g.items.map((it, i) => ({ ...it, i }));
  if (!all.length) return [];
  if (!L.slots) return [{ layout: L.key, items: all }];
  // หัวใจ: ใช้รูปวนซ้ำให้เต็มทุกช่อง (บล็อกเดียว)
  if (L.cycle) return [{ layout: L.key, items: Array.from({ length: L.slots }, (_, j) => all[j % all.length]) }];
  const out: GalleryBlock<T>[] = [];
  for (let k = 0; k < all.length; k += L.slots) {
    const part = all.slice(k, k + L.slots);
    // เศษไม่ครบบล็อก: 1 = เรียง 1 · 3 = ใหญ่ซ้าย · อื่นๆ = เรียง 2
    out.push({ layout: part.length === L.slots ? L.key : part.length === 1 ? "col1" : part.length === 3 ? "bigLeft" : "col2", items: part });
  }
  return out;
}

/** เส้นโค้งเป็นจุด polygon (%): แนวตั้ง (x เปลี่ยนตาม y) หรือแนวนอน */
function curve(vertical: boolean, fn: (t: number) => number, n = 24) {
  const pts: string[] = [];
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const v = fn(t).toFixed(1);
    pts.push(vertical ? `${v}% ${(t * 100).toFixed(1)}%` : `${(t * 100).toFixed(1)}% ${v}%`);
  }
  return pts;
}

/** รูปทรงตัดของรูปที่ 2 ในแบบแบ่งเส้น (รูปที่ 1 เต็มกรอบอยู่ด้านหลัง) */
export function splitClip(layout: string): string {
  switch (layout) {
    case "diagL": return "polygon(58% 0,100% 0,100% 100%,42% 100%)";
    case "diagR": return "polygon(42% 0,100% 0,100% 100%,58% 100%)";
    case "diagH": return "polygon(0 58%,100% 42%,100% 100%,0 100%)";
    case "diagH2": return "polygon(0 42%,100% 58%,100% 100%,0 100%)";
    case "curveS": return `polygon(${[...curve(true, (t) => 52 + 12 * Math.sin(t * Math.PI * 2)), "100% 100%", "100% 0%"].join(",")})`;
    case "wave": return `polygon(${[...curve(false, (t) => 55 - 10 * Math.sin(t * Math.PI * 2)), "100% 100%", "0% 100%"].join(",")})`;
    default: return "none";
  }
}

/** แบบ "อิสระ" (3 ส่วน): บนซ้าย · บนขวา · ล่าง แบ่งด้วยเส้นเฉียง */
export const FREE_CLIPS = [
  "polygon(0 0,50% 0,57% 52%,0 64%)",
  "polygon(50% 0,100% 0,100% 44%,57% 52%)",
  "polygon(0 64%,57% 52%,100% 44%,100% 100%,0 100%)",
] as const;

/** กากบาทเฉียง 4 ส่วน (บนซ้าย บนขวา ล่างซ้าย ล่างขวา) — เส้นตั้งเอียงจาก 60%→42% · เส้นนอนเอียงจาก 62%→45% · ช่องห่างตามค่าระยะห่าง */
export const CROSS4_CLIPS = [
  "polygon(0 0,calc(60% - var(--pg-h)) 0,calc(52.4% - var(--pg-h)) calc(54.3% - var(--pg-h)),0 calc(62% - var(--pg-h)))",
  "polygon(calc(60% + var(--pg-h)) 0,100% 0,100% calc(45% - var(--pg-h)),calc(52.4% + var(--pg-h)) calc(54.3% - var(--pg-h)))",
  "polygon(0 calc(62% + var(--pg-h)),calc(52.4% - var(--pg-h)) calc(54.3% + var(--pg-h)),calc(42% - var(--pg-h)) 100%,0 100%)",
  "polygon(calc(52.4% + var(--pg-h)) calc(54.3% + var(--pg-h)),100% calc(45% + var(--pg-h)),100% 100%,calc(42% + var(--pg-h)) 100%)",
] as const;

/** หัวใจ: ตาราง 7×6 — 1 = มีรูป */
export const HEART_MASK = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"] as const;

/** SVG ไอคอนของรูปแบบ (ใช้ในหลังบ้าน) — เส้นแบ่งภายในกรอบ 40×40 */
export const LAYOUT_ICON: Record<string, string> = {
  col1: "M3 3h34v15H3zM3 22h34v15H3z",
  col2: "M3 3h15v15H3zM22 3h15v15H22zM3 22h15v15H3zM22 22h15v15H22z",
  col3: "M3 3h9v9H3zM15.5 3h9v9h-9zM28 3h9v9h-9zM3 15.5h9v9H3zM15.5 15.5h9v9h-9zM28 15.5h9v9h-9z",
  grid4: "M3 3h34v34H3zM3 20h34M20 3v34",
  slider: "M3 3h34v34H3zM8 30l8-10 6 6 4-4 6 8",
  masonry: "M3 3h15v20H3zM22 3h15v12H22zM3 27h15v10H3zM22 19h15v18H22z",
  bigLeft: "M3 3h34v34H3zM20 3v34M20 20h17",
  bigTop: "M3 3h34v34H3zM3 20h34M20 20v17",
  bigRight: "M3 3h34v34H3zM20 3v34M3 20h17",
  bigBottom: "M3 3h34v34H3zM3 20h34M20 3v17",
  tallLeft: "M3 3h20v34H3zM26 3h11v15H26zM26 22h11v15H26z",
  free: "M3 3h34v34H3zM3 25.5l34-12M20 3l3 18",
  diagL: "M3 3h34v34H3zM24 3 16 37",
  diagR: "M3 3h34v34H3zM16 3l8 34",
  diagH: "M3 3h34v34H3zM3 24l34-8",
  diagH2: "M3 3h34v34H3zM3 16l34 8",
  curveS: "M3 3h34v34H3zM22 3c-8 9 8 15 0 34",
  wave: "M3 3h34v34H3zM3 24c10-10 20 8 34-4",
  cross4: "M3 3h34v34H3zM24 3 17 37M3 25l34-7",
  hex: "M14 4l5 3v6l-5 3-5-3V7zM24 4l5 3v6l-5 3-5-3V7zM9 13l5 3v6l-5 3-5-3v-6zM19 13l5 3v6l-5 3-5-3v-6zM29 13l5 3v6l-5 3-5-3v-6zM14 22l5 3v6l-5 3-5-3v-6zM24 22l5 3v6l-5 3-5-3v-6z",
  heart: "M8 7h5v5H8zM15 7h5v5h-5zM22 7h5v5h-5zM5 14h5v5H5zM12 14h5v5h-5zM19 14h5v5h-5zM26 14h5v5h-5zM9 21h5v5H9zM16 21h5v5h-5zM23 21h5v5h-5zM16 28h5v5h-5z",
  stackTilt: "M3 4h11v9H3zM3 15h11v9H3zM3 26h11v10H3zM18 4l19 1-1 31-18-1z",
  scatter: "M5 6l18-2 1 17-18 2zM27 13h9v10h-9zM5 27h13v6H5zM22 27l11-2 2 9-11 2z",
  circle: "M3 5h30v24H3zM28 26a8 8 0 1 0 .1 0z",
};
