// สร้าง HTML ของเอกสาร A4 และใบปะหน้า (ย้ายจาก buildDocParts/labelHtml ในต้นแบบ)
// เป็นฟังก์ชันล้วน ใช้ได้ทั้ง server (หน้าดู/พิมพ์) และเบราว์เซอร์ (ตัวอย่างสดในตัวแก้ไข) — ทุกข้อความ escape แล้ว
import { addrText, bahtText, calcTotals, code128Svg, docDate, docDateTime, fmtTaxId, lineSatang, money, qtyFmt, type Addr, type DocTypeT, type VatModeT } from "./doc-calc";

/** ที่อยู่ร้านบนหัวเอกสาร: บรรทัดเดียว (ยาวมาก = ตัวเล็กลง · ยาวเกินพื้นที่จริง ๆ ค่อยตัดบรรทัด) */
const oneLine = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();
const addrCls = (s: string) => {
  const n = oneLine(s).length;
  return n > 110 ? " wrap" : n > 80 ? " sm" : "";
};

/** แถวติดต่อของลูกค้า: โทร (ทุกเบอร์) · โทรสาร · อีเมล — ว่างทั้งหมด = ไม่พิมพ์แถว */
export function custContact(c: CustSnap) {
  const phones = c.phones?.length ? c.phones : c.phone ? [c.phone] : [];
  const parts = [
    phones.length ? `<span class="nw"><span class="k">โทร</span> ${phones.map((p) => `<span class="nw">${esc(p)}</span>`).join(", ")}</span>` : "",
    c.fax ? `<span class="nw"><span class="k">โทรสาร</span> ${esc(c.fax)}</span>` : "",
    c.email ? `<span class="nw"><span class="k">อีเมล</span> ${esc(c.email)}</span>` : "",
  ].filter(Boolean);
  return parts.length ? `<div class="cust-ct">${parts.join(" &nbsp; ")}</div>` : "";
}

export type CustSnap = {
  code?: string; kind?: "COMPANY" | "PERSON"; name?: string; taxId?: string; branch?: string; contact?: string; phone?: string; email?: string;
  /** ทุกเบอร์ (จัดรูปแบบแล้ว) — เอกสารเก่ามีแค่ phone */ phones?: string[]; fax?: string;
  address?: Addr; shipTo?: { name?: string; phone?: string; address?: Addr } | null;
};
/** img = ลิงก์รูปหน้ารายการ (ว่าง = ไม่แสดง) */
export type DocLine = { sku: string; name: string; detail: string; unit: string; qtyMilli: number; priceSatang: number; discountSatang: number; img?: string };
export type ShopHead = {
  name: string; address: string; phone: string; line: string; email: string; taxId: string; branch: string; logo: string;
  era: "AD" | "BE"; showSignature: boolean; banks: { code?: string; name: string; account: string; holder: string }[]; promptpayName: string;
  /** ลายเซ็น/ตราประทับ (ลิงก์รูป) + ชื่อ/ตำแหน่งผู้ลงนามฝั่งร้าน — พิมพ์เฉพาะเอกสารที่ออกแล้ว */
  signature?: string; stamp?: string; signerName?: string; signerTitle?: string;
  /** ใบเสนอราคา: แสดงบัญชีธนาคาร */
  quotePayInfo?: boolean;
  /** แถบข้อความท้ายเอกสาร (ไม่ระบุ = DOC_TAGLINE · "" = ไม่แสดง) */
  tagline?: string;
  /** รูปแบบแถบ (ไม่ระบุ = A) */
  taglineStyle?: DocTaglineStyle;
};
export type DocView = {
  type: DocTypeT; no: string | null; status: string; issueDate: string; validUntil: string; dueDate: string;
  customer: CustSnap; items: DocLine[]; discountSatang: number; vatMode: VatModeT; vatRateBp: number;
  paymentMethod: string; paymentTerms: string; carrier: string; note: string; ref: string; voidReason: string;
  paidSatang: number; payRef: string; qr: string | null; printedAt: string; shop: ShopHead;
  /** ใบแจ้งหนี้: เงินมัดจำที่หักแล้ว (เลขที่ใบเสร็จมัดจำ + ยอด) · ใบเสร็จ: เป็นใบเสร็จรับเงินมัดจำ */
  deposits?: { no: string; amount: number }[]; deposit?: boolean;
  /** ใบเสร็จจากการรับชำระที่ลูกค้าหักภาษี ณ ที่จ่าย */
  wht?: { rateBp: number; satang: number; certNo: string } | null;
  /** วันที่ในช่องลงนามฝั่งร้าน (YYYY-MM-DD) — ว่าง = ใช้วันที่เอกสาร */
  signDate?: string;
  /** ใบลดหนี้: เหตุผล + มูลค่าตามเอกสารเดิม (สตางค์) — มูลค่าที่ถูกต้อง = เดิม − ลดหนี้ */
  credit?: { reason: string; original: number } | null;
  /** QR + ลิงก์ให้ลูกค้าเปิดดู/ยืนยัน/ชำระออนไลน์ (ใบเสนอราคา/ใบแจ้งหนี้ที่ออกแล้ว) */
  online?: { qr: string; url: string } | null;
  /** ตัวเลือกของเอกสารนี้: ใส่ลายเซ็น/ตราประทับ (ค่าเริ่มต้น true) · แสดงเลขบัญชีบนใบเสนอราคา (ไม่ระบุ = ตามตั้งค่าร้าน) */
  signImage?: boolean; showBank?: boolean;
  /** ช่องลงนามฝั่งร้านเว้นว่าง (เซ็นชื่อ+วันที่ด้วยมือภายหลัง) */
  signBlank?: boolean;
  /** ตัวอย่างในตัวแก้ไข: แสดงลายเซ็นแม้เป็นฉบับร่าง (มีลายน้ำ "ฉบับร่าง" — พิมพ์จริงยังต้องออกเอกสารก่อน) */
  previewSign?: boolean;
};

/** ไอคอนธนาคาร: วงกลมสีประจำธนาคาร + รูปอาคารธนาคารสีขาว (ไม่ใช้โลโก้จริง) — สีอยู่ใน admin.css (.bk-KBANK …) */
const BANK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 7.5V9h18V7.5L12 3Z" fill="currentColor"/><path d="M5 10.5h2.2v6.5H5zM10.9 10.5h2.2v6.5h-2.2zM16.8 10.5H19v6.5h-2.2zM3 18.5h18V20H3z" fill="currentColor"/></svg>`;

/** รายการบัญชีธนาคาร: ชื่อบัญชีแสดงครั้งเดียวเมื่อทุกบัญชีชื่อเดียวกัน · ไอคอน · ชื่อธนาคาร · เลขที่บัญชี (ตัวหนา ชิดขวา) */
function bankList(banks: ShopHead["banks"]) {
  const holders = [...new Set(banks.map((b) => b.holder.trim()))];
  const same = holders.length === 1 && holders[0] !== "";
  const li = banks.map((b) => {
    const code = (b.code ?? "").replace(/[^A-Z]/g, "");
    return `<li><span class="bk-ic${code ? ` bk-${code}` : ""}">${BANK_ICON}</span><span class="bk-name">${esc(b.name.replace(/^ธนาคาร/, ""))}</span><span class="bk-acc"><small>เลขที่บัญชี</small> <b>${esc(b.account)}</b></span>${!same && b.holder ? `<span class="bk-h">ชื่อบัญชี ${esc(b.holder)}</span>` : ""}</li>`;
  });
  return `${same ? `<div class="bk-holder">ชื่อบัญชี <b>${esc(holders[0])}</b></div>` : ""}<ul class="bk-list">${li.join("")}</ul>`;
}

/** แถบท้ายเอกสารทุกใบ — สินค้า/บริการของร้าน (ค่าเริ่มต้น · แก้ได้ที่ ตั้งค่าร้าน → ข้อความท้ายเอกสาร) */
export const DOC_TAGLINE_MAX = 200;
export const DOC_TAGLINE = "ไฟใต้น้ำ | ไฟส่องน้ำพุ | ไฟสระน้ำ Pool villa | โคมไฟส่องต้นไม้ | ไฟส่องถนน | ไฟฝังพื้น | ไฟย้อมสีตึก | ดาวไลท์ฝังฝ้า ไฟแอลอีดีงานแสงสีทุกประเภท";

/** รูปแบบแถบข้อความท้ายเอกสาร: A กรอบเหลี่ยมพื้นเทาอ่อน · B แถบสีแบรนด์ (ส้มเข้ม ตัวขาว) · C ข้อความเรียบ ไม่มีกรอบ/เส้น ตัวคั่น • สีส้ม */
export const DOC_TAGLINE_STYLES = {
  A: { label: "กรอบเหลี่ยม", desc: "พื้นเทาอ่อน ขอบเหลี่ยม สุภาพ อ่านง่าย" },
  B: { label: "แถบสีแบรนด์", desc: "พื้นส้มเข้ม ตัวอักษรขาว เด่น จำร้านได้ (ใช้หมึกสีมากกว่า)" },
  C: { label: "ข้อความเรียบ", desc: "ไม่มีกรอบและเส้น ตัวคั่นจุดสีส้ม ประหยัดหมึก ดูสะอาดตา" },
} as const;
export type DocTaglineStyle = keyof typeof DOC_TAGLINE_STYLES;
export const isTaglineStyle = (v: unknown): v is DocTaglineStyle => v === "A" || v === "B" || v === "C";
/** HTML ของแถบ (ใช้ทั้งหน้าเอกสาร/พิมพ์ และตัวอย่างในตั้งค่า): แบบ C แทน "|" ด้วยจุดสีส้ม */
export function taglineHtml(text: string, style: DocTaglineStyle = "A") {
  const parts = text.split(/\s*\|\s*/).filter(Boolean).map(esc);
  const body = style === "C" ? parts.join('<i class="tl-sep">•</i>') : parts.join(" | ");
  return `<div class="sh-thanks tl-${style.toLowerCase()}">${body}</div>`;
}

/** ข้อความท้ายเอกสารที่จะพิมพ์ ("" = ไม่แสดง) จากตั้งค่าร้าน */
export const docTaglineOf = (s: { docTagline: string | null; docTaglineOn: boolean }) => (s.docTaglineOn ? s.docTagline?.trim() || DOC_TAGLINE : "");
/** ทำความสะอาดข้อความที่พิมพ์มา: ขึ้นบรรทัด/ช่องว่างซ้อน → ช่องว่างเดียว · ตัดที่ DOC_TAGLINE_MAX · ตรงกับค่าเดิม = null */
export const cleanDocTagline = (raw: unknown) => {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, DOC_TAGLINE_MAX);
  return !t || t === DOC_TAGLINE ? null : t;
};

export const DOC_META: Record<DocTypeT, { th: string; en: string; short: string; path: string }> = {
  QUOTATION: { th: "ใบเสนอราคา", en: "QUOTATION", short: "QT", path: "QUOTATION" },
  INVOICE: { th: "ใบแจ้งหนี้ / ใบวางบิล", en: "INVOICE / BILLING NOTE", short: "IV", path: "INVOICE" },
  RECEIPT: { th: "ใบเสร็จรับเงิน", en: "RECEIPT", short: "RC", path: "RECEIPT" },
  CREDIT_NOTE: { th: "ใบลดหนี้", en: "CREDIT NOTE", short: "CN", path: "CREDIT_NOTE" },
  DELIVERY: { th: "ใบส่งของ / ใบรับสินค้า", en: "DELIVERY NOTE", short: "DO", path: "DELIVERY" },
};
const SIGN: Record<DocTypeT, [string, string]> = { QUOTATION: ["ผู้เสนอราคา", "ผู้อนุมัติสั่งซื้อ"], INVOICE: ["ผู้วางบิล", "ผู้รับวางบิล"], RECEIPT: ["ผู้รับเงิน", "ผู้รับสินค้า"], CREDIT_NOTE: ["ผู้อนุมัติ", "ผู้รับใบลดหนี้"], DELIVERY: ["ผู้ส่งของ", "ผู้รับของ"] };

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");
/** จำนวน: จำนวนเต็มแสดง "2" (ไม่ใช่ "2.00") · ทศนิยมแสดงตามเดิม */
const qtyShow = (m: number) => (m % 1000 === 0 ? (m / 1000).toLocaleString("en-US") : qtyFmt(m));
/** จำนวนวันระหว่าง YYYY-MM-DD สองวัน */
const daysBetween = (a: string, b: string) => {
  const x = Date.parse(`${a}T00:00:00Z`), y = Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 864e5) : NaN;
};
/** ไอคอนเล็กหน้าข้อมูลติดต่อร้าน (โทร · LINE · อีเมล) — เส้นสีเทา พิมพ์ขาวดำได้ชัด */
const CT_ICON = {
  phone: '<path d="M5 3h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 5.3 5.3l1.4-2.2L19 13.5V17a2 2 0 0 1-2 2A15 15 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',
  line: '<path d="M12 4C6.8 4 3 7.2 3 11.1c0 3.5 3 6.3 7.2 6.9.3.1.6.3.5.8l-.2 1.2c-.1.4.2.6.5.4 3.7-2.1 6.9-4.9 8-7.1.6-.7 1-1.5 1-2.3C20 7.2 17.2 4 12 4Z"/><path d="M7.5 9.5v3h1.8M11 9.5v3M13 12.5v-3l2 3v-3M17.6 9.5h-1.5v3h1.5M16.1 11h1.4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
};
const ct = (k: keyof typeof CT_ICON, text: string) => `<span class="sh-ct"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CT_ICON[k]}</svg>${text}</span>`;

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
  // ติดต่อร้าน: แถวแรก โทร + LINE · แถวสอง อีเมล (มีไอคอนนำหน้า)
  const row1 = [s.phone && ct("phone", `โทร ${esc(s.phone)}`), s.line && ct("line", `ไอดีไลน์ ${esc(s.line)}`)].filter(Boolean).join("");
  const contact = `${row1 ? `<div class="sh-cts">${row1}</div>` : ""}${s.email ? `<div class="sh-cts">${ct("mail", esc(s.email))}</div>` : ""}`;
  const head1 = `<header class="sh-head">
      <div class="sh-shop">${s.logo ? `<img class="sh-logo" src="${esc(s.logo)}" alt="">` : ""}
        <div class="sh-shoptx"><b>${esc(s.name)}</b><div class="sh-addr${addrCls(s.address)}">${esc(oneLine(s.address))}</div>${contact}${shopTax}</div></div>
      <div class="sh-tbox"><div class="sh-title${title.length > 16 ? " long" : ""}">${esc(title)}<small>${en}</small></div>
        <dl class="sh-meta">${meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></div>
    </header>`;
  const headN = `<header class="sh-headn"><b>${esc(s.name)}</b><span><b>${esc(title)}</b> ${esc(label)} · หน้า {{P}} / {{N}}</span></header>`;

  const isCn = d.type === "CREDIT_NOTE";
  const info: [string, string][] = d.type === "DELIVERY" ? [["ขนส่ง", esc(d.carrier || "—")]] : [[isCn ? "คืนเงินโดย" : "การชำระเงิน", esc(d.paymentMethod || "—")]];
  if (d.type === "QUOTATION") {
    const n = daysBetween(d.issueDate, d.validUntil);
    if (n > 0) info.push(["ยืนราคา", `${n} วัน`]);
  }
  if (d.type === "INVOICE") {
    const n = daysBetween(d.issueDate, d.dueDate);
    if (n > 0) info.push(["เครดิต", `${n} วัน`]);
  }
  // ผู้ติดต่อฝั่งร้าน (ผู้ลงนาม) — ลูกค้าโทรหาคนที่ถูกต้อง
  // (ไม่พิมพ์เบอร์โทรซ้ำตรงนี้ — เบอร์ร้านอยู่ที่หัวเอกสารแล้ว)
  if (s.signerName && (d.type === "QUOTATION" || d.type === "INVOICE")) info.push(["ผู้ติดต่อ", esc(s.signerName)]);
  if (d.type === "INVOICE") info.push(["ยอดค้างชำระ", `<b>${money(outstanding)}</b>`]);
  if (d.carrier && d.type !== "QUOTATION" && d.type !== "DELIVERY") info.push(["ขนส่ง", esc(d.carrier)]);
  info.push(["หน้า", "{{P}} / {{N}}"]);
  const branch = isCo ? c.branch || "สำนักงานใหญ่" : "";
  const st = c.shipTo;
  const custLbl = d.type === "INVOICE" ? "ส่งเบิกไปที่ / BILL TO" : "ลูกค้า / CUSTOMER";
  const parties = `<section class="sh-parties">
      <div class="sh-box sh-info"><dl class="kvs">${info.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></div>
      <div class="sh-box sh-cust"><h4>${custLbl}</h4>
        ${c.name ? `<div class="cust-top"><div class="cust-id">${c.code ? `<span class="cust-code">รหัสลูกค้า ${esc(c.code)}</span>` : ""}<b class="cust-name">${esc(c.name)}</b></div>${branch ? `<span class="cust-br">${esc(branch)}</span>` : ""}</div>
        <div><span class="k">ที่อยู่</span> ${esc(addrText(c.address)) || "—"}</div>
        ${c.taxId || c.contact ? `<div>${c.taxId ? `<span class="nw"><span class="k">เลขประจำตัวผู้เสียภาษี</span> ${esc(fmtTaxId(c.taxId))}</span>` : ""}${c.taxId && c.contact ? " &nbsp; " : ""}${c.contact ? `<span class="nw"><span class="k">ผู้ติดต่อ</span> ${esc(c.contact)}</span>` : ""}</div>` : ""}
        ${custContact(c)}
        ${st && st.name && d.type !== "QUOTATION" && d.type !== "DELIVERY" ? `<div class="ship-to"><span class="k">ส่งของที่</span> ${esc(st.name)}${st.phone ? " โทร " + esc(st.phone) : ""} · ${esc(addrText(st.address))}</div>` : ""}`
        : '<div class="cust-empty">ยังไม่ได้เลือกลูกค้า</div>'}
      </div></section>`;

  const hasDisc = d.items.some((i) => i.discountSatang > 0);
  // รูปสินค้าหน้ารายการ — มีรูปอย่างน้อย 1 รายการ = เว้นช่องรูปให้ทุกแถว (ชื่อรายการตรงกัน)
  // ใบเสร็จรับเงิน: แสดงเฉพาะชื่อรายการ (ไม่มีรูป ไม่มีรายละเอียด/สเปก) ให้กระชับเหมือนใบเสร็จทั่วไป
  const plain = d.type === "RECEIPT";
  const hasImg = !plain && d.items.some((i) => i.img);
  const imgCell = (it: DocLine) => (hasImg ? `<span class="it-img">${it.img ? `<img src="${esc(it.img)}" alt="">` : ""}</span>` : "");
  const isDo = d.type === "DELIVERY";
  const thead = isDo
    ? `<thead><tr><th class="c w-no">ลำดับ</th><th class="w-sku">รหัสสินค้า</th><th>รายการสินค้า</th><th class="n w-qty">จำนวน</th><th class="w-unit">หน่วย</th><th class="c w-chk">ตรวจรับ</th></tr></thead>`
    : `<thead><tr><th class="c w-no">ลำดับ</th><th class="w-sku">รหัสสินค้า</th><th>รายการสินค้า</th><th class="w-unit">หน่วย</th><th class="n w-price">ราคาขาย/บาท</th><th class="n w-qty">จำนวน</th>${hasDisc ? '<th class="n w-disc">ส่วนลด</th>' : ""}<th class="n w-amt">ราคารวม/บาท</th></tr></thead>`;
  const nameCell = (it: DocLine) => `<td class="nm"><div class="nm-row">${imgCell(it)}<div>${nl2br(it.name) || '<span class="ph-txt">(ไม่มีชื่อรายการ)</span>'}${it.detail && !plain ? `<small>${nl2br(it.detail)}</small>` : ""}</div></div></td>`;
  const rows = isDo
    ? d.items.length
      ? d.items.map((it, i) => `<tr><td class="c">${i + 1}</td><td class="sku">${esc(it.sku)}</td>${nameCell(it)}<td class="n">${qtyShow(it.qtyMilli)}</td><td>${esc(it.unit)}</td><td class="c"><span class="chk-box"></span></td></tr>`)
      : ['<tr class="empty-row"><td colspan="6">ยังไม่มีรายการสินค้า</td></tr>']
    : d.items.length
    ? d.items.map((it, i) => `<tr><td class="c">${i + 1}</td><td class="sku">${esc(it.sku)}</td>${nameCell(it)}<td>${esc(it.unit)}</td>
      <td class="n">${money(it.priceSatang)}</td><td class="n">${qtyShow(it.qtyMilli)}</td>${hasDisc ? `<td class="n">${it.discountSatang ? money(it.discountSatang) : ""}</td>` : ""}<td class="n">${money(lineSatang(it))}</td></tr>`)
    : [`<tr class="empty-row"><td colspan="${hasDisc ? 8 : 7}">ยังไม่มีรายการสินค้า</td></tr>`];

  // แถวส่วนลดแสดงเฉพาะเมื่อมีส่วนลด (ไม่พิมพ์ "ส่วนลด 0.00")
  const tot: [string, number][] = [["ราคารวมสินค้า", t.subtotal]];
  if (t.discount) tot.push(["ส่วนลด", t.discount], ["ราคาหลังหักส่วนลด", t.afterDiscount]);
  if (vatOn) tot.push(["มูลค่าก่อนภาษีมูลค่าเพิ่ม", t.beforeVat], [`ภาษีมูลค่าเพิ่ม ${d.vatRateBp / 100}%`, t.vat]);
  let payBox = "";
  if (d.type === "INVOICE") {
    // ใบแจ้งหนี้: QR พร้อมเพย์ (ยอดค้างชำระ) ซ้าย · หัวข้อ + ยอดชำระ · ชื่อบัญชี · รายการธนาคารพร้อมไอคอน
    payBox = `<div class="sh-pay sh-ivpay">${d.qr ? `<figure class="sh-ppqr"><img class="sh-qr" src="${esc(d.qr)}" alt="PromptPay QR"><figcaption><b>สแกนจ่ายพร้อมเพย์</b>${s.promptpayName ? `<span>${esc(s.promptpayName)}</span>` : ""}</figcaption></figure>` : ""}
      <div class="pay-main"><div class="pay-hd"><h5>ช่องทางชำระเงิน</h5>${outstanding > 0 ? `<span class="pay-amt">ยอดชำระ <b>${money(outstanding)}</b> บาท</span>` : ""}</div>
      ${s.banks.length ? bankList(s.banks) : ""}</div></div>`;
  }
  if (isCn) {
    // ใบลดหนี้ตามมาตรา 86/10: มูลค่าเดิม · มูลค่าที่ถูกต้อง · ผลต่าง (+ VAT ของผลต่างเมื่อเปิด VAT) · เหตุผล
    const orig = d.credit?.original ?? 0;
    const rows: [string, number][] = [["มูลค่าตามใบเสร็จเดิม", orig], ["มูลค่าที่ถูกต้อง", Math.max(0, orig - t.grand)], ["ผลต่าง (ลดหนี้)", t.grand]];
    if (vatOn) rows.push([`ภาษีมูลค่าเพิ่มของผลต่าง ${d.vatRateBp / 100}%`, t.vat]);
    payBox = `<div class="sh-cn"><h5>เหตุผลการลดหนี้</h5><p>${nl2br(d.credit?.reason || "—")}</p>
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${money(v)}</dd>`).join("")}</dl></div>`;
  }
  const bankOn = (d.showBank ?? s.quotePayInfo) !== false && s.banks.length > 0;
  if (d.type === "QUOTATION" && (bankOn || d.online)) {
    // ใบเสนอราคา: บัญชีธนาคาร (ตั้งค่าได้) + QR เปิดดู/ยืนยันออนไลน์
    payBox = `<div class="sh-pay sh-qpay">${d.online ? `<figure class="sh-oqr"><img class="sh-qr" src="${esc(d.online.qr)}" alt="QR เปิดใบเสนอราคาออนไลน์"><figcaption>สแกนเพื่อดู<br>และยืนยันสั่งซื้อ</figcaption></figure>` : ""}<div>
      ${bankOn ? `<div class="pay-main"><div class="pay-hd"><h5>ช่องทางชำระเงิน (เมื่อยืนยันสั่งซื้อ)</h5></div>${bankList(s.banks)}</div>` : ""}
      </div></div>`;
  }
  if (d.type === "INVOICE" && d.online && payBox) {
    payBox = payBox.replace('<div class="mut">', `<div class="mut">ดูใบแจ้งหนี้และแนบสลิปออนไลน์: สแกน QR มุมขวาล่าง · `);
  }
  if (d.type === "RECEIPT")
    payBox = `<div class="sh-paid"><b>${d.deposit ? "ได้รับเงินมัดจำถูกต้องแล้ว" : "ได้รับเงินถูกต้องแล้ว"}</b> ชำระโดย ${esc(d.paymentMethod || "—")}${d.payRef ? ` · อ้างอิง ${esc(d.payRef)}` : ""}${
      d.wht ? `<dl class="sh-wht"><dt>ยอดตามใบเสร็จ</dt><dd>${money(t.grand)}</dd><dt>หักภาษี ณ ที่จ่าย ${d.wht.rateBp / 100}%${d.wht.certNo ? ` <small>(หนังสือรับรองเลขที่ ${esc(d.wht.certNo)})</small>` : ""}</dt><dd>${money(d.wht.satang)}</dd><dt><b>รับเงินสุทธิ</b></dt><dd><b>${money(t.grand - d.wht.satang)}</b></dd></dl>` : ""
    }</div>`;
  const terms = d.paymentTerms.trim(), note = d.note.trim();
  // ช่องลงนาม: ฝั่งร้านใส่วันที่ให้ (วันที่ลงนามที่ตั้งไว้ หรือวันที่เอกสาร) · ฝั่งลูกค้าเว้นให้เขียนเอง
  const signDay = d.signDate || d.issueDate;
  // ลายเซ็น/ตราประทับฝั่งร้าน: เฉพาะเอกสารที่ออกแล้ว (ฉบับร่างไม่พิมพ์ — กันนำร่างไปใช้แทนเอกสารจริง)
  const issued = d.status !== "DRAFT" || !!d.previewSign;
  const useSig = issued && d.signImage !== false;
  const sigImg = useSig && s.signature ? `<img class="sg-sig" src="${esc(s.signature)}" alt="">` : "";
  const stampImg = useSig && s.stamp ? `<img class="sg-stamp" src="${esc(s.stamp)}" alt="">` : "";
  // ช่องฝั่งร้านเว้นว่างให้เซ็นด้วยมือ (ไม่มีลายเซ็น ชื่อ วันที่): signBlank (ใบเสร็จ "เว้นว่างไว้") หรือไม่ได้เลือก "ใส่ลายเซ็นอิเล็กทรอนิกส์"
  const handSign = !!d.signBlank || d.signImage === false;
  const hasSig = !handSign && !!(sigImg || stampImg);
  // ทุกช่องมีแถวเท่ากัน (เส้นเซ็น · (ชื่อ) · ตำแหน่ง · หัวข้อ · วันที่) → หัวข้อ/วันที่ของสองฝั่งอยู่ระดับเดียวกัน
  const withTitle = !handSign && !!s.signerName && !!s.signerTitle;
  const sign = s.showSignature
    ? `<section class="sh-sign${hasSig ? " has-sig" : ""}">${SIGN[d.type].map((l, i) => {
        const me = i === 0 && !handSign;
        const name = me && s.signerName ? `<em class="sg-name">( ${esc(s.signerName)} )</em>` : `<em class="sg-name sg-blank">(<i></i>)</em>`;
        const title = withTitle ? (me ? `<em class="sg-title">${esc(s.signerTitle!)}</em>` : `<em class="sg-title sg-pad" aria-hidden="true">&nbsp;</em>`) : "";
        return `<div class="sg-slot"><div class="sg-line">${me ? sigImg + stampImg : ""}</div>${name}${title}<b>${l}</b><span>วันที่ ${me && signDay ? `<b class="sg-date">${esc(docDate(signDay, era))}</b>` : "______/______/__________"}</span></div>`;
      }).join("")}</section>`
    : "";
  // ใบแจ้งหนี้: QR เปิดดู/แนบสลิปออนไลน์ อยู่ใต้ยอดรวม (QR พร้อมเพย์อยู่ในกล่องชำระเงินแล้ว)
  const ivOnline = d.type === "INVOICE" && d.online ? `<figure class="sh-oqr sh-oqr-iv"><img class="sh-qr" src="${esc(d.online.qr)}" alt="QR เปิดใบแจ้งหนี้ออนไลน์"><figcaption>ดู/แนบสลิปออนไลน์</figcaption></figure>` : "";
  // ใบส่งของ: ไม่มีราคา/ยอดเงิน · รวมจำนวน · ส่งที่ · ข้อความรับรองการรับของ
  const qtyTotal = d.items.reduce((n, it) => n + it.qtyMilli, 0);
  const doShip = c.shipTo?.name ? `${esc(c.shipTo.name)}${c.shipTo.phone ? ` โทร ${esc(c.shipTo.phone)}` : ""} · ${esc(addrText(c.shipTo.address))}` : esc(addrText(c.address)) || "—";
  const tagline = d.shop.tagline ?? DOC_TAGLINE;
  const doTail = `<div class="sh-end">
      <section class="sh-tail sh-dotail">
        <div class="sh-tl">
          <div class="sh-dobox"><h5>ส่งสินค้าที่</h5><p>${doShip}</p>${d.carrier ? `<p><span class="k">ขนส่งโดย</span> ${esc(d.carrier)}</p>` : ""}</div>
          ${note ? `<div class="sh-note"><h5>หมายเหตุ</h5><p>${nl2br(note)}</p></div>` : ""}
          ${terms ? `<div class="sh-note"><h5>เงื่อนไข</h5><p>${nl2br(terms)}</p></div>` : ""}
          <p class="sh-doack">ได้รับสินค้าตามรายการข้างต้นครบถ้วน ถูกต้อง และอยู่ในสภาพเรียบร้อยแล้ว</p>
        </div>
        <div class="sh-tr"><dl class="sh-tot"><dt>จำนวนรายการ</dt><dd>${d.items.length}</dd><dt class="g">รวมจำนวน</dt><dd class="g">${qtyShow(qtyTotal)}</dd></dl></div>
      </section>
      ${sign}
      ${tagline ? taglineHtml(tagline, d.shop.taglineStyle ?? "A") : ""}
    </div>`;
  // ใบแจ้งหนี้: แยกแถว "หักเงินมัดจำ" ตามใบเสร็จมัดจำ · ส่วนที่เหลือของยอดที่ชำระ = ชำระแล้ว
  const deps = d.type === "INVOICE" ? (d.deposits ?? []) : [];
  const depRows = deps.map((x) => `<dt>หักเงินมัดจำ <small>(${esc(x.no)})</small></dt><dd>${money(x.amount)}</dd>`).join("");
  const otherPaid = d.paidSatang - deps.reduce((n, x) => n + x.amount, 0);
  const tail = isDo ? doTail : `<div class="sh-end">
      <section class="sh-tail">
        <div class="sh-tl">
          <div class="sh-words"><span>จำนวนเงิน (ตัวอักษร)</span><b>(${bahtText(t.grand)})</b></div>
          ${note ? `<div class="sh-note"><h5>หมายเหตุ</h5><p>${nl2br(note)}</p></div>` : ""}
          ${terms ? `<div class="sh-note"><h5>${d.type === "QUOTATION" ? "เงื่อนไข" : "เงื่อนไขการชำระเงิน"}</h5><p>${nl2br(terms)}</p></div>` : ""}
          ${payBox}
        </div>
        <div class="sh-tr"><dl class="sh-tot">${tot.map(([k, v]) => `<dt>${k}</dt><dd>${money(v)}</dd>`).join("")}
          <dt class="g">${isCn ? "มูลค่าลดหนี้สุทธิ/บาท" : "ราคารวมสุทธิ/บาท"}</dt><dd class="g">${money(t.grand)}</dd>
          ${d.type === "INVOICE" && d.paidSatang ? `${depRows}${otherPaid > 0 ? `<dt>ชำระแล้ว</dt><dd>${money(otherPaid)}</dd>` : ""}<dt class="o">คงค้างชำระ</dt><dd class="o">${money(outstanding)}</dd>` : ""}</dl>
        ${ivOnline}</div>
      </section>
      ${sign}
      ${tagline ? taglineHtml(tagline, d.shop.taglineStyle ?? "A") : ""}
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
/** codSatang: ยอดเก็บเงินปลายทางของใบนี้ (คำสั่งซื้อ COD = ยอดคำสั่งซื้อ, 0 = ไม่เก็บ) — ไม่ระบุ = ใช้ค่าจากตัวเลือก (ใบปะหน้าจากเอกสาร) */
export type LabelData = { ref: string; name: string; phone: string; addr: string; zip: string; carrier: string; items: { name: string; qtyMilli: number }[]; codSatang?: number };
export type LabelOpts = { size: "A6" | "A4"; boxes: number; codSatang: number; marks: Record<MarkKey, boolean>; showItems: boolean };
export type Sender = { name: string; phone: string; address: string; logo: string };

function labelHtml(L: LabelData, o: LabelOpts, s: Sender, b: number, nb: number) {
  const cod = L.codSatang ?? o.codSatang;
  const zip = String(L.zip || "").replace(/\D/g, "").slice(0, 5).padEnd(5, " ").split("");
  const marks = (Object.keys(MARKS) as MarkKey[]).filter((k) => o.marks[k]);
  return `<section class="label">
    <div class="lb-top"><div class="lb-from"><div class="lb-k">ผู้ส่ง · FROM</div><b>${esc(s.name)}</b>${s.phone ? ` <span>โทร ${esc(s.phone)}</span>` : ""}<div class="lb-fa">${esc(s.address)}</div></div>
      ${s.logo ? `<img class="lb-logo" src="${esc(s.logo)}" alt="">` : ""}</div>
    <div class="lb-to"><div class="lb-k">ผู้รับ · TO</div>
      <div class="lb-name">${esc(L.name)}</div>
      <div class="lb-addr">${esc(L.addr)}</div>
      ${L.phone ? `<div class="lb-phone">โทร ${esc(L.phone)}</div>` : '<div class="lb-phone blank">โทร <span></span></div>'}
      <div class="lb-zip" aria-label="รหัสไปรษณีย์ ${esc(L.zip)}">${zip.map((c) => `<span>${esc(c.trim())}</span>`).join("")}</div></div>
    <div class="lb-info"><div class="lb-bc">${L.ref ? code128Svg(L.ref, "lb-bcs") : ""}<div class="lb-ref">${esc(L.ref)}</div></div>
      <div class="lb-box"><small>กล่องที่</small><b>${b}/${nb}</b></div></div>
    <div class="lb-row"><span>ขนส่ง: <b>${esc(L.carrier || "—")}</b></span>${cod > 0 ? `<span class="lb-cod">เก็บเงินปลายทาง ฿${money(cod)}</span>` : ""}</div>
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
  shipping: ["รอเซ็นรับ", "pend"], delivered: ["ส่งมอบแล้ว", "ok"],
  unpaid: ["ค้างชำระ", "pend"], partial: ["ชำระบางส่วน", "info"], paid: ["ชำระแล้ว", "ok"], overdue: ["เกินกำหนด", "bad"], issued: ["ออกแล้ว", "ok"], void: ["ยกเลิก", "void"],
  // แท็บติดตามใบเสนอราคา (ไม่ใช่สถานะของเอกสาร — ใช้กรองรายการเท่านั้น)
  follow: ["ต้องติดตาม", "pend"], expiring: ["ใกล้หมดอายุ", "pend"],
} as const;
export type DocSt = keyof typeof DOC_ST;
export const DOC_TABS: Record<DocTypeT, [DocSt | "all", string][]> = {
  QUOTATION: [["all", "ทั้งหมด"], ["follow", "ต้องติดตาม"], ["expiring", "ใกล้หมดอายุ"], ["draft", "ฉบับร่าง"], ["open", "รอตอบรับ"], ["accepted", "ตอบรับแล้ว"], ["rejected", "ไม่ตอบรับ"], ["expired", "หมดอายุ"], ["void", "ยกเลิก"]],
  INVOICE: [["all", "ทั้งหมด"], ["draft", "ฉบับร่าง"], ["unpaid", "ค้างชำระ"], ["partial", "ชำระบางส่วน"], ["overdue", "เกินกำหนด"], ["paid", "ชำระแล้ว"], ["void", "ยกเลิก"]],
  RECEIPT: [["all", "ทั้งหมด"], ["draft", "ฉบับร่าง"], ["issued", "ออกแล้ว"], ["void", "ยกเลิก"]],
  CREDIT_NOTE: [["all", "ทั้งหมด"], ["draft", "ฉบับร่าง"], ["issued", "ออกแล้ว"], ["void", "ยกเลิก"]],
  DELIVERY: [["all", "ทั้งหมด"], ["draft", "ฉบับร่าง"], ["shipping", "รอเซ็นรับ"], ["delivered", "ส่งมอบแล้ว"], ["void", "ยกเลิก"]],
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
  if (d.type === "DELIVERY") return d.status === "ACCEPTED" ? "delivered" : "shipping";
  return "issued";
}
