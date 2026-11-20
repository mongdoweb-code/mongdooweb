// ส่วนหัวหน้าร้าน: แถบประกาศจากตั้งค่าร้าน (ปิดได้จากหลังบ้าน) + ลิงก์ "คำถามที่พบบ่อย" เมื่อมีเนื้อหา — escape ทุกค่า
import { NAV_DEFAULT, renderDrawerNavHtml, renderNavHtml, type NavMenu } from "@/lib/nav-menu";
import { SHELL_TOP } from "./shell";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** รหัสสั้นของข้อความ — ลูกค้าที่กดปิดแถบแล้ว จะเห็นอีกครั้งเมื่อร้านเปลี่ยนข้อความ */
function shortHash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export type TopOptions = {
  announcement: { text: string; href: string | null } | null;
  freeShipMinBaht: number | null;
  hasFaq: boolean;
  /** จำนวนสินค้าทั้งหมดที่หน้า /products แสดง (รวมตัวเลือกเป็นการ์ดเดียว) — 0 = ไม่แสดงป้าย */
  productCount?: number;
  /** เมนูหลักที่ตั้งค่าจากหลังบ้าน (ไม่ส่ง = เมนูเดิม) */
  nav?: NavMenu;
};

// ไอคอนด้านขวาของแถบหัว (เปิด/ปิดได้ในตั้งค่าเมนู) — ตะกร้าแสดงเสมอ
const THEME_TG = "<button class=\"theme-tg\" type=\"button\" data-theme-toggle role=\"switch\" aria-checked=\"false\" aria-label=\"\u0e42\u0e2b\u0e21\u0e14\u0e01\u0e25\u0e32\u0e07\u0e04\u0e37\u0e19\" title=\"\u0e2a\u0e25\u0e31\u0e1a\u0e18\u0e35\u0e21\u0e01\u0e25\u0e32\u0e07\u0e27\u0e31\u0e19 / \u0e01\u0e25\u0e32\u0e07\u0e04\u0e37\u0e19\"><span class=\"tg-knob\" aria-hidden=\"true\"></span><svg class=\"tg-sun\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/></svg><svg class=\"tg-moon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z\"/></svg></button>";
const SEARCH_BTN = "<button class=\"icon-btn\" id=\"searchBtn\" aria-label=\"\u0e04\u0e49\u0e19\u0e2b\u0e32\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\" aria-expanded=\"false\" aria-controls=\"searchPanel\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" aria-hidden=\"true\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-3.5-3.5\"/></svg>\n      </button>";
const TRACK_LINK = "<a href=\"/track\" class=\"icon-btn hide-sm hide-md\" aria-label=\"\u0e15\u0e34\u0e14\u0e15\u0e32\u0e21\u0e04\u0e33\u0e2a\u0e31\u0e48\u0e07\u0e0b\u0e37\u0e49\u0e2d\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6\"/></svg>\n      </a>";

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

export function renderTopbar(o: TopOptions) {
  if (!o.announcement) return "";
  const a = o.announcement;
  const first = a.href ? `<a href="${esc(a.href)}"${/^https?:/i.test(a.href) ? ' target="_blank" rel="noopener"' : ""}>${esc(a.text)}</a>` : esc(a.text);
  const msgs = [first];
  if (o.freeShipMinBaht && o.freeShipMinBaht > 0)
    msgs.push(`<b>ส่งฟรี</b> เมื่อซื้อครบ ฿${o.freeShipMinBaht.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`);
  const ver = shortHash(`${a.text}|${a.href ?? ""}`);
  return `<div class="topbar" id="topbar" role="region" aria-label="ประกาศจากร้าน" data-ver="${ver}">
  <div class="tb-in" id="tbMsgs">${msgs.map((m, i) => `<p class="tb-msg${i ? "" : " on"}"${i ? ' aria-hidden="true"' : ""}><span>${m}</span></p>`).join("")}</div>
  <button class="tb-close" id="tbClose" type="button" aria-label="ปิดแถบประกาศ">${CLOSE_ICON}</button>
</div>
`;
}

/** เมนูมือถือ: ลิงก์ที่ลูกค้ามือถือต้องหาเจอเสมอ (ต่อท้ายถ้ายังไม่อยู่ในเมนูที่ตั้งไว้) */
const DRAWER_ALWAYS: [string, string][] = [["/track", "ติดตามคำสั่งซื้อ / แนบสลิป"], ["/quote", "ขอใบเสนอราคา"], ["/about", "เกี่ยวกับเรา"], ["/contact", "ติดต่อเรา"]];

export function renderShellTop(o: TopOptions) {
  const nav = o.nav ?? NAV_DEFAULT;
  const ctx = { productCount: o.productCount };
  const shownHrefs = new Set(nav.items.filter((i) => i.show).map((i) => i.href));
  const drawerExtra = [
    ...DRAWER_ALWAYS.filter(([h]) => !shownHrefs.has(h)),
    ...(o.hasFaq && !shownHrefs.has("/faq") ? [["/faq", "คำถามที่พบบ่อย"] as [string, string]] : []),
  ].map(([h, l]) => `<a href="${h}">${esc(l)}</a>`);
  // ซ่อนปุ่มค้นหา = คงปุ่มไว้แบบ hidden (สคริปต์หน้าร้านอ้างถึง) · ซ่อนไอคอนอื่น = ไม่ใส่
  const search = nav.icons.search ? SEARCH_BTN : SEARCH_BTN.replace("<button ", "<button hidden ");
  return SHELL_TOP.replace("{{TOPBAR}}", renderTopbar(o))
    .replace("{{NAV}}", renderNavHtml(nav, ctx))
    .replace("{{DRAWER_NAV}}", [renderDrawerNavHtml(nav, ctx), ...drawerExtra].filter(Boolean).join("\n        "))
    .replace("{{IC_THEME}}", nav.icons.theme ? THEME_TG.replace('class="theme-tg"', 'class="theme-tg hide-sm"') : "")
    .replace("{{DR_THEME}}", nav.icons.theme ? `<div class="dr-theme"><span>ธีมกลางวัน / กลางคืน</span>${THEME_TG}</div>` : "")
    .replace("{{IC_SEARCH}}", search)
    .replace("{{IC_TRACK}}", nav.icons.track ? TRACK_LINK : "")
    .replace("{{NO_WISH}}", nav.icons.wishlist ? "" : " data-no-wish");
}
