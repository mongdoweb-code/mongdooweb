// หน้าเข้าสู่ระบบหลังบ้าน (/admin/login): เนื้อหาโซนการตลาดด้านซ้าย + ข้อความต้อนรับ/หมวด/สินค้าแนะนำด้านขวา
// ตั้งค่าที่ /admin/settings/login (เจ้าของร้าน) เก็บใน ShopSetting.loginPage (JSON)
// หน้านี้เปิดได้โดยไม่ต้องล็อกอิน → เก็บเฉพาะข้อความ/รูปที่ตั้งใจเผยแพร่ · รูปต้องเป็นไฟล์ที่อัปโหลด (login/…) เท่านั้น
// ไม่มี import ฝั่ง server — ใช้ได้ทั้ง server และ client (หน้าตั้งค่า)

export type LoginTheme = "orange" | "ocean" | "rgb";
export type LoginStat = { value: string; label: string };
export type LoginPageConfig = {
  eyebrow: string;
  headline: string;
  /** คำในหัวข้อที่ให้เรืองแสง (ต้องอยู่ในหัวข้อ) */
  glow: string;
  sub: string;
  highlights: string[];
  stats: LoginStat[];
  /** รูปที่อัปโหลด (storage key login/…) วนแสดงในกรอบ */
  images: string[];
  /** ไม่มีรูปที่อัปโหลด → ใช้รูปผลงานติดตั้งที่เผยแพร่ล่าสุด */
  useProjects: boolean;
  caption: string;
  theme: LoginTheme;
  animate: boolean;
  welcome: string;
  welcomeSub: string;
  notice: string;
  showCategories: boolean;
  catCount: number;
  showProducts: boolean;
  productCount: number;
};

export const LOGIN_LIMITS = { highlights: 4, stats: 3, images: 4, cats: 12, products: 4 } as const;
export const LOGIN_THEMES: [LoginTheme, string][] = [["orange", "ส้มอบอุ่น (สีร้าน)"], ["ocean", "ฟ้าใต้น้ำ (สระ/น้ำพุ)"], ["rgb", "RGB เปลี่ยนสี"]];

export const LOGIN_DEFAULT: LoginPageConfig = {
  eyebrow: "มองดูเว็บ · LED Lighting",
  headline: "ทุกงานแสง เริ่มต้นที่หลังร้านนี้",
  glow: "งานแสง",
  sub: "ออกใบเสนอราคาได้ในไม่กี่นาที ตามติดทุกออเดอร์ สต็อกตรงทุกชิ้น — ให้ทีมขายโฟกัสที่การปิดงาน",
  highlights: [
    "ไฟใต้น้ำ น้ำพุ สระว่ายน้ำ กันน้ำ IP68 ส่งทั่วประเทศ",
    "ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ จบในระบบเดียว",
    "ติดตามลูกค้า รู้ว่าเปิดดูใบเสนอราคาเมื่อไร",
    "สต็อก ใบสั่งซื้อ และรายงานยอดขายแบบเรียลไทม์",
  ],
  stats: [
    { value: "180+", label: "รายการสินค้า" },
    { value: "IP68", label: "กันน้ำสูงสุด" },
    { value: "1 ปี", label: "รับประกัน" },
  ],
  images: [],
  useProjects: true,
  caption: "ผลงานติดตั้งจริงจากลูกค้าของเรา",
  theme: "orange",
  animate: true,
  welcome: "ยินดีต้อนรับกลับมา",
  welcomeSub: "เข้าสู่ระบบเพื่อจัดการร้านมองดูเว็บ",
  notice: "",
  showCategories: true,
  catCount: 8,
  showProducts: true,
  productCount: 3,
};

const txt = (v: unknown, max: number, fb: string) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : fb);
const int = (v: unknown, min: number, max: number, fb: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
};
/** key รูปที่อัปโหลดผ่านหน้าตั้งค่า (saveImage prefix "login") */
export const isLoginImageKey = (k: unknown): k is string => typeof k === "string" && /^login\/\d{4}\/\d{2}\/[a-z0-9]+\.webp$/.test(k);

/** ค่าที่บันทึก (JSON) → ค่าที่ใช้ได้จริง · ไม่มี/เสีย = ค่าเริ่มต้นทีละช่อง */
export function parseLoginPage(raw: unknown): LoginPageConfig {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const D = LOGIN_DEFAULT;
  const has = (k: string) => k in o;
  const highlights = Array.isArray(o.highlights) ? o.highlights.map((h) => txt(h, 90, "")).filter(Boolean).slice(0, LOGIN_LIMITS.highlights) : D.highlights;
  const stats = Array.isArray(o.stats)
    ? o.stats.flatMap((s) => {
        const r = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
        const value = txt(r.value, 12, ""), label = txt(r.label, 30, "");
        return value && label ? [{ value, label }] : [];
      }).slice(0, LOGIN_LIMITS.stats)
    : D.stats;
  const images = Array.isArray(o.images) ? [...new Set(o.images.filter(isLoginImageKey))].slice(0, LOGIN_LIMITS.images) : D.images;
  const headline = txt(o.headline, 80, D.headline) || D.headline;
  const glow = has("glow") ? txt(o.glow, 30, "") : D.glow;
  return {
    eyebrow: has("eyebrow") ? txt(o.eyebrow, 60, "") : D.eyebrow,
    headline,
    glow: glow && headline.includes(glow) ? glow : "",
    sub: has("sub") ? txt(o.sub, 220, "") : D.sub,
    highlights,
    stats,
    images,
    useProjects: typeof o.useProjects === "boolean" ? o.useProjects : D.useProjects,
    caption: has("caption") ? txt(o.caption, 80, "") : D.caption,
    theme: o.theme === "ocean" || o.theme === "rgb" || o.theme === "orange" ? o.theme : D.theme,
    animate: typeof o.animate === "boolean" ? o.animate : D.animate,
    welcome: txt(o.welcome, 60, D.welcome) || D.welcome,
    welcomeSub: has("welcomeSub") ? txt(o.welcomeSub, 120, "") : D.welcomeSub,
    notice: txt(o.notice, 160, ""),
    showCategories: typeof o.showCategories === "boolean" ? o.showCategories : D.showCategories,
    catCount: int(o.catCount, 1, LOGIN_LIMITS.cats, D.catCount),
    showProducts: typeof o.showProducts === "boolean" ? o.showProducts : D.showProducts,
    productCount: int(o.productCount, 1, LOGIN_LIMITS.products, D.productCount),
  };
}

/** แยกหัวข้อเป็นส่วนธรรมดา/ส่วนเรืองแสง */
export function splitGlow(headline: string, glow: string): { text: string; glow: boolean }[] {
  if (!glow) return [{ text: headline, glow: false }];
  const i = headline.indexOf(glow);
  if (i < 0) return [{ text: headline, glow: false }];
  return [{ text: headline.slice(0, i), glow: false }, { text: glow, glow: true }, { text: headline.slice(i + glow.length), glow: false }].filter((p) => p.text);
}
