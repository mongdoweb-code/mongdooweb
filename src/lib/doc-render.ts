// สร้าง HTML ของเอกสาร A4 และใบปะหน้า (ย้ายจาก buildDocParts/labelHtml ในต้นแบบ)
// เป็นฟังก์ชันล้วน ใช้ได้ทั้ง server (หน้าดู/พิมพ์) และเบราว์เซอร์ (ตัวอย่างสดในตัวแก้ไข) — ทุกข้อความ escape แล้ว
import { addrText, bahtText, calcTotals, code128Svg, docDate, docDateTime, fmtTaxId, lineSatang, money, qtyFmt, type Addr, type DocTypeT, type VatModeT } from "./doc-calc";

export type CustSnap = {
  code?: string; kind?: "COMPANY" | "PERSON"; name?: string; taxId?: string; branch?: string; contact?: string; phone?: string; email?: string;
  address?: Addr; shipTo?: { name?: string; phone?: string; address?: Addr } | null;
};
export type DocLine = { sku: string; name: string; detail: string; unit: string; qtyMilli: number; priceSatang: number; discountSatang: number };
export type ShopHead = {
  name: string; address: string; phone: string; line: string; email: string; taxId: string; branch: string; logo: string;
  era: "AD" | "BE"; showSignature: boolean; banks: { name: string; account: string; holder: string }[]; promptpayName: string;
};
export type DocView = {
  type: DocTypeT; no: string | null; status: string; issueDate: string; validUntil: string; dueDate: string;
  customer: CustSnap; items: DocLine[]; discountSatang: number; vatMode: VatModeT; vatRateBp: number;
  paymentMethod: string; paymentTerms: string; carrier: string; note: string; ref: string; voidReason: string;
  paidSatang: number; payRef: string; qr: string | null; printedAt: string; shop: ShopHead;
};

export const DOC_META: Record<DocTypeT, { th: string; en: string; short: string; path: string }> = {
  QUOTATION: { th: "ใบเสนอราคา", en: "QUOTATION", short: "QT", path: "QUOTATION" },
  INVOICE: { th: "ใบแจ้งหนี้ / ใบวางบิล", en: "INVOICE / BILLING NOTE", short: "IV", path: "INVOICE" },
  RECEIPT: { th: "ใบเสร็จรับเงิน", en: "RECEIPT", short: "RC", path: "RECEIPT" },
};
const SIGN: Record<DocTypeT, [string, string]> = { QUOTATION: ["ผู้เสนอราคา", "ผู้อนุมัติสั่งซื้อ"], INVOICE: ["ผู้วางบิล", "ผู้รับวางบิล"], RECEIPT: ["ผู้รับเงิน", "ผู้รับสินค้า"] };

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");

export const docTitle = (v: Pick<DocView, "type" | "vatMode">) => (v.type === "RECEIPT" && v.vatMode !== "NONE" ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : DOC_META[v.type].th);
export const docTotals = (v: Pick<DocView, "items" | "discountSatang" | "vatMode" | "vatRateBp">) => calcTotals(v.items, v.discountSatang, v.vatMode, v.vatRateBp);

export type DocParts = { head1: string; headN: string; parties: string; thead: string; rows: string[]; tail: string; foot: string; mark: string };

export function buildDocParts(d: DocView): DocParts {
  const s = d.shop, era = s.era, t = docTotals(d);
  const c = d.customer ?? {}, isCo = c.kind === "COMPANY", vatOn = d.vatMode !== "NONE";
  const title = docTitle(d), en = d.type === "RECEIPT" && vatOn ? "RECEIPT / TAX INVOICE" : DOC_META[d.type].en;
  const label = d.no || "ฉบับร่าง";
  const outstanding = Math.max(0, t.grand - d.paidSatang);

  const meta: [string, string][] = [["เลขที่", d.no ? `<b class="sh-no">${esc(d.no)}</b>` : '<b class="sh-no draft">ฉบับร่าง</b>'], ["วันที่", esc(docDate(d.issueDate, era))]];
  if (d.type === "QUOTATION") meta.push(["ยืนราคาถึง", esc(docDate(d.validUntil, era))]);
  if (d.type === "INVOICE") meta.push(["ครบกำหนดชำระ", esc(docDate(d.dueDate, era))]);
  if (d.ref) meta.push(["อ้างอิง", esc(d.ref)]);
  if (d.type === "RECEIPT") meta.push(["วันที่พิมพ์", esc(d.printedAt)]);
  const shopTax = s.taxId ? `<div>เลขประจำตัวผู้เสียภาษี ${esc(fmtTaxId(s.taxId))}${s.branch ? ` <span class="nw">(${esc(s.branch)})</span>` : ""}</div>` : "";
  const contact = [s.phone && `โทร ${esc(s.phone)}`, s.line && `ไอดีไลน์ ${esc(s.line)}`, s.email && esc(s.email)].filter(Boolean).join(" · ");
  const head1 = `<header class="sh-head">
      <div class="sh-shop">${s.logo ? `<img class="sh-logo" src="${esc(s.logo)}" alt="">` : ""}
        <div class="sh-shoptx"><b>${esc(s.name)}</b><div>${esc(s.address)}</div><div>${contact}</div>${shopTax}</div></div>
      <div class="sh-tbox"><div class="sh-title${title.length > 16 ? " long" : ""}">${esc(title)}<small>${en}</small></div>
        <dl class="sh-meta">${meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
        ${d.no ? code128Svg(d.no, "sh-bc") : ""}</div>
    </header>`;
  const headN = `<header class="sh-headn"><b>${esc(s.name)}</b><span><b>${esc(title)}</b> ${esc(label)} · หน้า {{P}} / {{N}}</span></header>`;

  const info: [string, string][] = [["การชำระเงิน", esc(d.paymentMethod || "—")]];
  if (d.type === "INVOICE") info.push(["ยอดค้างชำระ", `<b>${money(outstanding)}</b>`]);
  if (d.carrier && d.type !== "QUOTATION") info.push(["ขนส่ง", esc(d.carrier)]);
  info.push(["หน้า", "{{P}} / {{N}}"]);
  const branch = isCo ? c.branch || "สำนักงานใหญ่" : "";
  const st = c.shipTo;
  const custLbl = d.type === "INVOICE" ? "ส่งเบิกไปที่ / BILL TO" : "ลูกค้า / CUSTOMER";
  const parties = `<section class="sh-parties">
      <div class="sh-box sh-info"><dl class="kvs">${info.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></div>
      <div class="sh-box sh-cust"><h4>${custLbl}</h4>
        ${c.name ? `<div class="cust-top">${c.code ? `<span class="cust-code">รหัสลูกค้า ${esc(c.code)}</span>` : ""}<b class="cust-name">${esc(c.name)}</b></div>
        <div><span class="k">ที่อยู่</span> ${branch ? `<span class="nw">(${esc(branch)})</span> ` : ""}${esc(addrText(c.address)) || "—"}</div>
        <div>${c.taxId ? `<span class="k">เลขประจำตัวผู้เสียภาษี</span> ${esc(fmtTaxId(c.taxId))}${isCo ? ` <span class="k">สาขา</span> ${esc(branch)}` : ""} &nbsp; ` : ""}${c.phone ? `<span class="k">โทร</span> ${esc(c.phone)}` : ""}${c.contact ? ` &nbsp; <span class="k">ติดต่อ</span> ${esc(c.contact)}` : ""}</div>
        ${st && st.name && d.type !== "QUOTATION" ? `<div class="ship-to"><span class="k">ส่งของที่</span> ${esc(st.name)}${st.phone ? " โทร " + esc(st.phone) : ""} · ${esc(addrText(st.address))}</div>` : ""}`
        : '<div class="cust-empty">ยังไม่ได้เลือกลูกค้า</div>'}
      </div></section>`;

  const hasDisc = d.items.some((i) => i.discountSatang > 0);
  const thead = `<thead><tr><th class="c w-no">ลำดับ</th><th class="w-sku">รหัสสินค้า</th><th>รายการสินค้า</th><th class="w-unit">หน่วย</th><th class="n w-price">ราคาขาย/บาท</th><th class="n w-qty">จำนวน</th>${hasDisc ? '<th class="n w-disc">ส่วนลด</th>' : ""}<th class="n w-amt">ราคารวม/บาท</th></tr></thead>`;
  const rows = d.items.length
    ? d.items.map((it, i) => `<tr><td class="c">${i + 1}</td><td class="sku">${esc(it.sku)}</td><td class="nm">${esc(it.name) || '<span class="ph-txt">(ไม่มีชื่อรายการ)</span>'}${it.detail ? `<small>${esc(it.detail)}</small>` : ""}</td><td>${esc(it.unit)}</td>
      <td class="n">${money(it.priceSatang)}</td><td class="n">${qtyFmt(it.qtyMilli)}</td>${hasDisc ? `<td class="n">${it.discountSatang ? money(it.discountSatang) : ""}</td>` : ""}<td class="n">${money(lineSatang(it))}</td></tr>`)
    : [`<tr class="empty-row"><td colspan="${hasDisc ? 8 : 7}">ยังไม่มีรายการสินค้า</td></tr>`];

  const tot: [string, number][] = [["ราคารวมสินค้า", t.subtotal], ["ส่วนลด", t.discount]];
  if (t.discount) tot.push(["ราคาหลังหักส่วนลด", t.afterDiscount]);
  if (vatOn) tot.push(["มูลค่าก่อนภาษีมูลค่าเพิ่ม", t.beforeVat], [`ภาษีมูลค่าเพิ่ม ${d.vatRateBp / 100}%`, t.vat]);
  let payBox = "";
  if (d.type === "INVOICE") {
    payBox = `<div class="sh-pay">${d.qr ? `<img class="sh-qr" src="${esc(d.qr)}" alt="PromptPay QR">` : ""}<div><h5>ช่องทางชำระเงิน</h5>
      ${s.banks.map((b) => `<div>${esc(b.name)} เลขที่บัญชี <b>${esc(b.account)}</b>${b.holder ? ` ชื่อบัญชี ${esc(b.holder)}` : ""}</div>`).join("")}
      ${d.qr ? `<div>สแกนพร้อมเพย์${s.promptpayName ? " " + esc(s.promptpayName) : ""} ยอด <b>${money(outstanding)}</b> บาท</div>` : ""}
      <div class="mut">โอนแล้วกรุณาแจ้งสลิป${s.line ? " ทาง LINE " + esc(s.line) : ""} พร้อมเลขที่ ${esc(label)}</div></div></div>`;
  }
  if (d.type === "RECEIPT") payBox = `<div class="sh-paid"><b>ได้รับเงินถูกต้องแล้ว</b> ชำระโดย ${esc(d.paymentMethod || "—")}${d.payRef ? ` · อ้างอิง ${esc(d.payRef)}` : ""}</div>`;
  const terms = d.paymentTerms.trim(), note = d.note.trim();
  const sign = s.showSignature ? `<section class="sh-sign">${SIGN[d.type].map((l) => `<div><div class="sg-line"></div><b>${l}</b><span>วันที่ ______/______/__________</span></div>`).join("")}</section>` : "";
  const tail = `<div class="sh-end">
      <section class="sh-tail">
        <div class="sh-tl">
          <div class="sh-words"><span>จำนวนเงิน (ตัวอักษร)</span><b>(${bahtText(t.grand)})</b></div>
          ${note ? `<div class="sh-note"><h5>หมายเหตุ</h5><p>${nl2br(note)}</p></div>` : ""}
          ${terms ? `<div class="sh-note"><h5>${d.type === "QUOTATION" ? "เงื่อนไข" : "เงื่อนไขการชำระเงิน"}</h5><p>${nl2br(terms)}</p></div>` : ""}
          ${payBox}
        </div>
        <dl class="sh-tot">${tot.map(([k, v]) => `<dt>${k}</dt><dd>${money(v)}</dd>`).join("")}
          <dt class="g">ราคารวมสุทธิ/บาท</dt><dd class="g">${money(t.grand)}</dd>
          ${d.type === "INVOICE" && d.paidSatang ? `<dt>ชำระแล้ว</dt><dd>${money(d.paidSatang)}</dd><dt class="o">คงค้างชำระ</dt><dd class="o">${money(outstanding)}</dd>` : ""}</dl>
      </section>
      ${sign}
      <div class="sh-thanks">*** ขอบคุณที่ใช้บริการ ***</div>
    </div>`;
  const foot = `<footer class="sh-foot"><span>${esc(label)} · พิมพ์เมื่อ ${esc(d.printedAt)}</span><span>หน้า {{P}} / {{N}}</span></footer>`;
  const mark = d.status === "VOID" ? `<div class="sh-mark void"><span>ยกเลิก</span>${d.voidReason ? `<em>${esc(d.voidReason)}</em>` : ""}</div>` : d.status === "DRAFT" ? '<div class="sh-mark draft"><span>ฉบับร่าง</span></div>' : "";
  return { head1, headN, parties, thead, rows, tail, foot, mark };
}

/** แบ่งหน้า (ต้องรันในเบราว์เซอร์): วัดความสูงจริงของแถว → [[rowIndex…], …] หัวตารางซ้ำทุกหน้า, ยอดรวม/ลายเซ็นอยู่หน้าสุดท้าย */
export function paginateDoc(P: DocParts, m: HTMLElement): number[][] {
  m.innerHTML = `<div class="sheet"><div class="sh-body">${P.head1}${P.parties}<table class="sh-tbl">${P.thead}<tbody>${P.rows.join("")}</tbody></table>${P.tail}</div>${P.foot}</div>
    <div class="sheet"><div class="sh-body">${P.headN}<table class="sh-tbl">${P.thead}<tbody></tbody></table><div class="sh-cont">มีต่อหน้าถัดไป</div></div>${P.foot}</div>`;
  const [s1, s2] = m.querySelectorAll<HTMLElement>(".sheet");
  const b1 = s1.querySelector<HTMLElement>(".sh-body")!, tb = b1.querySelector<HTMLTableElement>(".sh-tbl")!, end = b1.querySelector<HTMLElement>(".sh-end")!;
  const avail = b1.clientHeight, SAFE = 4;
  const rowH = [...tb.tBodies[0].rows].map((r) => r.getBoundingClientRect().height);
  const top1 = tb.offsetTop + tb.tHead!.offsetHeight;
  const tailH = end.offsetTop + end.offsetHeight - (tb.offsetTop + tb.offsetHeight);
  const tb2 = s2.querySelector<HTMLTableElement>(".sh-tbl")!, cont = s2.querySelector<HTMLElement>(".sh-cont")!;
  const topN = tb2.offsetTop + tb2.tHead!.offsetHeight, contH = cont.offsetHeight + 6;
  const cap1 = avail - top1 - SAFE, capN = avail - topN - SAFE;
  const pages: number[][] = [[]];
  let used = 0, cap = cap1;
  rowH.forEach((h, i) => {
    if (pages[pages.length - 1].length && used + h > cap - contH) { pages.push([]); used = 0; cap = capN; }
    pages[pages.length - 1].push(i);
    used += h;
  });
  if (used + tailH > cap) {
    const last = pages[pages.length - 1], moved: number[] = [];
    if (last.length > 1 && rowH[last[last.length - 1]] + tailH <= capN) moved.push(last.pop()!);
    pages.push(moved);
  }
  m.innerHTML = "";
  return pages;
}

/** HTML ของทุกแผ่น (ตัวอย่างบนจอ = งานพิมพ์) */
export function sheetsHtml(P: DocParts, pages: number[][], copy?: string) {
  const N = pages.length;
  return pages
    .map((idx, pi) => {
      const last = pi === N - 1;
      const table = idx.length ? `<table class="sh-tbl">${P.thead}<tbody>${idx.map((i) => P.rows[i]).join("")}</tbody></table>` : "";
      return `<div class="sheet" data-page="${pi + 1}" data-pages="${N}">${copy ? `<div class="sh-copy">${esc(copy)}</div>` : ""}<div class="sh-body">${pi === 0 ? P.head1 + P.parties : P.headN}${table}${last ? P.tail : '<div class="sh-cont">มีต่อหน้าถัดไป</div>'}</div>${P.foot}${P.mark}</div>`
        .replace(/\{\{P\}\}/g, String(pi + 1)).replace(/\{\{N\}\}/g, String(N));
    })
    .join("");
}

export const printedAtNow = (era: "AD" | "BE") => docDateTime(new Date(), era);

// =========================================================
// ใบปะหน้าส่งของ — A6 100×150 มม. หรือ A4 4 ใบต่อแผ่น
// =========================================================
export const MARKS = {
  fragile: ["ระวังแตก", '<path d="M7 3h10l-.6 5.5a4.4 4.4 0 0 1-8.8 0z"/><path d="M12 12.5V20M8.5 21h7"/><path d="m11 4.5 1.4 2-1.6 1.6 1.4 1.6"/>'],
  noThrow: ["ห้ามโยน", '<rect x="5" y="9" width="10" height="10"/><path d="M15 9l4-4M16 5h3v3"/><path d="M3 3l18 18"/>'],
  upright: ["ตั้งขึ้น", '<path d="M8 19V5M5 8l3-3 3 3M16 19V5M13 8l3-3 3 3"/><path d="M4 21.5h16"/>'],
} as const;
export type MarkKey = keyof typeof MARKS;
export type LabelData = { ref: string; name: string; phone: string; addr: string; zip: string; carrier: string; items: { name: string; qtyMilli: number }[] };
export type LabelOpts = { size: "A6" | "A4"; boxes: number; codSatang: number; marks: Record<MarkKey, boolean>; showItems: boolean };
export type Sender = { name: string; phone: string; address: string; logo: string };

function labelHtml(L: LabelData, o: LabelOpts, s: Sender, b: number, nb: number) {
  const zip = String(L.zip || "").replace(/\D/g, "").slice(0, 5).padEnd(5, " ").split("");
  const marks = (Object.keys(MARKS) as MarkKey[]).filter((k) => o.marks[k]);
  return `<section class="label">
    <div class="lb-top"><div class="lb-from"><div class="lb-k">ผู้ส่ง · FROM</div><b>${esc(s.name)}</b>${s.phone ? ` <span>โทร ${esc(s.phone)}</span>` : ""}<div class="lb-fa">${esc(s.address)}</div></div>
      ${s.logo ? `<img class="lb-logo" src="${esc(s.logo)}" alt="">` : ""}</div>
    <div class="lb-to"><div class="lb-k">ผู้รับ · TO</div>
      <div class="lb-name">${esc(L.name)}</div><div class="lb-phone">โทร ${esc(L.phone)}</div>
      <div class="lb-addr">${esc(L.addr)}</div>
      <div class="lb-zip" aria-label="รหัสไปรษณีย์ ${esc(L.zip)}">${zip.map((c) => `<span>${esc(c.trim())}</span>`).join("")}</div></div>
    <div class="lb-info"><div class="lb-bc">${L.ref ? code128Svg(L.ref, "lb-bcs") : ""}<div class="lb-ref">${esc(L.ref)}</div></div>
      <div class="lb-box"><small>กล่องที่</small><b>${b}/${nb}</b></div></div>
    <div class="lb-row"><span>ขนส่ง: <b>${esc(L.carrier || "—")}</b></span>${o.codSatang > 0 ? `<span class="lb-cod">เก็บเงินปลายทาง ฿${money(o.codSatang)}</span>` : ""}</div>
    ${marks.length ? `<div class="lb-marks">${marks.map((k) => `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MARKS[k][1]}</svg>${MARKS[k][0]}</span>`).join("")}</div>` : ""}
    ${o.showItems && L.items.length ? `<ul class="lb-items">${L.items.slice(0, 6).map((i) => `<li><span>${esc(i.name)}</span><span>×${qtyFmt(i.qtyMilli).replace(/\.00$/, "")}</span></li>`).join("")}${L.items.length > 6 ? `<li><span>และอีก ${L.items.length - 6} รายการ</span><span></span></li>` : ""}</ul>` : ""}
  </section>`;
}

/** ทุกใบ (1 ใบต่อกล่อง) — A4 จัด 4 ใบต่อแผ่น */
export function labelSetHtml(list: LabelData[], o: LabelOpts, s: Sender) {
  const all: string[] = [];
  const nb = Math.min(50, Math.max(1, Math.round(o.boxes) || 1));
  list.forEach((L) => { for (let b = 1; b <= nb; b++) all.push(labelHtml(L, o, s, b, nb)); });
  if (o.size !== "A4") return all.join("");
  const out: string[] = [];
  for (let i = 0; i < all.length; i += 4) out.push(`<div class="lsheet">${all.slice(i, i + 4).join("")}</div>`);
  return out.join("");
}

// =========================================================
// สถานะที่แสดง (คำนวณจากสถานะในฐานข้อมูล + วันครบกำหนด)
// =========================================================
export const DOC_ST = {
  draft: ["ฉบับร่าง", "gray"], open: ["รอตอบรับ", "pend"], accepted: ["ตอบรับแล้ว", "ok"], rejected: ["ไม่ตอบรับ", "bad"], expired: ["หมดอายุ", "gray"],
  unpaid: ["ค้างชำระ", "pend"], partial: ["ชำระบางส่วน", "info"], paid: ["ชำระแล้ว", "ok"], overdue: ["เกินกำหนด", "bad"], issued: ["ออกแล้ว", "ok"], void: ["ยกเลิก", "void"],
} as const;
export type DocSt = keyof typeof DOC_ST;
export const DOC_TABS: Record<DocTypeT, [DocSt | "all", string][]> = {
  QUOTATION: [["all", "ทั้งหมด"], ["draft", "ฉบับร่าง"], ["open", "รอตอบรับ"], ["accepted", "ตอบรับแล้ว"], ["rejected", "ไม่ตอบรับ"], ["expired", "หมดอายุ"], ["void", "ยกเลิก"]],
  INVOICE: [["all", "ทั้งหมด"], ["draft", "ฉบับร่าง"], ["unpaid", "ค้างชำระ"], ["partial", "ชำระบางส่วน"], ["overdue", "เกินกำหนด"], ["paid", "ชำระแล้ว"], ["void", "ยกเลิก"]],
  RECEIPT: [["all", "ทั้งหมด"], ["draft", "ฉบับร่าง"], ["issued", "ออกแล้ว"], ["void", "ยกเลิก"]],
};
/** วันที่ทั้งหมดเป็น "YYYY-MM-DD" ตามเวลาไทย */
export function displayStatus(d: { type: DocTypeT; status: string; validUntil: string; dueDate: string; paidSatang: number; grandSatang: number }, today: string): DocSt {
  if (d.status === "VOID") return "void";
  if (d.status === "DRAFT") return "draft";
  if (d.type === "QUOTATION") {
    if (d.status === "ACCEPTED") return "accepted";
    if (d.status === "REJECTED") return "rejected";
    return d.validUntil && d.validUntil < today ? "expired" : "open";
  }
  if (d.type === "INVOICE") {
    if (d.paidSatang >= d.grandSatang) return "paid";
    if (d.dueDate && d.dueDate < today) return "overdue";
    return d.paidSatang > 0 ? "partial" : "unpaid";
  }
  return "issued";
}
