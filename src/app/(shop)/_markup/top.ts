// ส่วนหัวหน้าร้าน: แถบประกาศจากตั้งค่าร้าน (ปิดได้จากหลังบ้าน) + ลิงก์ "คำถามที่พบบ่อย" เมื่อมีเนื้อหา — escape ทุกค่า
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
};

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

export function renderShellTop(o: TopOptions) {
  return SHELL_TOP.replace("{{TOPBAR}}", renderTopbar(o)).replace("{{FAQ_DRAWER}}", o.hasFaq ? '\n        <a href="/faq">คำถามที่พบบ่อย</a>' : "");
}
