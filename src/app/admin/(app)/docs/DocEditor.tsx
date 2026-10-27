"use client";
// ตัวแก้ไขเอกสารขาย: ซ้าย = ฟอร์ม (ลูกค้า, รายการ, ส่วนลด, VAT, เงื่อนไข) · ขวา = ตัวอย่าง A4 จริงที่อัปเดตทันทีขณะพิมพ์
// ยอดในหน้านี้ใช้แสดงผลเท่านั้น — server คำนวณใหม่ทุกครั้งที่บันทึก · ร่างที่พิมพ์ค้างไว้เก็บในเบราว์เซอร์กันหาย
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { bahtText, calcTotals, lineSatang, money, type DocTypeT, type VatModeT } from "@/lib/doc-calc";
import type { CustSnap, DocView, ShopHead } from "@/lib/doc-render";
import { isValidThaiTaxId } from "@/lib/format";
import { unitPriceSatang, type Tier } from "@/lib/pricing";
import { DocSheets } from "../../_components/DocSheets";
import { useFormAction } from "../../_components/useFormAction";
import { saveCustomer, type CustomerState } from "../customers/actions";
import { saveDoc, type DocState } from "./actions";

type LineIn = { productId: string; sku: string; name: string; detail: string; unit: string; qty: string; price: string; discount: string };
type Line = LineIn & { key: number };
export type EditorInit = {
  id?: string; type: DocTypeT; customerId: string; customer: CustSnap | null; issueDate: string; validUntil: string; dueDate: string;
  items: LineIn[]; discount: string; vatMode: VatModeT; paymentMethod: string; paymentTerms: string; carrier: string; note: string; internalNote: string;
};
type Cust = { id: string; snap: CustSnap };
/** price = ราคาขายจริง 1 ชิ้น (รวมราคาลดตามช่วงเวลา) · tiers = ราคาขายส่งตามจำนวน */
type Prod = { id: string; sku: string; name: string; unit: string; price: number; service: boolean; off: boolean; tiers?: Tier[] };
/** ราคาตั้งต้นของสินค้าตามจำนวน (unitPriceSatang แบบเดียวกับหน้าร้าน) เป็นบาท "0.00" */
const priceFor = (p: Prod, qty: string) => (unitPriceSatang({ priceSatang: p.price, tierPrices: p.tiers }, Math.max(1, Math.floor(num(qty)) || 1)) / 100).toFixed(2);

const num = (s: string) => {
  const n = Number(String(s).replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const sat = (s: string) => (String(s).trim() === "" ? 0 : Math.round(num(s) * 100));
const milli = (s: string) => Math.round(num(s) * 1000);
let K = 1;
const withKey = (l: LineIn): Line => ({ ...l, key: K++ });
const strip = ({ key, ...l }: Line): LineIn => (void key, l);
const blank = (): Line => withKey({ productId: "", sku: "", name: "", detail: "", unit: "ชิ้น", qty: "1", price: "", discount: "" });

export function DocEditor({ init, title, back, customers: cust0, products, shop, vatEnabled, vatRateBp, refText, printedAt, lists }: {
  init: EditorInit; title: string; back: string; customers: Cust[]; products: Prod[]; shop: ShopHead; vatEnabled: boolean; vatRateBp: number;
  refText: string; printedAt: string; lists: { methods: string[]; carriers: string[]; units: string[] };
}) {
  const draftKey = `mdw_doc_draft_${init.id ?? `new-${init.type}`}`;
  const [state, onSubmit, pending] = useFormAction<DocState>(saveDoc, {});
  const [v, setV] = useState(() => ({ ...init, items: init.items.length ? init.items.map(withKey) : [blank()] }));
  const [customers, setCustomers] = useState(cust0);
  const [dirty, setDirty] = useState(false);
  const [restore, setRestore] = useState<typeof v | null>(null);
  const [showPv, setShowPv] = useState(true);
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

  const items = v.items.map((l) => ({ qtyMilli: milli(l.qty), priceSatang: sat(l.price), discountSatang: sat(l.discount) }));
  const lineBad = v.items.map((l, i) => {
    const it = items[i];
    if (!l.name.trim()) return "ใส่ชื่อรายการ";
    if (!(it.qtyMilli > 0)) return "จำนวนต้องมากกว่า 0";
    if (!(it.priceSatang >= 0)) return "ราคาไม่ถูกต้อง";
    if (!(it.discountSatang >= 0) || it.discountSatang > Math.round((it.qtyMilli * it.priceSatang) / 1000)) return "ส่วนลดเกินราคารวม";
    return "";
  });
  const safeItems = items.map((it, i) => (lineBad[i] ? { qtyMilli: Math.max(0, it.qtyMilli || 0), priceSatang: Math.max(0, it.priceSatang || 0), discountSatang: 0 } : it));
  const discount = Math.max(0, sat(v.discount) || 0);
  const t = calcTotals(safeItems, discount, v.vatMode, vatRateBp);
  const custSnap = v.customer;

  const view: DocView = {
    type: v.type, no: null, status: "DRAFT", issueDate: v.issueDate, validUntil: v.validUntil, dueDate: v.dueDate, customer: custSnap ?? {},
    items: v.items.map((l, i) => ({ sku: l.sku, name: l.name, detail: l.detail, unit: l.unit, ...safeItems[i] })),
    discountSatang: discount, vatMode: v.vatMode, vatRateBp, paymentMethod: v.paymentMethod, paymentTerms: v.paymentTerms, carrier: v.carrier, note: v.note,
    ref: refText, voidReason: "", paidSatang: 0, payRef: "", qr: null, printedAt, shop,
  };

  const payload = JSON.stringify({
    id: init.id, type: v.type, customerId: v.customerId, issueDate: v.issueDate, validUntil: v.validUntil, dueDate: v.dueDate,
    items: v.items.map((l, i) => ({ productId: l.productId || null, sku: l.sku, name: l.name, detail: l.detail, unit: l.unit, ...items[i] })),
    discountSatang: sat(v.discount), vatMode: v.vatMode, paymentMethod: v.paymentMethod, paymentTerms: v.paymentTerms, carrier: v.carrier, note: v.note, internalNote: v.internalNote,
  });
  const serverBad = (k: string) => state.fields?.includes(k);

  const move = (key: number, dir: -1 | 1) => {
    const i = v.items.findIndex((l) => l.key === key), j = i + dir;
    if (j < 0 || j >= v.items.length) return;
    const n = [...v.items];
    [n[i], n[j]] = [n[j], n[i]];
    set("items", n);
  };
  const addShipping = () => {
    const p = products.find((x) => /^shipping$/i.test(x.sku));
    set("items", [...v.items.filter((l) => l.name.trim() || l.price), withKey({ productId: p?.id ?? "", sku: "Shipping", name: p?.name ?? "ค่าส่งสินค้า", detail: v.carrier, unit: p?.unit ?? "กล่อง", qty: "1", price: ((p?.price ?? 6000) / 100).toFixed(2), discount: "" })]);
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

            <section className="box">
              <h3>ข้อมูลเอกสาร</h3>
              <div className="three">
                <div className="field"><label htmlFor="issueDate">วันที่เอกสาร</label><input id="issueDate" type="date" value={v.issueDate} onChange={(e) => set("issueDate", e.target.value)} required /></div>
                {v.type === "QUOTATION" && <div className="field"><label htmlFor="validUntil">ยืนราคาถึง</label><input id="validUntil" type="date" value={v.validUntil} min={v.issueDate} onChange={(e) => set("validUntil", e.target.value)} style={serverBad("validUntil") ? { borderColor: "var(--c-err)" } : undefined} /></div>}
                {v.type === "INVOICE" && <div className="field"><label htmlFor="dueDate">ครบกำหนดชำระ</label><input id="dueDate" type="date" value={v.dueDate} min={v.issueDate} onChange={(e) => set("dueDate", e.target.value)} style={serverBad("dueDate") ? { borderColor: "var(--c-err)" } : undefined} /></div>}
                <div className="field"><label htmlFor="payMethod">{v.type === "RECEIPT" ? "ชำระโดย" : "วิธีชำระเงิน"}</label>
                  <input id="payMethod" list="payMethods" value={v.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} maxLength={60} />
                  <datalist id="payMethods">{lists.methods.map((m) => <option key={m} value={m} />)}</datalist></div>
                {v.type !== "QUOTATION" && <div className="field"><label htmlFor="carrier">ขนส่ง (ถ้ามี)</label>
                  <input id="carrier" list="carriers" value={v.carrier} onChange={(e) => set("carrier", e.target.value)} maxLength={60} placeholder="เช่น EMS, Kerry" />
                  <datalist id="carriers">{lists.carriers.map((m) => <option key={m} value={m} />)}</datalist></div>}
              </div>
            </section>

            <section className="box">
              <h3>รายการสินค้า <span className="sub">{v.items.length} รายการ</span></h3>
              <datalist id="units">{lists.units.map((u) => <option key={u} value={u} />)}</datalist>
              <ol className="de-lines">
                {v.items.map((l, i) => (
                  <li key={l.key} className={`de-line ${lineBad[i] && (l.name || l.price) ? "has-err" : ""} ${serverBad(`line${i}`) ? "has-err" : ""}`}>
                    <span className="drag-h" aria-hidden="true" />
                    <span className="ln-no">{i + 1}</span>
                    <div className="ln-main">
                      <ProductInput value={l.name} products={products} onText={(name) => setLine(l.key, { name, productId: "" })}
                        onPick={(p) => setLine(l.key, { productId: p.id, sku: p.sku, name: p.name, unit: p.unit || "ชิ้น", price: priceFor(p, l.qty) })} label={`ชื่อรายการที่ ${i + 1}`} />
                      <div className="ln-sub">
                        <input aria-label="รหัสสินค้า" placeholder="รหัสสินค้า" value={l.sku} maxLength={60} onChange={(e) => setLine(l.key, { sku: e.target.value })} />
                        <input aria-label="รายละเอียด" placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" value={l.detail} maxLength={300} onChange={(e) => setLine(l.key, { detail: e.target.value })} />
                      </div>
                    </div>
                    <div className="row-acts">
                      <button className="icon-btn sm" type="button" onClick={() => move(l.key, -1)} disabled={i === 0} aria-label="เลื่อนขึ้น">↑</button>
                      <button className="icon-btn sm" type="button" onClick={() => move(l.key, 1)} disabled={i === v.items.length - 1} aria-label="เลื่อนลง">↓</button>
                      <button className="icon-btn sm" type="button" onClick={() => set("items", v.items.length > 1 ? v.items.filter((x) => x.key !== l.key) : [blank()])} aria-label={`ลบรายการที่ ${i + 1}`}>✕</button>
                    </div>
                    <div className="ln-nums">
                      <label><span>จำนวน</span><input inputMode="decimal" value={l.qty} onChange={(e) => {
                        // ราคายังเป็นราคาตั้งต้นของสินค้า → ปรับตามจำนวนใหม่ (ราคาขายส่ง) · ราคาที่แก้เองไม่แตะ
                        const p = l.productId ? products.find((x) => x.id === l.productId) : undefined;
                        setLine(l.key, { qty: e.target.value, ...(p && l.price === priceFor(p, l.qty) ? { price: priceFor(p, e.target.value) } : {}) });
                      }} /></label>
                      <label><span>หน่วย</span><input list="units" value={l.unit} maxLength={20} onChange={(e) => setLine(l.key, { unit: e.target.value })} /></label>
                      <label><span>ราคา/หน่วย</span><input inputMode="decimal" value={l.price} placeholder="0.00" onChange={(e) => setLine(l.key, { price: e.target.value })} /></label>
                      <label><span>ส่วนลด (บาท)</span><input inputMode="decimal" value={l.discount} placeholder="0" onChange={(e) => setLine(l.key, { discount: e.target.value })} /></label>
                      <div className="ln-amt"><span>รวม</span><b className="num">{lineBad[i] ? "—" : money(lineSatang(items[i]))}</b></div>
                    </div>
                    {lineBad[i] && (l.name || l.price) ? <small className="ln-err err-msg">{lineBad[i]}</small> : null}
                  </li>
                ))}
              </ol>
              <div className="de-line-acts">
                <button className="btn btn-outline btn-sm" type="button" onClick={() => set("items", [...v.items, blank()])}>+ เพิ่มรายการ</button>
                <button className="btn btn-outline btn-sm" type="button" onClick={addShipping}>+ ค่าส่งสินค้า</button>
              </div>
            </section>

            <section className="de-sum">
              <div className="de-sumgrid">
                <span>ราคารวมสินค้า</span><b className="num">{money(t.subtotal)}</b>
                <label htmlFor="billDisc">ส่วนลดท้ายบิล (บาท)</label><input id="billDisc" inputMode="decimal" value={v.discount} placeholder="0.00" onChange={(e) => set("discount", e.target.value)} style={serverBad("discount") ? { borderColor: "var(--c-err)" } : undefined} />
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

            <section className="box">
              <h3>หมายเหตุและเงื่อนไข</h3>
              <div className="field"><label htmlFor="terms">{v.type === "QUOTATION" ? "เงื่อนไข (แสดงบนเอกสาร)" : "เงื่อนไขการชำระเงิน (แสดงบนเอกสาร)"}</label><textarea id="terms" rows={3} maxLength={2000} value={v.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} /></div>
              <div className="field"><label htmlFor="note">หมายเหตุ (แสดงบนเอกสาร)</label><textarea id="note" rows={2} maxLength={2000} value={v.note} onChange={(e) => set("note", e.target.value)} /></div>
              <div className="field"><label htmlFor="inote">โน้ตภายในร้าน (ไม่แสดงบนเอกสาร)</label><textarea id="inote" rows={2} maxLength={2000} value={v.internalNote} onChange={(e) => set("internalNote", e.target.value)} /></div>
            </section>

            <div className="de-foot">
              <Link className="btn btn-ghost" href={back}>ยกเลิก</Link>
              <span className="spacer" />
              <button className="btn btn-outline" type="submit" name="intent" value="save" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}</button>
              <button className="btn btn-primary" type="submit" name="intent" value="issue" disabled={pending}>บันทึกและออกเอกสาร</button>
            </div>
          </div>
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

// ---------------------------------------------------------------------------
function ProductInput({ value, products, onText, onPick, label }: { value: string; products: Prod[]; onText: (s: string) => void; onPick: (p: Prod) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const lid = useId();
  const q = value.trim().toLowerCase();
  const list = q ? products.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8) : [];
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
            <div key={p.id} role="option" aria-selected={i === hi} className={`ac-o ${i === hi ? "on" : ""}`} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              <b>{p.name}</b><span>{p.sku} · {p.price ? `฿${money(p.price)}` : "สอบถามราคา"} / {p.unit}{p.service ? " · ค่าบริการ" : ""}{p.off ? " · ปิดขายหน้าเว็บ" : ""}</span>
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
