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

/** ลิงก์เพิ่มเพื่อน LINE: ใช้ลิงก์จากหน้าตั้งค่าร้าน ถ้าไม่มีสร้างจาก LINE ID (เช่น @mongdoweb) */
export function lineAddUrl(s: Pick<ShopInfo, "lineId" | "lineUrl">) {
  const url = safeUrl(s.lineUrl);
  if (url) return url;
  const id = s.lineId?.trim();
  return id && /^@?[\w.-]{2,40}$/.test(id) ? `https://line.me/R/ti/p/~${id}` : null;
}

/** ไอคอนเส้น 24×24 (stroke) ของท้ายเว็บ — วาดเอง ไม่พึ่งไลบรารี */
const LI: Record<string, string> = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  wallet: '<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M3 6.5A2.5 2.5 0 0 0 5.5 9H20v6h-4a3 3 0 0 1 0-6"/><circle cx="16.5" cy="12" r=".6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 4"/><path d="M12 17.3h.01"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19c0 1.4-1.6 2-4 2h-2"/>',
  list: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 3.5h6V6H9zM9 11h6M9 15h4"/>',
  truck: '<path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8h.01"/>',
  chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2"/>',
  user: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 10.3-5.3M15 18l2 2 4-4"/>',
  phone: '<path d="M5 4h3.5l1.5 4-2 1.3a11 11 0 0 0 6.7 6.7L16 14l4 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  bank: '<path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18M12 3l9 5H3z"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const ic = (k: string, cls = "f-ic") => `<span class="${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${LI[k]}</svg></span>`;
const head = (k: string, text: string, extra = "") => `<h2 class="f-h${extra}">${ic(k, "f-hi")}<span>${text}</span></h2>`;

export function renderFooter(s: ShopInfo, opts: { hasFaq?: boolean; lineQrSvg?: string | null } = {}) {
  const tel = s.phone.replace(/[^\d+]/g, "");
  const row = (k: string, label: string, value: string) => `<li>${ic(k, "c-ic")}<span class="c-tx"><small>${label}</small>${value}</span></li>`;
  const rows = [
    s.lineId && row("chat", "LINE", `<a href="#" data-line target="_blank" rel="noopener">${esc(s.lineId)}</a>`),
    tel && row("phone", "โทร", `<a href="tel:${esc(tel)}">${esc(formatPhone(s.phone))}</a>`),
    s.email && row("mail", "อีเมล", `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`),
    s.businessHours && row("clock", "เวลาทำการ", `<span>${esc(s.businessHours)}</span>`),
    s.address && row("pin", "ที่อยู่", `<span>${esc(s.address)}</span>`),
    s.taxId && row("receipt", "เลขผู้เสียภาษี", `<span>${esc(s.taxId)}</span>`),
  ].filter(Boolean);
  const help = (
    [
      ["/how-to-order", "list", "วิธีสั่งซื้อและชำระเงิน"],
      ["/track", "truck", "แจ้งชำระเงิน / ติดตามพัสดุ"],
      ["/quote", "file", "ขอใบเสนอราคา"],
      opts.hasFaq ? ["/faq", "help", "คำถามที่พบบ่อย"] : null,
      ["/warranty", "shield", "การรับประกันและเคลม"],
      ["/about", "info", "เกี่ยวกับเรา"],
      ["/contact", "chat", "ติดต่อเรา"],
      ["/privacy", "lock", "นโยบายความเป็นส่วนตัว"],
      ["/privacy/request", "user", "คำขอข้อมูลส่วนบุคคล (PDPA)"],
    ].filter(Boolean) as string[][]
  )
    .map(([href, k, t]) => `<li><a href="${href}">${ic(k)}<span>${t}</span></a></li>`)
    .join("");
  const social = [
    // LINE แสดงเป็น QR ด้านบนแทนไอคอน (ถ้าสร้าง QR ได้)
    ["line", opts.lineQrSvg ? null : s.lineUrl, "LINE Official Account มองดูเว็บ"],
    ["facebook", safeUrl(s.facebookUrl), "Facebook มองดูเว็บ"],
    ["youtube", safeUrl(s.youtubeUrl), "YouTube มองดูเว็บ"],
    ["tiktok", safeUrl(s.tiktokUrl), "TikTok มองดูเว็บ"],
  ]
    .filter(([, url]) => url)
    .map(([k, url, label]) => `<a href="${k === "line" ? "#" : esc(url)}"${k === "line" ? " data-line" : ""} target="_blank" rel="noopener" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICON[k as keyof typeof ICON]}</svg></a>`)
    .join("");
  const site = safeUrl(s.website)?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "มองดูเว็บ.com";
  // QR เพิ่มเพื่อน LINE — svg สร้างจากไลบรารี qrcode ฝั่งเซิร์ฟเวอร์ (ไม่มีข้อความจากผู้ใช้ปนอยู่)
  const lineQr = opts.lineQrSvg
    ? `<a class="f-qr" href="#" data-line target="_blank" rel="noopener">
          <span class="f-qr-img" aria-hidden="true">${opts.lineQrSvg}</span>
          <span class="f-qr-txt"><span class="f-qr-badge" aria-hidden="true">LINE</span><b>สแกนเพิ่มเพื่อน</b>${s.lineId ? `<span class="f-qr-id">${esc(s.lineId)}</span>` : ""}<small>สอบถามสินค้า ขอใบเสนอราคา ตอบไว</small></span>
        </a>`
    : "";
  const grid = `<div class="footer-grid">
      <div class="f-col f-brand">
        <div class="logo"><div class="logo-mark"><span></span></div><div>มองดูเว็บ<small>MONGDOWEB LED</small></div></div>
        <p class="about">ร้านจำหน่ายไฟ LED สำหรับงานใต้น้ำ สระว่ายน้ำ น้ำพุ สวน และอาคาร คัดสรรสินค้ากันน้ำ ทนทาน พร้อมรับประกัน</p>
        ${lineQr}
        ${social ? `<div class="social">${social}</div>` : ""}
      </div>
      <div class="f-col">
        ${head("grid", "หมวดยอดนิยม")}
        <ul id="footerCats" class="f-links"></ul>
        <a class="f-more" href="/products"><span>ดูสินค้าทั้งหมด</span>${ic("arrow")}</a>
        ${head("wallet", "ช่องทางชำระเงิน", " f-h2")}
        <div class="f-pay">
          <span>${ic("bank")}โอนผ่านธนาคาร</span>
          <span>${ic("qr")}QR PromptPay</span>
        </div>
      </div>
      <div class="f-col">
        ${head("help", "ช่วยเหลือ")}
        <ul class="f-links">${help}</ul>
      </div>
      <div class="f-col">
        ${head("headset", "ติดต่อเรา")}
        <ul class="contact">${rows.join("")}</ul>
        <div class="line-cta">
          <div class="lc-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor">${ICON.line}</svg></div>
          <div><b>เพิ่มเพื่อนทาง LINE</b><small>รับโปรและปรึกษาฟรี</small></div>
          <a href="#" class="btn btn-line" data-line target="_blank" rel="noopener">เพิ่มเพื่อน</a>
        </div>
      </div>
    </div>`;
  return SHELL_BOTTOM.replace("{{FOOTER_GRID}}", grid).replace("{{SITE}}", esc(site));
}
