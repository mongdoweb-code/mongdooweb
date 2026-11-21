// ส่วน "ทำไมต้องมองดูเว็บ" บนหน้าแรก — ฟังก์ชันล้วน (ใช้ได้ทั้งหน้าร้าน หลังบ้าน และเบราว์เซอร์ · ไม่มี import)
// ค่าเก็บใน ShopSetting.whyUs แก้ที่ /admin/home/why · {} หรือค่าผิดรูปแบบ = ข้อความเดิมของร้าน (หน้าแรกต้องแสดงได้เสมอ)
// รูปกล่องซ้าย: upload = รูปที่อัปโหลด (why/YYYY/MM/*.webp) · project = รูปผลงานติดตั้งล่าสุด · none = พื้นไล่สี

export const WHY_MAX_ITEMS = 6;
export const WHY_MIN_ITEMS = 1;
export const WHY_LIMITS = { eyebrow: 40, title: 120, itemTitle: 60, itemText: 200, capTitle: 60, capSub: 100, href: 300 } as const;
export const WHY_IMAGE_MODES = { upload: "อัปโหลดรูปเอง", project: "ใช้รูปผลงานติดตั้งล่าสุด (อัตโนมัติ)", none: "ไม่ใช้รูป (พื้นไล่สีโทนไฟ)" } as const;
export type WhyImageMode = keyof typeof WHY_IMAGE_MODES;
/** รูปที่อัปโหลด: ต้องเป็นไฟล์ที่ระบบสร้างเท่านั้น */
export const WHY_IMG_RE = /^why\/\d{4}\/\d{2}\/[a-z0-9]+\.webp$/;

/** สีข้อความที่ตั้งได้ (ว่าง = สีเดิมของธีม) — ใช้กับโหมดกลางวันของหน้าร้าน (โหมดกลางคืนใช้สีอ่านง่ายของธีม) · คำบรรยายบนรูปทึบใช้ทุกโหมด */
export const WHY_COLOR_KEYS = {
  eyebrow: "หัวข้อเล็ก", title: "หัวข้อหลัก", num: "เลขลำดับ", itemTitle: "หัวข้อจุดเด่น", itemText: "รายละเอียดจุดเด่น", capTitle: "ข้อความหลักบนรูป", capSub: "ข้อความรองบนรูป",
} as const;
export type WhyColorKey = keyof typeof WHY_COLOR_KEYS;
export type WhyColors = Partial<Record<WhyColorKey, string>>;
export const WHY_COLOR_RE = /^#[0-9A-F]{6}$/;
/** สีเดิมของธีม (ใช้แสดงในตัวแก้ไข) */
export const WHY_COLOR_DEFAULT: Record<WhyColorKey, string> = {
  eyebrow: "#F26B38", title: "#141414", num: "#F26B38", itemTitle: "#141414", itemText: "#6B6862", capTitle: "#FFFFFF", capSub: "#BDB8AE",
};

export type WhyItem = { title: string; text: string };
export type WhyUs = {
  eyebrow: string;
  /** หัวข้อ — ขึ้นบรรทัดใหม่ได้ (Enter) สูงสุด 3 บรรทัด */
  title: string;
  items: WhyItem[];
  imageMode: WhyImageMode;
  /** key ของรูปที่อัปโหลด (ใช้เมื่อ imageMode = upload) */
  imageKey: string | null;
  /** คำบรรยายบนรูป (ว่างทั้งคู่ = ไม่แสดง) */
  capTitle: string;
  capSub: string;
  /** ลิงก์เมื่อกดกล่องรูป (ว่าง = กดไม่ได้) · โหมดผลงานใช้ /projects เสมอ */
  href: string | null;
  /** กล่องรูปโปร่งใส: ไม่มีพื้นดำ/เงาไล่สี รูปแสดงเต็มไม่ครอป (เหมาะกับ PNG ตัดพื้น) คำบรรยายอยู่ใต้รูป */
  clear: boolean;
  colors: WhyColors;
};

export const WHY_DEFAULT: WhyUs = {
  eyebrow: "ทำไมต้องมองดูเว็บ",
  title: "เลือกสินค้าที่เหมาะกับงานน้ำ\nไม่ใช่แค่ไฟที่สว่าง",
  items: [
    { title: "สเปกชัดเจนทุกชิ้น", text: "บอกวัตต์ ความสว่าง ระดับกันน้ำ ขนาด และน้ำหนัก ครบก่อนตัดสินใจ" },
    { title: "แรงดันต่ำ ปลอดภัย", text: "ใช้ไฟ DC12V ต่อผ่านหม้อแปลง หรือต่อแบตเตอรี่ 12V ได้" },
    { title: "ชุดพร้อมใช้งาน", text: "หลายรุ่นมาพร้อมหม้อแปลง ท่อคอนเน็คเตอร์ และท่อหดกันน้ำ" },
    { title: "วัสดุทนทาน", text: "ฝาครอบอลูมิเนียม อายุการใช้งานมากกว่า 50,000 ชั่วโมง" },
  ],
  imageMode: "project",
  imageKey: null,
  capTitle: "แสงที่ทำงานได้จริงใต้น้ำ",
  capSub: "ภาพผลงาน / งานติดตั้งจากลูกค้า",
  href: null,
  clear: false,
  colors: {},
};

/** ข้อความบรรทัดเดียว: ตัดช่องว่างซ้ำ · จำกัดความยาว */
const line = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** หัวข้อหลายบรรทัด: เก็บการขึ้นบรรทัด (≤ 3 บรรทัด) */
const multi = (v: unknown, max: number) =>
  typeof v === "string"
    ? v.normalize("NFC").replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 3).join("\n").slice(0, max)
    : "";
/** ลิงก์ที่ยอมรับ: /path ในเว็บ (ไม่ใช่ //) หรือ http(s):// */
export const safeWhyHref = (h: unknown) => {
  const s = line(h, WHY_LIMITS.href);
  return /^(\/(?!\/)|https?:\/\/)[^\s"'<>]*$/i.test(s) ? s : null;
};

/** ShopSetting.whyUs → ค่าที่ใช้ได้ (ช่องที่ไม่มี = ค่าเดิมของร้าน) */
export function parseWhyUs(v: unknown): WhyUs {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const has = (k: string) => k in o;
  const items = (Array.isArray(o.items) ? o.items : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ title: line(x.title, WHY_LIMITS.itemTitle), text: line(x.text, WHY_LIMITS.itemText) }))
    .filter((x) => x.title)
    .slice(0, WHY_MAX_ITEMS);
  const imageKey = typeof o.imageKey === "string" && WHY_IMG_RE.test(o.imageKey) ? o.imageKey : null;
  const mode: WhyImageMode = typeof o.imageMode === "string" && o.imageMode in WHY_IMAGE_MODES ? (o.imageMode as WhyImageMode) : WHY_DEFAULT.imageMode;
  return {
    eyebrow: has("eyebrow") ? line(o.eyebrow, WHY_LIMITS.eyebrow) : WHY_DEFAULT.eyebrow,
    title: multi(o.title, WHY_LIMITS.title) || WHY_DEFAULT.title,
    items: items.length ? items : WHY_DEFAULT.items,
    // อัปโหลดแต่ไม่มีรูป = กลับไปใช้รูปผลงาน
    imageMode: mode === "upload" && !imageKey ? "project" : mode,
    imageKey,
    capTitle: has("capTitle") ? line(o.capTitle, WHY_LIMITS.capTitle) : WHY_DEFAULT.capTitle,
    capSub: has("capSub") ? line(o.capSub, WHY_LIMITS.capSub) : WHY_DEFAULT.capSub,
    href: safeWhyHref(o.href),
    clear: o.clear === true,
    colors: parseWhyColors(o.colors),
  };
}

export function parseWhyColors(v: unknown): WhyColors {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: WhyColors = {};
  for (const k of Object.keys(WHY_COLOR_KEYS) as WhyColorKey[]) {
    const c = typeof o[k] === "string" ? (o[k] as string).trim().toUpperCase() : "";
    if (WHY_COLOR_RE.test(c)) out[k] = c;
  }
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export type WhyProject = { title: string; kind: string | null; location: string | null; cover: { full: string } | null };

/** กล่องรูปที่จะแสดงจริง (ใช้ทั้ง HTML หน้าร้านและตัวอย่างในหลังบ้าน) */
export function whyVisual(cfg: WhyUs, ctx: { imageUrl?: string | null; projects?: WhyProject[] }) {
  if (cfg.imageMode === "upload" && ctx.imageUrl) return { img: ctx.imageUrl, alt: cfg.capTitle || cfg.eyebrow, capTitle: cfg.capTitle, capSub: cfg.capSub, href: cfg.href };
  if (cfg.imageMode === "project") {
    const p = (ctx.projects ?? []).find((x) => x.cover);
    if (p) {
      const sub = [p.kind, p.location].filter(Boolean).join(" · ") || "ผลงานติดตั้งจากลูกค้า";
      return { img: p.cover!.full, alt: p.title, capTitle: p.title, capSub: `${sub} — ดูผลงานติดตั้งทั้งหมด`, href: "/projects" };
    }
  }
  return { img: null, alt: "", capTitle: cfg.capTitle, capSub: cfg.capSub, href: cfg.href };
}

/** HTML ของส่วนทั้งก้อน (คลาสเดิมของหน้าร้าน: .feature / .feature-visual / .feature-list) — ข้อความทุกช่องถูก escape */
export function renderWhyHtml(cfg: WhyUs, ctx: { imageUrl?: string | null; projects?: WhyProject[] } = {}) {
  const v = whyVisual(cfg, ctx);
  // สีที่ร้านตั้ง: ส่งเป็นตัวแปร --wc (CSS ใน shop-theme.css เลือกใช้ตามโหมด) · ค่าผ่าน WHY_COLOR_RE แล้วเท่านั้น
  const wc = (k: WhyColorKey) => (cfg.colors[k] && WHY_COLOR_RE.test(cfg.colors[k]!) ? ` data-wc style="--wc:${cfg.colors[k]}"` : "");
  const cap = v.capTitle || v.capSub ? `<div class="cap">${v.capTitle ? `<b${wc("capTitle")}>${esc(v.capTitle)}</b>` : ""}${v.capSub ? `<span${wc("capSub")}>${esc(v.capSub)}</span>` : ""}</div>` : "";
  const ext = v.href && /^https?:/i.test(v.href) ? ` target="_blank" rel="noopener"` : "";
  const inner = `${v.img ? `<img src="${esc(v.img)}" alt="${esc(v.alt)}" loading="lazy" decoding="async" />` : ""}${cap}`;
  const cls = `feature-visual reveal${v.img ? " has-img" : ""}${v.img && cfg.clear ? " is-clear" : ""}`;
  const visual = v.href
    ? `<a class="${cls}" href="${esc(v.href)}"${ext} aria-label="${esc(v.capTitle || "ดูเพิ่มเติม")}">${inner}</a>`
    : `<div class="${cls}">${inner}</div>`;
  const items = cfg.items
    .map((it, i) => `<div><div class="num"${wc("num")}>${String(i + 1).padStart(2, "0")}</div><h3${wc("itemTitle")}>${esc(it.title)}</h3>${it.text ? `<p${wc("itemText")}>${esc(it.text)}</p>` : ""}</div>`)
    .join("\n        ");
  return `<!-- ==================== WHY US ==================== -->
<section class="feature" id="why" data-home="why">
  <div class="container">
    ${visual}
    <div class="reveal">
      ${cfg.eyebrow ? `<div class="eyebrow"${wc("eyebrow")}>${esc(cfg.eyebrow)}</div>` : ""}
      <h2 class="sec-title"${wc("title")}>${cfg.title.split("\n").map(esc).join("<br>")}</h2>
      <div class="feature-list">
        ${items}
      </div>
    </div>
  </div>
</section>

`;
}
