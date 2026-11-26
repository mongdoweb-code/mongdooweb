// ตัวอักษร (ฟอนต์) ที่ตั้งได้จากหลังร้าน — หลังบ้าน + หน้าร้าน แยกกัน · ค่ารวม + ปรับแยกแต่ละส่วน
// ฟังก์ชันล้วน (ใช้ทั้ง server และตัวอย่างสดใน client): ตรวจค่า → CSS + ลิงก์ Google Fonts
// ปลอดภัย: ชื่อฟอนต์ต้องอยู่ในรายการด้านล่างเท่านั้น · สี #RRGGBB · ตัวเลขถูกจำกัดช่วง → ไม่มีข้อความจากผู้ใช้หลุดเข้า CSS
// ค่าว่าง ({}) = ไม่สร้าง CSS เลย หน้าตาเหมือนเดิมทุกอย่าง · เอกสารพิมพ์ A4 (.sheet) กำหนดฟอนต์ของตัวเองจึงไม่เปลี่ยนตาม

export type FontGroup = "loopless" | "looped" | "display";
export type FontDef = { f: string; g: FontGroup; w: number[]; note?: string };

/** ฟอนต์ไทยจาก Google Fonts (น้ำหนักที่มีจริง — ใช้สร้างลิงก์ ถ้าขอน้ำหนักที่ไม่มี Google ตอบ 400) */
export const THAI_FONTS: FontDef[] = [
  { f: "Noto Sans Thai", g: "loopless", w: [300, 400, 500, 600, 700], note: "ค่าเดิม" },
  { f: "IBM Plex Sans Thai", g: "loopless", w: [300, 400, 500, 600, 700], note: "แนะนำ" },
  { f: "Anuphan", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Prompt", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Kanit", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Bai Jamjuree", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Chakra Petch", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "K2D", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Krub", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "KoHo", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Kodchasan", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Niramit", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Fahkwang", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Athiti", g: "loopless", w: [300, 400, 500, 600, 700] },
  { f: "Thasadith", g: "loopless", w: [400, 700] },
  { f: "Sarabun", g: "looped", w: [300, 400, 500, 600, 700], note: "แบบเอกสารราชการ" },
  { f: "IBM Plex Sans Thai Looped", g: "looped", w: [300, 400, 500, 600, 700] },
  { f: "Noto Sans Thai Looped", g: "looped", w: [300, 400, 500, 600, 700] },
  { f: "Noto Serif Thai", g: "looped", w: [300, 400, 500, 600, 700] },
  { f: "Pridi", g: "looped", w: [300, 400, 500, 600, 700] },
  { f: "Taviraj", g: "looped", w: [300, 400, 500, 600, 700] },
  { f: "Trirong", g: "looped", w: [300, 400, 500, 600, 700] },
  { f: "Maitree", g: "looped", w: [300, 400, 500, 600, 700] },
  { f: "Mitr", g: "display", w: [300, 400, 500, 600, 700] },
  { f: "Mali", g: "display", w: [300, 400, 500, 600, 700] },
  { f: "Chonburi", g: "display", w: [400] },
  { f: "Itim", g: "display", w: [400] },
  { f: "Pattaya", g: "display", w: [400] },
  { f: "Sriracha", g: "display", w: [400] },
  { f: "Charm", g: "display", w: [400, 700] },
  { f: "Charmonman", g: "display", w: [400, 700] },
  { f: "Srisakdi", g: "display", w: [400, 700] },
];
export const FONT_GROUPS: Record<FontGroup, string> = { loopless: "นิยม · ไม่มีหัว (อ่านง่ายบนจอ)", looped: "มีหัว (ทางการ/เอกสาร)", display: "ตกแต่ง/หัวข้อ" };

/** ฟอนต์อังกฤษ/ตัวเลข ("" = ใช้ฟอนต์ไทยเดียวกัน) */
export const LATIN_FONTS: { f: string; w: number[]; note?: string }[] = [
  { f: "", w: [], note: "ใช้ฟอนต์ไทยเดียวกัน" },
  { f: "Geist", w: [300, 400, 500, 600, 700] },
  { f: "Inter", w: [300, 400, 500, 600, 700] },
  { f: "Roboto", w: [300, 400, 500, 600, 700] },
  { f: "Poppins", w: [300, 400, 500, 600, 700] },
  { f: "DM Sans", w: [300, 400, 500, 600, 700] },
  { f: "Manrope", w: [300, 400, 500, 600, 700] },
  { f: "Plus Jakarta Sans", w: [300, 400, 500, 600, 700] },
  { f: "Montserrat", w: [300, 400, 500, 600, 700] },
];

export const WEIGHTS = [300, 400, 500, 600, 700] as const;
export const WEIGHT_LABEL: Record<number, string> = { 300: "บาง", 400: "ปกติ", 500: "กลาง", 600: "หนา", 700: "หนามาก" };
export const LINE_HEIGHTS = [1.4, 1.55, 1.7] as const;
export const LETTER_SPACINGS = [-0.2, 0, 0.3] as const;
export const SIZE_MIN = 11, SIZE_MAX = 48, BASE_MIN = 12, BASE_MAX = 20;

export type Kind = "admin" | "shop";
export type AreaStyle = { font?: string; size?: number; weight?: number; italic?: boolean; underline?: boolean; upper?: boolean; color?: string; ls?: number };
export type Base = { thai: string; latin: string; size: number; weight: number; lh: number; ls: number; color: string };
export type Scope = { base: Base; areas: Record<string, AreaStyle> };
export type Typography = { admin: Scope | null; shop: Scope | null };

/** ส่วนที่ปรับแยกได้ · sel = ตัวเลือก CSS ของจริง ("body" = เนื้อหาทั้งหน้า) · bg = พื้นหลังไว้ตรวจความคมชัด · fluid = ขนาดย่อตามจอ (หัวข้อหน้าร้าน) */
export type AreaDef = { key: string; label: string; hint: string; sel: string; size: number; weight: number; bg: string; fluid?: boolean };
export const AREAS: Record<Kind, AreaDef[]> = {
  admin: [
    { key: "sidebar", label: "เมนูซ้าย", hint: "รายการเมนูด้านข้าง", sel: ".side .nav-i", size: 15, weight: 500, bg: "#161616" },
    { key: "quickbar", label: "แถบเมนูด่วน", hint: "ปุ่มด้านบน", sel: ".qb-a", size: 13.5, weight: 600, bg: "#FFFFFF" },
    { key: "title", label: "หัวข้อหน้า", hint: "เช่น \"คำสั่งซื้อ\"", sel: ".page-head h1", size: 26, weight: 700, bg: "#F1EFEA" },
    { key: "button", label: "ปุ่ม", hint: "สร้าง/ส่งออก/บันทึก", sel: ".main .btn", size: 14, weight: 600, bg: "#FFFFFF" },
    { key: "body", label: "เนื้อหา + ตาราง", hint: "ข้อความทั่วไป ตัวเลข", sel: "body", size: 15, weight: 400, bg: "#FFFFFF" },
  ],
  shop: [
    { key: "nav", label: "เมนูบน", hint: "เมนูหลักส่วนหัว", sel: ".nav > a, .nav-trigger", size: 15, weight: 500, bg: "#FFFFFF" },
    { key: "heading", label: "หัวข้อ", hint: "หัวข้อแต่ละส่วนของหน้า", sel: ".sec-title", size: 38, weight: 700, bg: "#FFFFFF", fluid: true },
    { key: "product", label: "ชื่อสินค้า", hint: "บนการ์ดสินค้า", sel: ".prod-name", size: 16, weight: 600, bg: "#FFFFFF" },
    { key: "price", label: "ราคา", hint: "ราคาบนการ์ด/หน้าสินค้า", sel: ".prod-price, .pdp-price", size: 20, weight: 700, bg: "#FFFFFF" },
    { key: "button", label: "ปุ่ม", hint: "ใส่ตะกร้า/สั่งซื้อ", sel: ".btn", size: 16, weight: 600, bg: "#F26B38" },
    { key: "body", label: "เนื้อหา", hint: "ข้อความทั่วไป รายละเอียดสินค้า", sel: "body", size: 16, weight: 400, bg: "#FFFFFF" },
    { key: "footer", label: "ส่วนท้าย", hint: "ข้อมูลร้าน ลิงก์ท้ายเว็บ", sel: ".footer", size: 14, weight: 400, bg: "#161616" },
  ],
};

export const BASE_DEFAULT: Record<Kind, Base> = {
  admin: { thai: "Noto Sans Thai", latin: "", size: 15, weight: 400, lh: 1.55, ls: 0, color: "" },
  shop: { thai: "Noto Sans Thai", latin: "", size: 16, weight: 400, lh: 1.65, ls: 0, color: "" },
};
export const emptyScope = (k: Kind): Scope => ({ base: { ...BASE_DEFAULT[k] }, areas: {} });

/** ชุดสำเร็จรูป (กดแล้วแทนค่ารวม · ส่วนที่ปรับแยกไว้ถูกล้าง) */
export const PRESETS: { key: string; label: string; desc: string; apply: (k: Kind) => Scope }[] = [
  { key: "standard", label: "มาตรฐาน", desc: "Noto Sans Thai", apply: (k) => emptyScope(k) },
  { key: "modern", label: "โมเดิร์น", desc: "Geist + IBM Plex", apply: (k) => ({ base: { ...BASE_DEFAULT[k], thai: "IBM Plex Sans Thai", latin: "Geist" }, areas: {} }) },
  { key: "large", label: "อ่านง่าย (ตัวใหญ่)", desc: "+2px ทั้งหมด", apply: (k) => ({ base: { ...BASE_DEFAULT[k], size: BASE_DEFAULT[k].size + 2, lh: 1.7 }, areas: {} }) },
  { key: "compact", label: "กระชับ (ตัวเล็ก)", desc: "−1px ทั้งหมด", apply: (k) => ({ base: { ...BASE_DEFAULT[k], size: BASE_DEFAULT[k].size - 1, lh: 1.4 }, areas: {} }) },
];

const THAI_SET = new Set(THAI_FONTS.map((x) => x.f));
const LATIN_SET = new Set(LATIN_FONTS.map((x) => x.f));
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** ปัดครึ่ง px (13.5 ได้) */
const half = (v: number) => Math.round(v * 2) / 2;
const pick = <T extends number>(v: unknown, list: readonly T[], d: T): T => {
  const n = num(v);
  return (list as readonly number[]).includes(n) ? (n as T) : d;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function parseBase(raw: unknown, k: Kind): Base {
  const o = obj(raw), d = BASE_DEFAULT[k];
  const size = num(o.size);
  return {
    thai: typeof o.thai === "string" && THAI_SET.has(o.thai) ? o.thai : d.thai,
    latin: typeof o.latin === "string" && LATIN_SET.has(o.latin) ? o.latin : d.latin,
    size: Number.isFinite(size) ? clamp(half(size), BASE_MIN, BASE_MAX) : d.size,
    weight: pick(o.weight, WEIGHTS, d.weight as 400),
    lh: pick(o.lh, LINE_HEIGHTS, d.lh as 1.55),
    ls: pick(o.ls, LETTER_SPACINGS, 0),
    color: typeof o.color === "string" && HEX.test(o.color) ? o.color.toUpperCase() : "",
  };
}

function parseArea(raw: unknown): AreaStyle | null {
  const o = obj(raw);
  const a: AreaStyle = {};
  if (typeof o.font === "string" && THAI_SET.has(o.font)) a.font = o.font;
  const s = num(o.size);
  if (Number.isFinite(s)) a.size = clamp(half(s), SIZE_MIN, SIZE_MAX);
  if ((WEIGHTS as readonly number[]).includes(num(o.weight))) a.weight = num(o.weight);
  if (o.italic === true) a.italic = true;
  if (o.underline === true) a.underline = true;
  if (o.upper === true) a.upper = true;
  if (typeof o.color === "string" && HEX.test(o.color)) a.color = o.color.toUpperCase();
  if ((LETTER_SPACINGS as readonly number[]).includes(num(o.ls)) && num(o.ls) !== 0) a.ls = num(o.ls);
  return Object.keys(a).length ? a : null;
}

export function parseScope(raw: unknown, k: Kind): Scope | null {
  const o = obj(raw);
  if (!Object.keys(o).length) return null;
  const areas: Record<string, AreaStyle> = {};
  const ra = obj(o.areas);
  for (const d of AREAS[k]) {
    const a = parseArea(ra[d.key]);
    if (a) areas[d.key] = a;
  }
  return { base: parseBase(o.base, k), areas };
}

/** ค่าจาก DB/ฟอร์ม → ค่าที่ปลอดภัย (null = ใช้หน้าตาเดิม) */
export function parseTypography(raw: unknown): Typography {
  const o = obj(typeof raw === "string" ? safeJson(raw) : raw);
  return { admin: parseScope(o.admin, "admin"), shop: parseScope(o.shop, "shop") };
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** ค่าที่เหมือนค่าเริ่มต้นทุกอย่าง = ไม่ได้ปรับ (เก็บเป็น null ไม่สร้าง CSS) */
export function isDefaultScope(s: Scope | null, k: Kind) {
  if (!s) return true;
  const d = BASE_DEFAULT[k];
  return !Object.keys(s.areas).length && (Object.keys(d) as (keyof Base)[]).every((x) => s.base[x] === d[x]);
}

/** ชุดฟอนต์สำหรับ font-family (ชื่ออยู่ในรายการแล้วจึงใส่ในเครื่องหมายคำพูดได้ตรงๆ) · Noto Sans Thai ใช้ตัวที่ฝังมากับเว็บ (next/font) */
export function fontStack(thai: string, latin = "") {
  const t = thai === "Noto Sans Thai" ? "var(--font-noto-thai),'Noto Sans Thai'" : `'${thai}'`;
  return `${latin ? `'${latin}',` : ""}${t},system-ui,sans-serif`;
}

/** ขนาดจริงของส่วน: ตั้งเอง หรือค่าเดิมของส่วน + ส่วนต่างของขนาดพื้นฐาน (ขยายตามสัดส่วน) */
export function areaSize(s: Scope, k: Kind, d: AreaDef) {
  const own = s.areas[d.key]?.size;
  if (own != null) return own;
  const delta = s.base.size - BASE_DEFAULT[k].size;
  return d.key === "body" ? s.base.size : clamp(half(d.size + delta * (d.size >= 24 ? 1.5 : 1)), SIZE_MIN, SIZE_MAX);
}

export type CssRoots = {
  /** ตัวเลือกราก เช่น html[data-adm-theme] หรือ .ty-pv (ตัวอย่างสด) */
  root: string;
  /** ตัวเลือกของ "ทั้งหน้า" (body) */
  body: string;
  /** สีใช้เฉพาะธีมสว่าง (ธีมมืดใช้สีของธีม กันอ่านไม่ออก) */
  light: string;
};
export const REAL_ROOTS: Record<Kind, CssRoots> = {
  admin: { root: "html[data-adm-theme]", body: "html[data-adm-theme] body", light: 'html[data-adm-theme="light"]' },
  shop: { root: "html[data-theme]", body: "html[data-theme] body", light: 'html[data-theme="light"]' },
};

/** CSS ทั้งชุดของขอบเขตหนึ่ง ("" = ไม่ได้ปรับ) */
export function typographyCss(s: Scope | null, k: Kind, r: CssRoots = REAL_ROOTS[k]): string {
  if (!s || isDefaultScope(s, k)) return "";
  const b = s.base;
  const out: string[] = [];
  const sel = (x: string) => (x === "body" ? r.body : x.split(",").map((p) => `${r.root} ${p.trim()}`).join(","));
  /** สีเฉพาะธีมสว่าง · ตัวอย่างสด (light = root) ใช้ตัวเลือกเดียวกับ sel */
  const lightBody = r.light === r.root ? r.body : `${r.light} body`;
  const lightSel = (x: string) => (x === "body" ? lightBody : x.split(",").map((p) => `${r.light} ${p.trim()}`).join(","));
  out.push(`${r.root}{--font:${fontStack(b.thai, b.latin)}}`);
  out.push(`${r.body}{font-family:var(--font);font-size:${b.size}px;font-weight:${b.weight};line-height:${b.lh};letter-spacing:${b.ls}px}`);
  // ปุ่ม/ช่องกรอกใช้ฟอนต์เดียวกับหน้า (บางเบราว์เซอร์ไม่สืบทอดเอง)
  out.push(`${r.root} :is(button,input,select,textarea){font-family:inherit}`);
  if (b.color) out.push(`${lightBody}{color:${b.color}}`);
  // เอกสาร A4/ใบปะหน้าในหน้าหลังบ้าน: ไม่รับน้ำหนัก/ระยะตัวอักษรจากค่ารวม (หน้ากระดาษต้องเหมือนเดิม)
  if (b.weight !== 400 || b.ls !== 0) out.push(`${r.root} :is(.sheet,.lsheet,.label){font-weight:400;letter-spacing:normal}`);
  for (const d of AREAS[k]) {
    const a = s.areas[d.key] ?? {};
    const size = areaSize(s, k, d);
    const decl: string[] = [];
    if (a.font) decl.push(`font-family:${fontStack(a.font, b.latin)}`);
    if (d.key !== "body" && (a.size != null || size !== d.size)) decl.push(`font-size:${d.fluid ? `clamp(${Math.round(size * 0.68)}px,${(size / 12).toFixed(2)}vw,${size}px)` : `${size}px`}`);
    if (a.weight) decl.push(`font-weight:${a.weight}`);
    if (a.italic) decl.push("font-style:italic");
    if (a.underline) decl.push("text-decoration:underline;text-underline-offset:3px");
    if (a.upper) decl.push("text-transform:uppercase");
    if (a.ls != null) decl.push(`letter-spacing:${a.ls}px`);
    if (decl.length) out.push(`${sel(d.sel)}{${decl.join(";")}}`);
    if (a.color) out.push(`${lightSel(d.sel)}{color:${a.color}}`);
  }
  return out.join("\n");
}

/** ลิงก์ Google Fonts ของฟอนต์ที่ใช้จริง (null = ไม่ต้องโหลด) · Noto Sans Thai ฝังมากับเว็บแล้ว */
export function googleFontsUrl(scopes: (Scope | null)[], extra: string[] = []): string | null {
  const fams = new Set<string>(extra);
  for (const s of scopes) {
    if (!s) continue;
    fams.add(s.base.thai);
    if (s.base.latin) fams.add(s.base.latin);
    for (const a of Object.values(s.areas)) if (a.font) fams.add(a.font);
  }
  fams.delete("Noto Sans Thai");
  fams.delete("");
  return familiesUrl([...fams]);
}

/** ลิงก์ Google Fonts ของชื่อฟอนต์ในรายการ · text = โหลดเฉพาะตัวอักษรที่ใช้ (ไฟล์เล็กมาก ใช้ในรายการเลือกฟอนต์) */
export function familiesUrl(families: string[], text?: string): string | null {
  const defs = new Map<string, number[]>([...THAI_FONTS, ...LATIN_FONTS].map((x) => [x.f, x.w]));
  const parts = families.filter((f) => defs.has(f) && f).sort().map((f) => {
    const w = defs.get(f)!;
    const name = f.replace(/ /g, "+");
    return w.length <= 1 ? `family=${name}` : `family=${name}:wght@${w.join(";")}`;
  });
  if (!parts.length) return null;
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ""}`;
}

/** ความคมชัดตัวอักษรกับพื้น (WCAG) — เตือนเมื่อ < 4.5 */
export function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  if (!HEX.test(a) || !HEX.test(b)) return 21;
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** สรุปสั้นของส่วน (แสดงในรายการ) */
export function areaSummary(s: Scope, k: Kind, d: AreaDef) {
  const a = s.areas[d.key] ?? {};
  const bits = [a.font ?? "ตามค่ารวม", `${areaSize(s, k, d)}px`, `หนา ${a.weight ?? d.weight}`];
  if (a.italic) bits.push("เอียง");
  if (a.underline) bits.push("ขีดเส้นใต้");
  if (a.upper) bits.push("ตัวพิมพ์ใหญ่");
  if (a.color) bits.push(a.color);
  return bits.join(" · ");
}
