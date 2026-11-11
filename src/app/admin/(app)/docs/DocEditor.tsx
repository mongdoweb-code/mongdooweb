"use client";
// ตัวแก้ไขเอกสารขาย: ซ้าย = ฟอร์ม (ลูกค้า, รายการ, ส่วนลด, VAT, เงื่อนไข) · ขวา = ตัวอย่าง A4 จริงที่อัปเดตทันทีขณะพิมพ์
// ยอดในหน้านี้ใช้แสดงผลเท่านั้น — server คำนวณใหม่ทุกครั้งที่บันทึก · ร่างที่พิมพ์ค้างไว้เก็บในเบราว์เซอร์กันหาย
// เพิ่ม (2026-11-11): หน้าต่างเลือกสินค้าหลายรายการ · ส่วนลด % · ทำสำเนา/แทรกรายการ · ต้นทุน-กำไร (เจ้าของร้าน) · วันที่ด่วน
// · ข้อความเงื่อนไขสำเร็จรูป · เตือนสต็อก · แถบยอดรวมติดล่าง · Ctrl+S บันทึกร่าง
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { bahtText, calcTotals, lineSatang, money, type DocTypeT, type VatModeT } from "@/lib/doc-calc";
import type { CustSnap, DocView, ShopHead } from "@/lib/doc-render";
import { isValidThaiTaxId } from "@/lib/format";
import { unitPriceSatang, type Tier } from "@/lib/pricing";
import { DocSheets } from "../../_components/DocSheets";
import { useFormAction } from "../../_components/useFormAction";
import { uploadEditorImage } from "../../_components/editor-actions";
import { saveCustomer, type CustomerState } from "../customers/actions";
import { saveDoc, type DocState } from "./actions";
import { ProductPicker } from "./ProductPicker";

/** image: null = ใช้รูปแรกของสินค้า · "" = ไม่แสดงรูป · storage key = รูปที่เลือก/อัปโหลดเอง */
type LineIn = { productId: string; sku: string; name: string; detail: string; unit: string; qty: string; price: string; discount: string; image?: string | null };
type Line = LineIn & { key: number };
export type EditorInit = {
  id?: string; type: DocTypeT; customerId: string; customer: CustSnap | null; issueDate: string; validUntil: string; dueDate: string;
  items: LineIn[]; discount: string; vatMode: VatModeT; paymentMethod: string; paymentTerms: string; carrier: string; note: string; internalNote: string;
  /** วันที่ในช่องลงนามฝั่งร้าน — ว่าง = ใช้วันที่เอกสาร */
  signDate: string;
  /** ใส่ลายเซ็น/ตราประทับอิเล็กทรอนิกส์ · แสดงเลขบัญชี (ใบเสนอราคา) */
  signImage: boolean; showBank: boolean;
  /** ใบลดหนี้: เหตุผล · ยอดใบเสร็จเดิม · ลดได้อีกสูงสุด (สตางค์) */
  creditReason?: string; creditOriginal?: number; creditMax?: number;
};
type Cust = { id: string; snap: CustSnap };
/** price = ราคาขายจริง 1 ชิ้น (รวมราคาลดตามช่วงเวลา) · tiers = ราคาขายส่งตามจำนวน */
/** cat = หมวด · stock = คงเหลือเมื่อนับสต็อก (null = ไม่นับ) · out = หมด · cost = ต้นทุนต่อหน่วย (ส่งมาเฉพาะเจ้าของร้าน) */
type Prod = { id: string; sku: string; name: string; unit: string; price: number; service: boolean; off: boolean; tiers?: Tier[]; imgs?: string[]; cat?: string; stock?: number | null; out?: boolean; cost?: number };
/** storage key → ลิงก์รูปขนาดย่อ (เหมือน mediaUrl(key, "sm") ฝั่ง server) */
const thumb = (key: string) => (/^https:\/\//i.test(key) ? key : `/media/${key.replace(/\.webp$/, "-sm.webp")}`);
/** รูปที่จะแสดงของรายการ (key) — "" = ไม่แสดง */
const lineImgKey = (l: LineIn, products: Prod[]) => (l.image === "" ? "" : (l.image ?? (l.productId ? products.find((p) => p.id === l.productId)?.imgs?.[0] : undefined) ?? ""));
/** ราคาตั้งต้นของสินค้าตามจำนวน (unitPriceSatang แบบเดียวกับหน้าร้าน) เป็นบาท "0.00" */
const priceFor = (p: Prod, qty: string) => (unitPriceSatang({ priceSatang: p.price, tierPrices: p.tiers }, Math.max(1, Math.floor(num(qty)) || 1)) / 100).toFixed(2);

const num = (s: string) => {
  const n = Number(String(s).replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const sat = (s: string) => (String(s).trim() === "" ? 0 : Math.round(num(s) * 100));
/** ส่วนลด: "120" = 120 บาท · "10%" = 10% ของยอด base (สตางค์) */
const isPct = (s: string) => /%\s*$/.test(String(s));
const discSat = (s: string, base: number) => {
  if (!isPct(s)) return sat(s);
  const p = num(String(s).replace(/%\s*$/, ""));
  return Number.isFinite(p) && p >= 0 && p <= 100 ? Math.round((base * p) / 100) : NaN;
};
/** YYYY-MM-DD + n วัน */
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
};
/** ข้อความเงื่อนไขที่ใช้บ่อย (กดเพื่อเพิ่ม/เอาออก) */
const TERM_SNIPPETS: Record<"QUOTATION" | "OTHER", string[]> = {
  QUOTATION: [
    "ราคานี้ยังไม่รวมค่าจัดส่ง",
    "ราคานี้รวมค่าจัดส่งแล้ว",
    "ชำระมัดจำ 50% เมื่อยืนยันสั่งซื้อ ส่วนที่เหลือชำระก่อนจัดส่ง",
    "ชำระเต็มจำนวนก่อนจัดส่ง",
    "จัดส่งภายใน 3–7 วันทำการหลังได้รับชำระเงิน",
    "สินค้าสั่งผลิต/สั่งพิเศษ ไม่รับเปลี่ยนคืนหลังยืนยันคำสั่งซื้อ",
    "รับประกันสินค้า 1 ปี (ไม่รวมความเสียหายจากการติดตั้งหรือใช้งานผิดวิธี)",
    "ราคาไม่รวมค่าติดตั้ง",
  ],
  OTHER: [
    "กรุณาชำระเงินภายในวันที่ครบกำหนด",
    "โอนเงินแล้วกรุณาแจ้งหลักฐานการโอนทาง LINE @mongdoweb",
    "หักภาษี ณ ที่จ่าย (ถ้ามี) กรุณาส่งหนังสือรับรองการหักภาษีให้ร้าน",
    "รับประกันสินค้า 1 ปี (ไม่รวมความเสียหายจากการติดตั้งหรือใช้งานผิดวิธี)",
  ],
};
const milli = (s: string) => Math.round(num(s) * 1000);
let K = 1;
const withKey = (l: LineIn): Line => ({ ...l, key: K++ });
const strip = ({ key, ...l }: Line): LineIn => (void key, l);
const blank = (): Line => withKey({ productId: "", sku: "", name: "", detail: "", unit: "ชิ้น", qty: "1", price: "", discount: "", image: null });

export function DocEditor({ init, title, back, customers: cust0, products, shop, vatEnabled, vatRateBp, refText, printedAt, lists, showCost = false }: {
  init: EditorInit; title: string; back: string; customers: Cust[]; products: Prod[]; shop: ShopHead; vatEnabled: boolean; vatRateBp: number;
  refText: string; printedAt: string; lists: { methods: string[]; carriers: string[]; units: string[]; reasons?: string[] };
  /** เจ้าของร้าน: แสดงต้นทุน/กำไร (ไม่พิมพ์บนเอกสาร) */
  showCost?: boolean;
}) {
  const isCn = init.type === "CREDIT_NOTE";
  const draftKey = `mdw_doc_draft_${init.id ?? `new-${init.type}`}`;
  const [state, onSubmit, pending] = useFormAction<DocState>(saveDoc, {});
  const [v, setV] = useState(() => ({ ...init, items: init.items.length ? init.items.map(withKey) : [blank()] }));
  const [customers, setCustomers] = useState(cust0);
  const [dirty, setDirty] = useState(false);
  const [restore, setRestore] = useState<typeof v | null>(null);
  const [showPv, setShowPv] = useState(true);
  const [picker, setPicker] = useState(false);
  const saveBtn = useRef<HTMLButtonElement>(null);
  const prodById = new Map(products.map((p) => [p.id, p]));
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((x) => ({ ...x, [k]: val })); setDirty(true); };
  const setLine = (key: number, patch: Partial<LineIn>) => { setV((x) => ({ ...x, items: x.items.map((l) => (l.key === key ? { ...l, ...patch } : l)) })); setDirty(true); };

  // ร่างที่ค้างในเบราว์เซอร์ (กันปิดหน้าโดยไม่ได้ตั้งใจ)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (d && Array.isArray(d.items)) setRestore({ ...d, items: d.items.map((l: LineIn) => withKey(l)) });
      }
    } catch {}
  }, [draftKey]);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ ...v, items: v.items.map(strip) })); } catch {}
    }, 600);
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    addEventListener("beforeunload", guard);
    return () => { clearTimeout(t); removeEventListener("beforeunload", guard); };
  }, [v, dirty, draftKey]);

  const items = v.items.map((l) => {
    const qtyMilli = milli(l.qty), priceSatang = sat(l.price);
    return { qtyMilli, priceSatang, discountSatang: discSat(l.discount, Math.round((qtyMilli * priceSatang) / 1000)) };
  });
  const lineBad = v.items.map((l, i) => {
    const it = items[i];
    if (!l.name.trim()) return "ใส่ชื่อรายการ";
    if (!(it.qtyMilli > 0)) return "จำนวนต้องมากกว่า 0";
    if (!(it.priceSatang >= 0)) return "ราคาไม่ถูกต้อง";
    if (isPct(l.discount) && Number.isNaN(it.discountSatang)) return "ส่วนลด % ต้องอยู่ระหว่าง 0–100";
    if (!(it.discountSatang >= 0) || it.discountSatang > Math.round((it.qtyMilli * it.priceSatang) / 1000)) return "ส่วนลดเกินราคารวม";
    return "";
  });
  const safeItems = items.map((it, i) => (lineBad[i] ? { qtyMilli: Math.max(0, it.qtyMilli || 0), priceSatang: Math.max(0, it.priceSatang || 0), discountSatang: 0 } : it));
  const subtotal0 = safeItems.reduce((a, it) => a + lineSatang(it), 0);
  const billDiscSat = discSat(v.discount, subtotal0);
  const billBad = Number.isNaN(billDiscSat) || billDiscSat < 0 || billDiscSat > subtotal0;
  const discount = billBad ? 0 : billDiscSat;
  const t = calcTotals(safeItems, discount, v.vatMode, vatRateBp);
  const custSnap = v.customer;

  const view: DocView = {
    type: v.type, no: null, status: "DRAFT", issueDate: v.issueDate, validUntil: v.validUntil, dueDate: v.dueDate, customer: custSnap ?? {},
    items: v.items.map((l, i) => {
      const k = lineImgKey(l, products);
      return { sku: l.sku, name: l.name, detail: l.detail, unit: l.unit, ...safeItems[i], img: k ? thumb(k) : "" };
    }),
    discountSatang: discount, vatMode: v.vatMode, vatRateBp, paymentMethod: v.paymentMethod, paymentTerms: v.paymentTerms, carrier: v.carrier, note: v.note,
    ref: refText, voidReason: "", paidSatang: 0, payRef: "", qr: null, printedAt, shop, signDate: v.signDate,
    credit: isCn ? { reason: v.creditReason ?? "", original: init.creditOriginal ?? 0 } : null,
    signImage: v.signImage, showBank: v.showBank, previewSign: true,
  };
  const overCredit = isCn && init.creditMax !== undefined && t.grand > init.creditMax;

  const payload = JSON.stringify({
    id: init.id, type: v.type, customerId: v.customerId, issueDate: v.issueDate, validUntil: v.validUntil, dueDate: v.dueDate,
    items: v.items.map((l, i) => ({ productId: l.productId || null, sku: l.sku, name: l.name, detail: l.detail, unit: l.unit, image: l.image ?? null, ...items[i] })),
    signDate: v.signDate, signImage: v.signImage, showBank: v.showBank,
    discountSatang: Number.isNaN(billDiscSat) ? -1 : billDiscSat, vatMode: v.vatMode, paymentMethod: v.paymentMethod, paymentTerms: v.paymentTerms, carrier: v.carrier, note: v.note, internalNote: v.internalNote,
    ...(isCn ? { creditReason: v.creditReason ?? "" } : {}),
  });
  const serverBad = (k: string) => state.fields?.includes(k);

  // ต้นทุน/กำไร (เฉพาะเจ้าของร้าน): ต้นทุนต่อหน่วยล่าสุดของสินค้า × จำนวน · รายได้ = ยอดหลังส่วนลด ไม่รวม VAT
  const costOf = (l: LineIn) => (l.productId ? prodById.get(l.productId)?.cost : undefined);
  const priced = v.items.map((l, i) => ({ l, it: safeItems[i] })).filter(({ l, it }) => l.name.trim() && it.qtyMilli > 0 && !prodById.get(l.productId)?.service);
  const noCost = priced.filter(({ l }) => costOf(l) == null).length;
  const totalCost = priced.reduce((a, { l, it }) => a + Math.round(((costOf(l) ?? 0) * it.qtyMilli) / 1000), 0);
  const revenue = v.vatMode === "NONE" ? t.afterDiscount : t.beforeVat;
  const profit = revenue - totalCost;
  /** ไม่มีต้นทุนเลยสักรายการ → ไม่แสดงกำไร (ไม่งั้นขึ้น 100% ทำให้เข้าใจผิด) */
  const costKnown = priced.length > 0 && noCost < priced.length;
  const marginPct = revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : "—";
  const belowCost = (l: LineIn, it: { qtyMilli: number; priceSatang: number; discountSatang: number }) => {
    const c = costOf(l);
    return showCost && c != null && it.qtyMilli > 0 && lineSatang(it) < Math.round((c * it.qtyMilli) / 1000) ? c : null;
  };
  // เตือนสต็อก: จำนวนรวมของสินค้าเดียวกันในเอกสารเกินคงเหลือ
  const qtyByProd = new Map<string, number>();
  v.items.forEach((l, i) => { if (l.productId) qtyByProd.set(l.productId, (qtyByProd.get(l.productId) ?? 0) + Math.max(0, items[i].qtyMilli || 0) / 1000); });
  const stockNote = (l: LineIn) => {
    const p = l.productId ? prodById.get(l.productId) : undefined;
    if (!p || p.service) return "";
    if (p.out) return "สินค้าหมดสต็อก";
    if (p.stock != null && (qtyByProd.get(p.id) ?? 0) > p.stock) return `เกินสต็อก (คงเหลือ ${p.stock.toLocaleString("th-TH")})`;
    return "";
  };

  /** เพิ่มจากหน้าต่างเลือกสินค้า: มีในเอกสารแล้ว = บวกจำนวน (ราคาปรับตามขั้นราคาขายส่งถ้ายังเป็นราคาตั้งต้น) · ใหม่ = ต่อท้าย */
  const addPicked = (picks: { p: Prod; qty: number }[]) => {
    setV((x) => {
      let lines = x.items.filter((l) => l.name.trim() || l.price);
      for (const { p, qty } of picks) {
        const at = lines.findIndex((l) => l.productId === p.id);
        if (at >= 0) {
          const l = lines[at];
          const nq = String(Math.round((num(l.qty) + qty) * 1000) / 1000);
          lines = lines.map((y, j) => (j === at ? { ...y, qty: nq, ...(y.price === priceFor(p, y.qty) ? { price: priceFor(p, nq) } : {}) } : y));
        } else lines = [...lines, withKey({ productId: p.id, sku: p.sku, name: p.name, detail: "", unit: p.unit || "ชิ้น", qty: String(qty), price: priceFor(p, String(qty)), discount: "", image: null })];
      }
      return { ...x, items: lines.length ? lines : [blank()] };
    });
    setDirty(true);
    setPicker(false);
  };
  const dupLine = (key: number) => {
    const i = v.items.findIndex((l) => l.key === key);
    set("items", [...v.items.slice(0, i + 1), withKey(strip(v.items[i])), ...v.items.slice(i + 1)]);
  };
  const insertBelow = (key: number) => {
    const i = v.items.findIndex((l) => l.key === key);
    set("items", [...v.items.slice(0, i + 1), blank(), ...v.items.slice(i + 1)]);
  };
  const snippets = TERM_SNIPPETS[v.type === "QUOTATION" ? "QUOTATION" : "OTHER"];
  const termLines = v.paymentTerms.split("\n").map((x) => x.replace(/^[-•\d.)\s]+/, "").trim());
  const toggleSnippet = (t: string) => {
    const has = termLines.includes(t);
    const lines = v.paymentTerms.split("\n").filter((x) => x.trim());
    set("paymentTerms", (has ? lines.filter((x) => x.replace(/^[-•\d.)\s]+/, "").trim() !== t) : [...lines, `- ${t}`]).join("\n"));
  };

  // Ctrl+S = บันทึกฉบับร่าง
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveBtn.current?.click();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const move = (key: number, dir: -1 | 1) => {
    const i = v.items.findIndex((l) => l.key === key), j = i + dir;
    if (j < 0 || j >= v.items.length) return;
    const n = [...v.items];
    [n[i], n[j]] = [n[j], n[i]];
    set("items", n);
  };
  const addShipping = () => {
    const p = products.find((x) => /^shipping$/i.test(x.sku));
    set("items", [...v.items.filter((l) => l.name.trim() || l.price), withKey({ productId: p?.id ?? "", sku: "Shipping", name: p?.name ?? "ค่าส่งสินค้า", detail: v.carrier, unit: p?.unit ?? "กล่อง", qty: "1", price: ((p?.price ?? 6000) / 100).toFixed(2), discount: "", image: null })]);
  };

  return (
    <main className="main doc-edit">
      <div className="page-head">
        <div>
          <p><Link className="link" href={back}>← กลับ</Link></p>
          <h1>{title}</h1>
          <p>ยังไม่ออกเลขที่จนกว่าจะกด “บันทึกและออกเอกสาร” · ตัวอย่างด้านขวาคือหน้าที่จะพิมพ์จริง</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-outline de-pvtoggle-btn" type="button" onClick={() => setShowPv((x) => !x)}>{showPv ? "ซ่อนตัวอย่าง" : "แสดงตัวอย่าง"}</button>
        </div>
      </div>
      {restore && (
        <div className="login-info dc-restore" role="status">
          มีข้อมูลที่พิมพ์ค้างไว้ในเครื่องนี้ (ยังไม่ได้บันทึก)
          <div className="act-row" style={{ marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" type="button" onClick={() => { setV(restore); setRestore(null); setDirty(true); }}>กู้คืนข้อมูลที่ค้างไว้</button>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => { try { localStorage.removeItem(draftKey); } catch {} setRestore(null); }}>ทิ้ง</button>
          </div>
        </div>
      )}
      <form onSubmit={(e) => { try { localStorage.removeItem(draftKey); } catch {} setDirty(false); onSubmit(e); }}>
        <input type="hidden" name="payload" value={payload} />
        <div className={`de-cols de-edit ${showPv ? "" : "no-pv"}`}>
          <div className="de-form">
            {state.error && <div className="login-err" role="alert">{state.error}</div>}

            <section className="box">
              <h3>ลูกค้า</h3>
              <CustomerPicker
                customers={customers} value={v.customerId} snap={custSnap} bad={serverBad("customer")} vatInvoice={v.type === "RECEIPT" && v.vatMode !== "NONE"}
                onPick={(c) => { set("customerId", c?.id ?? ""); set("customer", c?.snap ?? null); }}
                onCreated={(c) => { setCustomers((x) => [c, ...x]); set("customerId", c.id); set("customer", c.snap); }}
              />
            </section>

            {isCn && (
              <section className="box de-cn">
                <h3>การลดหนี้ / คืนเงิน</h3>
                <p className="sub">แก้รายการด้านล่างให้เหลือเฉพาะส่วนที่ลดหนี้ — เช่น จำนวนที่รับคืน หรือราคาที่ลดให้ต่อหน่วย · ยอดใบเสร็จเดิม ฿{money(init.creditOriginal ?? 0)}{init.creditMax !== undefined && init.creditMax !== init.creditOriginal ? ` · ลดได้อีก ฿${money(init.creditMax)}` : ""}</p>
                <div className="field">
                  <label htmlFor="creditReason">เหตุผลการลดหนี้ (แสดงบนเอกสาร) *</label>
                  <input id="creditReason" list="creditReasons" value={v.creditReason ?? ""} onChange={(e) => set("creditReason", e.target.value)} maxLength={300} style={serverBad("creditReason") ? { borderColor: "var(--c-err)" } : undefined} placeholder="เช่น รับคืนสินค้าชำรุด 1 ชิ้น" />
                  <datalist id="creditReasons">{(lists.reasons ?? []).map((m) => <option key={m} value={m} />)}</datalist>
                </div>
                {overCredit && <div className="login-err" role="alert">ยอดลดหนี้ ฿{money(t.grand)} เกินยอดที่ลดได้ ฿{money(init.creditMax ?? 0)}</div>}
              </section>
            )}

            <section className="box">
              <h3>ข้อมูลเอกสาร</h3>
              <div className="three">
                <div className="field"><label htmlFor="issueDate">วันที่เอกสาร</label><input id="issueDate" type="date" value={v.issueDate} onChange={(e) => set("issueDate", e.target.value)} required /></div>
                {v.type === "QUOTATION" && (
                  <div className="field"><label htmlFor="validUntil">ยืนราคาถึง</label><input id="validUntil" type="date" value={v.validUntil} min={v.issueDate} onChange={(e) => set("validUntil", e.target.value)} style={serverBad("validUntil") ? { borderColor: "var(--c-err)" } : undefined} />
                    <span className="de-quick" role="group" aria-label="ยืนราคาด่วน">{[7, 15, 30, 60].map((n) => (
                      <button key={n} type="button" aria-pressed={v.validUntil === addDays(v.issueDate, n)} onClick={() => set("validUntil", addDays(v.issueDate, n))}>{n} วัน</button>
                    ))}</span></div>
                )}
                {v.type === "INVOICE" && (
                  <div className="field"><label htmlFor="dueDate">ครบกำหนดชำระ</label><input id="dueDate" type="date" value={v.dueDate} min={v.issueDate} onChange={(e) => set("dueDate", e.target.value)} style={serverBad("dueDate") ? { borderColor: "var(--c-err)" } : undefined} />
                    <span className="de-quick" role="group" aria-label="เครดิตด่วน">{[0, 7, 15, 30].map((n) => (
                      <button key={n} type="button" aria-pressed={v.dueDate === addDays(v.issueDate, n)} onClick={() => set("dueDate", addDays(v.issueDate, n))}>{n ? `เครดิต ${n} วัน` : "ชำระทันที"}</button>
                    ))}</span></div>
                )}
                <div className="field"><label htmlFor="payMethod">{v.type === "RECEIPT" ? "ชำระโดย" : isCn ? "คืนเงินโดย" : "วิธีชำระเงิน"}</label>
                  <input id="payMethod" list="payMethods" value={v.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} maxLength={60} />
                  <datalist id="payMethods">{lists.methods.map((m) => <option key={m} value={m} />)}</datalist></div>
                {v.type !== "QUOTATION" && !isCn && <div className="field"><label htmlFor="carrier">ขนส่ง (ถ้ามี)</label>
                  <input id="carrier" list="carriers" value={v.carrier} onChange={(e) => set("carrier", e.target.value)} maxLength={60} placeholder="เช่น EMS, Kerry" />
                  <datalist id="carriers">{lists.carriers.map((m) => <option key={m} value={m} />)}</datalist></div>}
                <div className="field">
                  <label htmlFor="signDate">วันที่ลงนาม{SIGNER[v.type]}</label>
                  <input id="signDate" type="date" value={v.signDate || v.issueDate} onChange={(e) => set("signDate", e.target.value === v.issueDate ? "" : e.target.value)} />
                  <small className="sub">ค่าเริ่มต้น = วันที่เอกสาร · แก้ได้ภายหลังที่หน้าเอกสาร</small>
                </div>
              </div>
            </section>

            <section className="box">
              <div className="de-lines-head">
                <h3>รายการสินค้า <span className="sub">{v.items.filter((l) => l.name.trim()).length} รายการ</span></h3>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => setPicker(true)}>+ เลือกสินค้า</button>
              </div>
              <datalist id="units">{lists.units.map((u) => <option key={u} value={u} />)}</datalist>
              <ol className="de-lines">
                {v.items.map((l, i) => (
                  <li key={l.key} className={`de-line ${lineBad[i] && (l.name || l.price) ? "has-err" : ""} ${serverBad(`line${i}`) ? "has-err" : ""}`}>
                    <span className="drag-h" aria-hidden="true" />
                    <span className="ln-no">{i + 1}</span>
                    <ItemImage
                      label={`รูปรายการที่ ${i + 1}`}
                      current={lineImgKey(l, products)}
                      isDefault={l.image == null}
                      productImgs={(l.productId && products.find((p) => p.id === l.productId)?.imgs) || []}
                      onChange={(image) => setLine(l.key, { image })}
                    />
                    <div className="ln-main">
                      <ProductInput value={l.name} products={products} onText={(name) => setLine(l.key, { name, productId: "" })}
                        onPick={(p) => setLine(l.key, { productId: p.id, sku: p.sku, name: p.name, unit: p.unit || "ชิ้น", price: priceFor(p, l.qty), image: null })} label={`ชื่อรายการที่ ${i + 1}`} />
                      <div className="ln-sub">
                        <input aria-label="รหัสสินค้า" placeholder="รหัสสินค้า" value={l.sku} maxLength={60} onChange={(e) => setLine(l.key, { sku: e.target.value })} />
                        <input aria-label="รายละเอียด" placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" value={l.detail} maxLength={300} onChange={(e) => setLine(l.key, { detail: e.target.value })} />
                      </div>
                    </div>
                    <div className="row-acts">
                      <button className="icon-btn sm" type="button" onClick={() => move(l.key, -1)} disabled={i === 0} aria-label={`เลื่อนรายการที่ ${i + 1} ขึ้น`} data-tip="เลื่อนขึ้น">↑</button>
                      <button className="icon-btn sm" type="button" onClick={() => move(l.key, 1)} disabled={i === v.items.length - 1} aria-label={`เลื่อนรายการที่ ${i + 1} ลง`} data-tip="เลื่อนลง">↓</button>
                      <button className="icon-btn sm" type="button" onClick={() => dupLine(l.key)} aria-label={`ทำสำเนารายการที่ ${i + 1}`} data-tip="ทำสำเนารายการ">⧉</button>
                      <button className="icon-btn sm" type="button" onClick={() => insertBelow(l.key)} aria-label={`แทรกรายการใหม่ใต้รายการที่ ${i + 1}`} data-tip="แทรกรายการใหม่ด้านล่าง">＋</button>
                      <button className="icon-btn sm del" type="button" onClick={() => set("items", v.items.length > 1 ? v.items.filter((x) => x.key !== l.key) : [blank()])} aria-label={`ลบรายการที่ ${i + 1}`} data-tip="ลบรายการ">✕</button>
                    </div>
                    <div className="ln-nums">
                      <label><span>จำนวน</span><input inputMode="decimal" value={l.qty} onChange={(e) => {
                        // ราคายังเป็นราคาตั้งต้นของสินค้า → ปรับตามจำนวนใหม่ (ราคาขายส่ง) · ราคาที่แก้เองไม่แตะ
                        const p = l.productId ? products.find((x) => x.id === l.productId) : undefined;
                        setLine(l.key, { qty: e.target.value, ...(p && l.price === priceFor(p, l.qty) ? { price: priceFor(p, e.target.value) } : {}) });
                      }} /></label>
                      <label><span>หน่วย</span><input list="units" value={l.unit} maxLength={20} onChange={(e) => setLine(l.key, { unit: e.target.value })} /></label>
                      <label><span>ราคา/หน่วย</span><input inputMode="decimal" value={l.price} placeholder="0.00" onChange={(e) => setLine(l.key, { price: e.target.value })} /></label>
                      <label><span>ส่วนลด ฿ / %</span><input inputMode="decimal" value={l.discount} placeholder="0 หรือ 10%" onChange={(e) => setLine(l.key, { discount: e.target.value })} /></label>
                      <div className="ln-amt"><span>รวม</span><b className="num">{lineBad[i] ? "—" : money(lineSatang(items[i]))}</b></div>
                    </div>
                    {(() => {
                      const notes: React.ReactNode[] = [];
                      if (lineBad[i] && (l.name || l.price)) notes.push(<span key="e" className="err-msg">{lineBad[i]}</span>);
                      if (!lineBad[i] && isPct(l.discount) && items[i].discountSatang > 0) notes.push(<span key="p" className="sub">ส่วนลด {l.discount.trim()} = ฿{money(items[i].discountSatang)}</span>);
                      const sn = stockNote(l);
                      if (sn) notes.push(<span key="s" className="ln-warn">{sn}</span>);
                      const bc = !lineBad[i] ? belowCost(l, items[i]) : null;
                      if (bc != null) notes.push(<span key="c" className="ln-warn bad">ขายต่ำกว่าทุน (ทุน ฿{money(bc)}/{l.unit || "หน่วย"})</span>);
                      return notes.length ? <div className="ln-err">{notes}</div> : null;
                    })()}
                  </li>
                ))}
              </ol>
              <div className="de-line-acts">
                <button className="btn btn-outline btn-sm" type="button" onClick={() => setPicker(true)}>+ เลือกสินค้าจากรายการ</button>
                <button className="btn btn-outline btn-sm" type="button" onClick={() => set("items", [...v.items, blank()])}>+ พิมพ์รายการเอง</button>
                <button className="btn btn-outline btn-sm" type="button" onClick={addShipping}>+ ค่าส่งสินค้า</button>
              </div>
            </section>

            <section className="de-sum">
              <div className="de-sumgrid">
                <span>ราคารวมสินค้า</span><b className="num">{money(t.subtotal)}</b>
                <label htmlFor="billDisc">ส่วนลดท้ายบิล (บาท / %)</label><input id="billDisc" inputMode="decimal" value={v.discount} placeholder="0 หรือ 5%" aria-invalid={billBad} onChange={(e) => set("discount", e.target.value)} style={serverBad("discount") || billBad ? { borderColor: "var(--c-err)" } : undefined} />
                {billBad && <><span /><small className="err-msg">{Number.isNaN(billDiscSat) ? "ส่วนลดไม่ถูกต้อง (ใส่ตัวเลข หรือ 0–100%)" : "ส่วนลดเกินราคารวมสินค้า"}</small></>}
                {!billBad && isPct(v.discount) && billDiscSat > 0 && <><span /><small className="sub">{v.discount.trim()} = ฿{money(billDiscSat)}</small></>}
                {t.discount > 0 && <><span>ราคาหลังหักส่วนลด</span><b className="num">{money(t.afterDiscount)}</b></>}
                {vatEnabled && (
                  <>
                    <label htmlFor="vatMode">ภาษีมูลค่าเพิ่ม</label>
                    <select id="vatMode" value={v.vatMode} onChange={(e) => set("vatMode", e.target.value as VatModeT)}>
                      <option value="NONE">ไม่คิด VAT</option><option value="EXCLUSIVE">ราคาไม่รวม VAT (บวกเพิ่ม {vatRateBp / 100}%)</option><option value="INCLUSIVE">ราคารวม VAT แล้ว</option>
                    </select>
                  </>
                )}
                {v.vatMode !== "NONE" && <><span>มูลค่าก่อน VAT</span><b className="num">{money(t.beforeVat)}</b><span>VAT {vatRateBp / 100}%</span><b className="num">{money(t.vat)}</b></>}
                <span className="g">ยอดรวมสุทธิ</span><b className="num g">{money(t.grand)}</b>
              </div>
              <div className="de-words">({bahtText(t.grand)})</div>
              {!vatEnabled && <small className="sub de-vatoff">ร้านตั้งค่า “ไม่คิด VAT” — เปิดได้ที่ ตั้งค่าร้าน › เอกสารขาย</small>}
            </section>

            {showCost && priced.length > 0 && (
              <section className="de-margin" aria-label="ต้นทุนและกำไร (เห็นเฉพาะเจ้าของร้าน)">
                {costKnown ? (
                  <>
                    <div><span>ต้นทุนรวม</span><b className="num">฿{money(totalCost)}</b></div>
                    <div><span>กำไรขั้นต้น</span><b className={`num ${profit < 0 ? "neg" : ""}`}>฿{money(profit)}</b></div>
                    <div><span>อัตรากำไร</span><b className={`num ${profit < 0 ? "neg" : ""}`}>{marginPct}</b></div>
                    <small className="sub">เห็นเฉพาะเจ้าของร้าน ไม่พิมพ์บนเอกสาร · ต้นทุนล่าสุดจากใบสั่งซื้อ/หน้าสินค้า · ไม่รวม VAT{noCost ? ` · ยังไม่มีต้นทุน ${noCost} รายการ (คิดเป็น 0 — กำไรจริงจะน้อยกว่านี้)` : ""}</small>
                  </>
                ) : (
                  <small className="sub">ต้นทุน/กำไร (เห็นเฉพาะเจ้าของร้าน): สินค้าในเอกสารนี้ยังไม่มีต้นทุน — ใส่ได้ที่หน้าสินค้า หรือรับของผ่านใบสั่งซื้อ (PO)</small>
                )}
              </section>
            )}

            <section className="box">
              <div className="de-opts-head">
                <h3>หมายเหตุและเงื่อนไข</h3>
                <div className="de-opts" role="group" aria-label="ตัวเลือกที่พิมพ์บนเอกสาร">
                  <label className={`chk-row${shop.signature || shop.stamp ? "" : " off"}`} title={shop.signature || shop.stamp ? undefined : "ยังไม่ได้อัปโหลดลายเซ็น/ตราประทับ — ตั้งค่าร้าน › เอกสารขาย"}>
                    <input type="checkbox" checked={v.signImage && !!(shop.signature || shop.stamp)} disabled={!(shop.signature || shop.stamp)} onChange={(e) => set("signImage", e.target.checked)} />
                    ใส่ลายเซ็นอิเล็กทรอนิกส์{shop.stamp ? " + ตราประทับ" : ""}
                  </label>
                  {v.type === "QUOTATION" && (
                    <label className={`chk-row${shop.banks.length ? "" : " off"}`} title={shop.banks.length ? undefined : "ยังไม่มีบัญชีธนาคาร — ตั้งค่าร้าน › การชำระเงิน"}>
                      <input type="checkbox" checked={v.showBank && shop.banks.length > 0} disabled={!shop.banks.length} onChange={(e) => set("showBank", e.target.checked)} />
                      แสดงเลขบัญชีธนาคาร (ช่องทางชำระเงิน)
                    </label>
                  )}
                  {!(shop.signature || shop.stamp) && <a className="link sub" href="/admin/settings#signerName" target="_blank" rel="noopener">อัปโหลดลายเซ็นที่ตั้งค่าร้าน</a>}
                </div>
              </div>
              <div className="field"><label htmlFor="terms">{v.type === "QUOTATION" ? "เงื่อนไข (แสดงบนเอกสาร)" : "เงื่อนไขการชำระเงิน (แสดงบนเอกสาร)"}</label><textarea id="terms" rows={4} maxLength={2000} value={v.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} />
                <span className="de-snips" role="group" aria-label="ข้อความเงื่อนไขที่ใช้บ่อย">
                  {snippets.map((t) => {
                    const on = termLines.includes(t);
                    return <button key={t} type="button" aria-pressed={on} onClick={() => toggleSnippet(t)}>{on ? "✓ " : "+ "}{t}</button>;
                  })}
                </span></div>
              <div className="field"><label htmlFor="note">หมายเหตุ (แสดงบนเอกสาร)</label><textarea id="note" rows={2} maxLength={2000} value={v.note} onChange={(e) => set("note", e.target.value)} /></div>
              <div className="field"><label htmlFor="inote">โน้ตภายในร้าน (ไม่แสดงบนเอกสาร)</label><textarea id="inote" rows={2} maxLength={2000} value={v.internalNote} onChange={(e) => set("internalNote", e.target.value)} /></div>
            </section>

            <div className="de-foot">
              <Link className="btn btn-ghost" href={back}>ยกเลิก</Link>
              <span className="de-foot-sum" aria-live="polite">
                <span>{v.items.filter((l) => l.name.trim()).length} รายการ</span>
                <b>ยอดสุทธิ ฿{money(t.grand)}</b>
                {showCost && costKnown && <span className={profit < 0 ? "neg" : ""} title={noCost ? "ต้นทุนไม่ครบทุกรายการ" : undefined}>กำไร {marginPct}{noCost ? "*" : ""}</span>}
              </span>
              <span className="spacer" />
              <button ref={saveBtn} className="btn btn-outline" type="submit" name="intent" value="save" disabled={pending} title="Ctrl+S">{pending ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}</button>
              <button className="btn btn-primary" type="submit" name="intent" value="issue" disabled={pending}>บันทึกและออกเอกสาร</button>
            </div>
          </div>
          {picker && (
            <ProductPicker
              products={products}
              inDoc={new Map([...qtyByProd.entries()].map(([k, q]) => [k, q]))}
              onAdd={(picks) => addPicked(picks.map(({ p, qty }) => ({ p: prodById.get(p.id)!, qty })))}
              onClose={() => setPicker(false)}
            />
          )}
          {showPv && (
            <aside className="de-pv" aria-label="ตัวอย่างเอกสาร">
              <div className="de-pvbar"><b>ตัวอย่าง A4</b><span className="sub">อัปเดตทันทีขณะพิมพ์</span></div>
              <DocSheets view={view} fit />
            </aside>
          )}
        </div>
      </form>
    </main>
  );
}

const SIGNER: Record<DocTypeT, string> = { QUOTATION: "ผู้เสนอราคา", INVOICE: "ผู้วางบิล", RECEIPT: "ผู้รับเงิน", CREDIT_NOTE: "ผู้อนุมัติ" };

// ---------------------------------------------------------------------------
/** รูปหน้ารายการ: กดเพื่อเลือกรูปอื่นของสินค้า · อัปโหลดรูปใหม่ · ไม่แสดงรูป · กลับไปใช้รูปสินค้า */
function ItemImage({ label, current, isDefault, productImgs, onChange }: { label: string; current: string; isDefault: boolean; productImgs: string[]; onChange: (image: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const upload = async (f: File) => {
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("file", f);
    const r = await uploadEditorImage(fd);
    setBusy(false);
    if (r.error || !r.url) return setErr(r.error ?? "อัปโหลดไม่สำเร็จ");
    onChange(r.url.replace(/^\/media\//, ""));
    setOpen(false);
  };
  return (
    <div className="ln-img" ref={box}>
      <button type="button" className={`ln-img-btn${current ? "" : " empty"}`} aria-label={`${label} (กดเพื่อเปลี่ยน)`} aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {current ? <img src={thumb(current)} alt="" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m3 16 5-5 4 4 3-3 6 6M15.5 9.5h.01" /></svg>}
        <span className="ln-img-edit" aria-hidden="true">เปลี่ยน</span>
      </button>
      {open && (
        <div className="ln-img-pop" role="dialog" aria-label={label}>
          {productImgs.length > 0 && (
            <>
              <b>รูปของสินค้านี้</b>
              <div className="ln-img-grid">
                {productImgs.map((k, j) => (
                  <button key={k} type="button" className={current === k ? "on" : ""} aria-label={`ใช้รูปที่ ${j + 1}`} onClick={() => { onChange(j === 0 ? null : k); setOpen(false); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb(k)} alt="" />
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="ln-img-acts">
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? "กำลังอัปโหลด…" : "อัปโหลดรูปใหม่"}</button>
            {current && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(""); setOpen(false); }}>ไม่แสดงรูป</button>}
            {!isDefault && productImgs.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(null); setOpen(false); }}>ใช้รูปสินค้า</button>}
          </div>
          {err && <small className="err-msg">{err}</small>}
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProductInput({ value, products, onText, onPick, label }: { value: string; products: Prod[]; onText: (s: string) => void; onPick: (p: Prod) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const lid = useId();
  const q = value.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const list = q ? products.filter((p) => { const h = `${p.sku} ${p.name}`.toLowerCase(); return words.every((w) => h.includes(w)); }).slice(0, 8) : [];
  const pick = (p: Prod) => { onPick(p); setOpen(false); };
  return (
    <div className="ac-wrap">
      <input aria-label={label} placeholder="พิมพ์ชื่อหรือรหัสสินค้า เพื่อค้นหา หรือพิมพ์รายการเอง" value={value} maxLength={250} autoComplete="off"
        role="combobox" aria-controls={lid} aria-expanded={open && list.length > 0} aria-autocomplete="list"
        onChange={(e) => { onText(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !list.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(list[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && list.length > 0 && (
        <div className="ac-list" role="listbox" id={lid}>
          {list.map((p, i) => (
            <div key={p.id} role="option" aria-selected={i === hi} className={`ac-o ac-prod ${i === hi ? "on" : ""}`} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.imgs?.[0] ? <img className="ac-img" src={thumb(p.imgs[0])} alt="" loading="lazy" /> : <span className="ac-img" aria-hidden="true" />}
              <span className="ac-txt">
                <b>{p.name}</b>
                <span>{p.sku} · {p.price ? `฿${money(p.price)}` : "สอบถามราคา"} / {p.unit}{p.service ? " · ค่าบริการ" : ""}{p.off ? " · ปิดขายหน้าเว็บ" : ""}{p.out ? " · หมด" : p.stock != null ? ` · คงเหลือ ${p.stock}` : ""}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function CustomerPicker({ customers, value, snap, bad, vatInvoice, onPick, onCreated }: {
  customers: Cust[]; value: string; snap: CustSnap | null; bad?: boolean; vatInvoice: boolean; onPick: (c: Cust | null) => void; onCreated: (c: Cust) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const s = q.trim().toLowerCase(), digits = s.replace(/\D/g, "");
  const list = s
    ? customers.filter((c) => (c.snap.name ?? "").toLowerCase().includes(s) || c.snap.code === s || (digits.length >= 3 && ((c.snap.phone ?? "").replace(/\D/g, "").includes(digits) || (c.snap.taxId ?? "").includes(digits)))).slice(0, 8)
    : customers.slice(0, 8);
  if (adding) return <QuickCustomer onCancel={() => setAdding(false)} onCreated={(c) => { setAdding(false); onCreated(c); }} initialName={q} />;
  if (value && snap)
    return (
      <div className="de-cust">
        <div>
          <b>{snap.name}</b>
          <span className="sub">รหัส {snap.code}{snap.kind === "COMPANY" ? ` · นิติบุคคล (${snap.branch || "สำนักงานใหญ่"})` : ""}{snap.taxId ? ` · เลขผู้เสียภาษี ${snap.taxId}` : ""}</span>
          <span className="sub">{[snap.address?.line, snap.address?.sub, snap.address?.dist, snap.address?.prov, snap.address?.zip].filter(Boolean).join(" ") || "ไม่มีที่อยู่"}{snap.phone ? ` · โทร ${snap.phone}` : ""}</span>
          {vatInvoice && snap.kind === "COMPANY" && !isValidThaiTaxId(snap.taxId ?? "") && <span className="err-msg">ใบกำกับภาษีของนิติบุคคลต้องมีเลขผู้เสียภาษี — แก้ไขข้อมูลลูกค้าก่อน</span>}
        </div>
        <div className="de-cust-acts">
          <a className="btn btn-ghost btn-sm" href={`/admin/customers/${value}`} target="_blank" rel="noopener">แก้ไขข้อมูลลูกค้า</a>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => onPick(null)}>เปลี่ยนลูกค้า</button>
        </div>
      </div>
    );
  return (
    <div className="de-cpick">
      <div className="ac-wrap">
        <input aria-label="ค้นหาลูกค้า" placeholder="ค้นหาชื่อ, รหัส, เบอร์โทร หรือเลขผู้เสียภาษี" value={q} autoComplete="off" style={bad ? { borderColor: "var(--c-err)" } : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {open && (
          <div className="ac-list" role="listbox">
            {list.map((c) => (
              <div key={c.id} role="option" aria-selected="false" className="ac-o" onMouseDown={(e) => { e.preventDefault(); onPick(c); setQ(""); setOpen(false); }}>
                <b>{c.snap.code} · {c.snap.name}</b><span>{[c.snap.phone, c.snap.taxId, c.snap.address?.prov].filter(Boolean).join(" · ") || "—"}</span>
              </div>
            ))}
            {!list.length && <div className="ac-none">ไม่พบลูกค้า “{q}” — กด “+ ลูกค้าใหม่”</div>}
          </div>
        )}
      </div>
      <button className="btn btn-outline" type="button" onClick={() => setAdding(true)}>+ ลูกค้าใหม่</button>
    </div>
  );
}

/** เพิ่มลูกค้าใหม่ในตัวแก้ไข (ไม่ต้องออกจากหน้า) — ใช้ div แทน form เพราะอยู่ในฟอร์มเอกสาร */
function QuickCustomer({ onCancel, onCreated, initialName }: { onCancel: () => void; onCreated: (c: Cust) => void; initialName: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CustomerState>({});
  const [pending, setPending] = useState(false);
  const [kind, setKind] = useState<"PERSON" | "COMPANY">("PERSON");
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  const submit = async () => {
    const fd = new FormData();
    box.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[name]").forEach((el) => fd.set(el.name, el.value));
    fd.set("inline", "1");
    fd.set("kind", kind);
    setPending(true);
    try {
      const r = await saveCustomer({}, fd);
      setState(r);
      if (r.created) onCreated(r.created);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="cu-form" ref={box} onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); void submit(); } }}>
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      <div className="seg" role="group" aria-label="ประเภทลูกค้า">
        <button type="button" aria-pressed={kind === "PERSON"} onClick={() => setKind("PERSON")}>บุคคลธรรมดา</button>
        <button type="button" aria-pressed={kind === "COMPANY"} onClick={() => setKind("COMPANY")}>นิติบุคคล / บริษัท</button>
      </div>
      <div className="two">
        <div className="field"><label htmlFor="qcName">ชื่อลูกค้า / บริษัท</label><input id="qcName" name="name" defaultValue={initialName} maxLength={200} {...bad("name")} autoFocus /></div>
        <div className="field"><label htmlFor="qcPhone">เบอร์โทร</label><input id="qcPhone" name="phone" inputMode="tel" maxLength={20} {...bad("phone")} /></div>
      </div>
      <div className="two">
        <div className="field"><label htmlFor="qcTax">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label><input id="qcTax" name="taxId" inputMode="numeric" maxLength={17} {...bad("taxId")} /></div>
        {kind === "COMPANY" ? (
          <div className="field"><label htmlFor="qcBranch">สาขา</label>
            <select id="qcBranch" name="branchType" defaultValue="hq"><option value="hq">สำนักงานใหญ่</option><option value="branch">สาขา (ระบุเลขในหน้าลูกค้า)</option></select></div>
        ) : <div className="field"><label htmlFor="qcEmail">อีเมล</label><input id="qcEmail" name="email" type="email" maxLength={120} {...bad("email")} /></div>}
      </div>
      <div className="field"><label htmlFor="qcAddr">ที่อยู่ (บ้านเลขที่ ถนน)</label><input id="qcAddr" name="addressLine" maxLength={300} /></div>
      <div className="four">
        <div className="field"><label htmlFor="qcSub">ตำบล/แขวง</label><input id="qcSub" name="subdistrict" maxLength={80} /></div>
        <div className="field"><label htmlFor="qcDist">อำเภอ/เขต</label><input id="qcDist" name="district" maxLength={80} /></div>
        <div className="field"><label htmlFor="qcProv">จังหวัด</label><input id="qcProv" name="province" maxLength={80} /></div>
        <div className="field"><label htmlFor="qcZip">รหัสไปรษณีย์</label><input id="qcZip" name="postalCode" inputMode="numeric" maxLength={5} {...bad("postalCode")} /></div>
      </div>
      <div className="act-row">
        <button className="btn btn-outline btn-sm" type="button" onClick={onCancel}>ยกเลิก</button>
        <button className="btn btn-primary btn-sm" type="button" onClick={submit} disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกลูกค้าและเลือก"}</button>
      </div>
    </div>
  );
}
