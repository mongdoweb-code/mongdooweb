// เมนูหลักหน้าร้าน (Navbar) ที่ตั้งค่าได้จากหลังบ้าน (/admin/home/nav) — ฟังก์ชันล้วน ใช้ได้ทั้งหน้าร้าน หลังบ้าน และเบราว์เซอร์
// ค่าเก็บใน ShopSetting.navMenu · {} หรือค่าผิดรูปแบบ = เมนูเดิมของร้าน (หน้าร้านต้องแสดงเมนูได้เสมอ)
// เมนูในระบบ (ลิงก์ตายตัว แก้ชื่อ/ซ่อน/เรียงได้) + ลิงก์เพิ่มเอง ≤ NAV_CUSTOM_MAX · ไอคอนด้านขวาเปิด/ปิดได้ (ตะกร้าแสดงเสมอ)

export type NavKey = string;
export type NavBuiltin = { key: string; label: string; href: string; show: boolean; note?: string };

/** เมนูในระบบ — 7 ตัวแรกแสดงเป็นค่าเริ่มต้น (เหมือนเมนูเดิม) */
export const NAV_BUILTINS: NavBuiltin[] = [
  { key: "home", label: "หน้าแรก", href: "/", show: true },
  { key: "cats", label: "หมวดสินค้า", href: "", show: true, note: "เมนูแบบเลื่อนลง แสดงหมวดสินค้าทั้งหมด" },
  { key: "all", label: "สินค้าทั้งหมด", href: "/products", show: true, note: "มีป้ายจำนวนสินค้า" },
  { key: "best", label: "สินค้าขายดี", href: "/#products", show: true },
  { key: "finder", label: "ช่วยเลือกไฟ", href: "/#finder", show: true },
  { key: "howto", label: "วิธีสั่งซื้อ", href: "/how-to-order", show: true },
  { key: "contact", label: "ติดต่อเรา", href: "/contact", show: true },
  { key: "projects", label: "ผลงานติดตั้ง", href: "/projects", show: false },
  { key: "blog", label: "บทความ", href: "/blog", show: false },
  { key: "faq", label: "คำถามที่พบบ่อย", href: "/faq", show: false },
  { key: "quote", label: "ขอใบเสนอราคา", href: "/quote", show: false },
  { key: "track", label: "ติดตามคำสั่งซื้อ", href: "/track", show: false },
  { key: "about", label: "เกี่ยวกับเรา", href: "/about", show: false },
  { key: "psu", label: "คำนวณหม้อแปลง", href: "/tools/psu-calculator", show: false },
];
const BUILTIN = new Map(NAV_BUILTINS.map((b) => [b.key, b]));
export const NAV_CUSTOM_MAX = 5;
export const NAV_LABEL_MAX = 30;
/** เมนูที่แสดงบนแถบได้พร้อมกัน (มากกว่านี้แถบเมนูจะแน่นเกิน) */
export const NAV_VISIBLE_MAX = 9;
export const NAV_ICONS = { theme: "ปุ่มสลับธีมกลางวัน/กลางคืน", search: "ค้นหาสินค้า", track: "ติดตามคำสั่งซื้อ (ไอคอนคน)", wishlist: "รายการโปรด (ไอคอนหัวใจ)" } as const;
export type NavIconKey = keyof typeof NAV_ICONS;

export type NavItem = { key: string; label: string; href: string; show: boolean; custom: boolean; newTab: boolean };
export type NavMenu = { items: NavItem[]; icons: Record<NavIconKey, boolean> };

const line = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** ลิงก์เพิ่มเอง: /path ในเว็บ (ไม่ใช่ //) หรือ https:// เท่านั้น */
export const safeNavHref = (h: unknown) => {
  const s = line(h, 300);
  return /^(\/(?!\/)|https:\/\/)[^\s"'<>]*$/i.test(s) ? s : null;
};

export const NAV_DEFAULT: NavMenu = {
  items: NAV_BUILTINS.map((b) => ({ key: b.key, label: b.label, href: b.href, show: b.show, custom: false, newTab: false })),
  icons: { theme: true, search: true, track: true, wishlist: true },
};

/** ShopSetting.navMenu → เมนูที่ใช้ได้: เรียงตามที่ตั้ง · เมนูในระบบที่ไม่มีในค่าที่บันทึก (เพิ่มใหม่ภายหลัง) ต่อท้ายแบบซ่อน */
export function parseNavMenu(v: unknown): NavMenu {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  if (!Array.isArray(o.items)) return { items: NAV_DEFAULT.items.map((i) => ({ ...i })), icons: parseIcons(o.icons) };
  const seen = new Set<string>();
  const items: NavItem[] = [];
  let customs = 0;
  for (const raw of o.items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key : "";
    const b = BUILTIN.get(key);
    if (b) {
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, label: line(r.label, NAV_LABEL_MAX) || b.label, href: b.href, show: r.show !== false, custom: false, newTab: false });
    } else if (/^c[1-9]\d?$/.test(key) && !seen.has(key) && customs < NAV_CUSTOM_MAX) {
      const label = line(r.label, NAV_LABEL_MAX), href = safeNavHref(r.href);
      if (!label || !href) continue;
      seen.add(key);
      customs++;
      items.push({ key, label, href, show: r.show !== false, custom: true, newTab: r.newTab === true && /^https:/i.test(href) });
    }
  }
  for (const b of NAV_BUILTINS) if (!seen.has(b.key)) items.push({ key: b.key, label: b.label, href: b.href, show: false, custom: false, newTab: false });
  // จำกัดจำนวนที่แสดง (ตัวที่เกินถูกซ่อน)
  let shown = 0;
  for (const it of items) if (it.show && ++shown > NAV_VISIBLE_MAX) it.show = false;
  return { items, icons: parseIcons(o.icons) };
}

function parseIcons(v: unknown): Record<NavIconKey, boolean> {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return Object.fromEntries((Object.keys(NAV_ICONS) as NavIconKey[]).map((k) => [k, o[k] !== false])) as Record<NavIconKey, boolean>;
}

/** ค่าที่บันทึกลงฐานข้อมูล (เก็บเฉพาะที่จำเป็น) */
export const navMenuToJson = (m: NavMenu) => ({
  items: m.items.map((i) => (i.custom ? { key: i.key, label: i.label, href: i.href, show: i.show, newTab: i.newTab } : { key: i.key, label: i.label, show: i.show })),
  icons: m.icons,
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const ext = (i: NavItem) => (i.newTab ? ' target="_blank" rel="noopener"' : "");
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

/** แถบเมนูบน (คอมพิวเตอร์) — คลาส/ไอดีเดิมของหน้าร้าน (megaBtn, data-nav-home, nav-all…) คงไว้ */
export function renderNavHtml(m: NavMenu, ctx: { productCount?: number } = {}) {
  return m.items
    .filter((i) => i.show)
    .map((i) => {
      if (i.key === "cats")
        return `<div class="nav-mega" id="navMega">
        <button class="nav-trigger" id="megaBtn" aria-expanded="false" aria-controls="megaPanel" aria-haspopup="true">
          <span class="t">${esc(i.label)}</span>
          ${CHEV}
        </button>
        <div class="mega" id="megaPanel" role="region" aria-label="หมวดสินค้าทั้งหมด"></div>
      </div>`;
      if (i.key === "home") return `<a href="/" data-nav-home>${esc(i.label)}</a>`;
      if (i.key === "all" && ctx.productCount && ctx.productCount > 0) {
        const num = ctx.productCount.toLocaleString("th-TH");
        return `<a href="/products" class="nav-all">${esc(i.label)}<span class="sr-only"> (${num} รายการ)</span><span class="nav-count" aria-hidden="true">${num}</span></a>`;
      }
      return `<a href="${esc(i.href)}"${ext(i)}>${esc(i.label)}</a>`;
    })
    .join("\n      ");
}

/** เมนูมือถือ (ส่วนล่างของเมนูข้าง) — หน้าแรก/หมวดสินค้าอยู่ด้านบนของเมนูข้างแล้ว จึงไม่ซ้ำ */
export function renderDrawerNavHtml(m: NavMenu, ctx: { productCount?: number } = {}) {
  return m.items
    .filter((i) => i.show && i.key !== "home" && i.key !== "cats")
    .map((i) => {
      if (i.key === "all" && ctx.productCount && ctx.productCount > 0) {
        const num = ctx.productCount.toLocaleString("th-TH");
        return `<a href="/products" class="dr-all">${esc(i.label)}<span class="sr-only"> (${num} รายการ)</span><span class="dr-count" aria-hidden="true">${num}</span></a>`;
      }
      const close = i.href.startsWith("/#") ? " data-close" : "";
      return `<a href="${esc(i.href)}"${close}${ext(i)}>${esc(i.label)}</a>`;
    })
    .join("\n        ");
}
