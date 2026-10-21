// เติมข้อมูลร้านจริง (จากหน้าตั้งค่าร้าน) ลงในท้ายเว็บที่ย้ายมาจากต้นแบบ — escape ทุกค่า
import { formatPhone } from "@/lib/format";
import { SHELL_BOTTOM } from "./shell";

type ShopInfo = {
  phone: string; email: string | null; lineId: string | null; lineUrl: string | null; address: string; taxId: string | null;
  website: string | null; facebookUrl: string | null; youtubeUrl: string | null; tiktokUrl: string | null; businessHours: string | null;
};

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeUrl = (u: string | null) => (u && /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

const ICON = {
  line: '<path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s5.9-3.5 8.1-6C21.4 14.3 22 12.7 22 11c0-4.4-4.5-8-10-8zM8.3 13.4H6.3c-.3 0-.5-.2-.5-.5V9c0-.3.2-.5.5-.5s.5.2.5.5v3.4h1.5c.3 0 .5.2.5.5s-.2.5-.5.5zm2.1-.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9c0-.3.2-.5.5-.5s.5.2.5.5zm4.8 0c0 .2-.1.4-.3.5h-.2c-.2 0-.3-.1-.4-.2l-2-2.8v2.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9c0-.2.1-.4.3-.5h.2c.2 0 .3.1.4.2l2 2.8V9c0-.3.2-.5.5-.5s.5.2.5.5zm3.2-2.5c.3 0 .5.2.5.5s-.2.5-.5.5h-1.5v1h1.5c.3 0 .5.2.5.5s-.2.5-.5.5h-2c-.3 0-.5-.2-.5-.5V9c0-.3.2-.5.5-.5h2c.3 0 .5.2.5.5s-.2.5-.5.5h-1.5v1z"/>',
  facebook: '<path d="M14 8h3V4h-3c-2.8 0-4 1.8-4 4.3V10H7v4h3v7h4v-7h3l1-4h-4V8.6c0-.4.3-.6.6-.6z"/>',
  youtube: '<path d="M21.6 7.2c-.2-.9-.9-1.6-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8c.2.9.9 1.6 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z"/>',
  tiktok: '<path d="M16.5 3c.4 2.2 1.8 3.6 4 3.8v3.1c-1.5 0-2.8-.4-4-1.2v6.1c0 3.4-2.5 5.7-5.6 5.7S5.3 18.3 5.3 15c0-3.4 2.9-5.9 6.4-5.4v3.2c-1.6-.4-3.2.6-3.2 2.2 0 1.3 1 2.3 2.4 2.3 1.5 0 2.4-1 2.4-2.6V3z"/>',
};

export function renderFooter(s: ShopInfo, opts: { hasFaq?: boolean } = {}) {
  const tel = s.phone.replace(/[^\d+]/g, "");
  const rows = [
    s.lineId && `<li><span>LINE</span><a href="#" data-line target="_blank" rel="noopener">${esc(s.lineId)}</a></li>`,
    tel && `<li><span>โทร</span><a href="tel:${esc(tel)}">${esc(formatPhone(s.phone))}</a></li>`,
    s.email && `<li><span>อีเมล</span><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>`,
    s.businessHours && `<li><span>เวลาทำการ</span>${esc(s.businessHours)}</li>`,
    s.address && `<li><span>ที่อยู่</span>${esc(s.address)}</li>`,
    s.taxId && `<li><span>เลขผู้เสียภาษี</span>${esc(s.taxId)}</li>`,
  ].filter(Boolean);
  const social = [
    ["line", s.lineUrl, "LINE Official Account มองดูเว็บ"],
    ["facebook", safeUrl(s.facebookUrl), "Facebook มองดูเว็บ"],
    ["youtube", safeUrl(s.youtubeUrl), "YouTube มองดูเว็บ"],
    ["tiktok", safeUrl(s.tiktokUrl), "TikTok มองดูเว็บ"],
  ]
    .filter(([, url]) => url)
    .map(([k, url, label]) => `<a href="${k === "line" ? "#" : esc(url)}"${k === "line" ? " data-line" : ""} target="_blank" rel="noopener" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICON[k as keyof typeof ICON]}</svg></a>`)
    .join("");
  const site = safeUrl(s.website)?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "มองดูเว็บ.com";
  return SHELL_BOTTOM.replace("{{CONTACT}}", `<ul class="contact">${rows.join("")}</ul>`)
    .replace("{{SOCIAL}}", social ? `<div class="social">${social}</div>` : "")
    .replace("{{SITE}}", esc(site))
    .replace("{{FAQ_LI}}", opts.hasFaq ? '\n          <li><a href="/faq">คำถามที่พบบ่อย</a></li>' : "");
}
