"use client";
// ฟอร์มคำสั่งซื้อฝั่งเบราว์เซอร์: แก้ไขก่อนจัดส่ง, สร้างคำสั่งซื้อจากหลังร้าน, นำเข้าเลขพัสดุ CSV, เลือกหลายรายการพิมพ์ใบปะหน้า
// ทุกยอดเงินที่แสดงเป็นแค่ตัวอย่าง — server คำนวณใหม่ทั้งหมดตอนบันทึก
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import {
  applyShipCsv, createManualOrder, editOrder, findCustomers, previewShipCsv, type ManualPayload, type OrderFormState, type ShipCsvState,
} from "../order-actions";

const baht = (satang: number) => "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 });
const toSat = (s: string) => {
  const n = Number(String(s).replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

/* ---------- ช่องที่อยู่ + ใบกำกับภาษี (ใช้ร่วมกัน) ---------- */
export type Addr = { name: string; phone: string; email: string; addr: string; sub: string; dist: string; prov: string; zip: string; note: string };
export type Tax = { want: boolean; kind: "COMPANY" | "PERSON"; name: string; taxId: string; branch: string; address: string };
const EMPTY_TAX: Tax = { want: false, kind: "COMPANY", name: "", taxId: "", branch: "สำนักงานใหญ่", address: "" };

function taxIdOk(id: string) {
  const d = id.replace(/\D/g, "");
  if (d.length !== 13) return false;
  const sum = [...d.slice(0, 12)].reduce((s, c, i) => s + Number(c) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

function AddrFields({ a, set, bad, optional }: { a: Addr; set: (a: Addr) => void; bad: (k: string) => string; optional?: boolean }) {
  const f = (k: keyof Addr, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={`a-${k}`}>{label}</label>
      <input id={`a-${k}`} value={a[k]} onChange={(e) => set({ ...a, [k]: e.target.value })} className={bad(k === "addr" ? "addr" : k)} {...props} />
    </div>
  );
  return (
    <>
      <div className="two">
        {f("name", "ชื่อผู้รับ", { required: true, maxLength: 120, autoComplete: "off" })}
        {f("phone", "เบอร์โทร", { required: true, inputMode: "tel", maxLength: 20, placeholder: "08x-xxx-xxxx" })}
      </div>
      {f("addr", optional ? "ที่อยู่ (ไม่บังคับเมื่อรับที่ร้าน)" : "ที่อยู่", { required: !optional, maxLength: 300, placeholder: "บ้านเลขที่ หมู่ ซอย ถนน" })}
      <div className="two">
        {f("sub", "ตำบล/แขวง", { required: !optional, maxLength: 120 })}
        {f("dist", "อำเภอ/เขต", { required: !optional, maxLength: 120 })}
      </div>
      <div className="two">
        {f("prov", "จังหวัด", { required: !optional, maxLength: 120 })}
        {f("zip", "รหัสไปรษณีย์", { required: !optional, inputMode: "numeric", maxLength: 5, pattern: "\\d{5}" })}
      </div>
      {f("email", "อีเมล (ไม่บังคับ)", { type: "email", maxLength: 160 })}
      <div className="field">
        <label htmlFor="a-note">หมายเหตุ</label>
        <textarea id="a-note" rows={2} maxLength={500} value={a.note} onChange={(e) => set({ ...a, note: e.target.value })} />
      </div>
    </>
  );
}

function TaxFields({ t, set, bad }: { t: Tax; set: (t: Tax) => void; bad: (k: string) => string }) {
  const tidBad = t.taxId.replace(/\D/g, "").length === 13 && !taxIdOk(t.taxId);
  return (
    <>
      <label className="chk-row"><input type="checkbox" checked={t.want} onChange={(e) => set({ ...t, want: e.target.checked })} /> ลูกค้าขอใบกำกับภาษี / ออกบิลในนามบริษัท</label>
      {t.want && (
        <>
          <div className="seg" role="radiogroup" aria-label="ประเภทผู้ซื้อ" style={{ width: "max-content" }}>
            <button type="button" aria-checked={t.kind === "COMPANY"} role="radio" onClick={() => set({ ...t, kind: "COMPANY", branch: t.branch || "สำนักงานใหญ่" })}>นิติบุคคล</button>
            <button type="button" aria-checked={t.kind === "PERSON"} role="radio" onClick={() => set({ ...t, kind: "PERSON", branch: "" })}>บุคคลธรรมดา</button>
          </div>
          <div className="field">
            <label htmlFor="t-name">{t.kind === "COMPANY" ? "ชื่อบริษัท/ห้างร้าน" : "ชื่อ-นามสกุล"}</label>
            <input id="t-name" value={t.name} maxLength={200} onChange={(e) => set({ ...t, name: e.target.value })} className={bad("tax.name")} />
          </div>
          <div className="two">
            <div className="field">
              <label htmlFor="t-id">เลขประจำตัวผู้เสียภาษี 13 หลัก</label>
              <input id="t-id" value={t.taxId} inputMode="numeric" maxLength={17} onChange={(e) => set({ ...t, taxId: e.target.value })} className={bad("tax.taxId") || (tidBad ? "bad" : "")} />
              {tidBad && <small className="l3-neg">เลขไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน)</small>}
            </div>
            <div className="field">
              <label htmlFor="t-br">สาขา</label>
              <input id="t-br" value={t.branch} maxLength={60} placeholder={t.kind === "COMPANY" ? "สำนักงานใหญ่ หรือ 00001" : "—"} onChange={(e) => set({ ...t, branch: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="t-addr">ที่อยู่ออกบิล</label>
            <textarea id="t-addr" rows={2} maxLength={500} value={t.address} onChange={(e) => set({ ...t, address: e.target.value })} className={bad("tax.address")} />
          </div>
        </>
      )}
    </>
  );
}

/* ---------- แก้ไขคำสั่งซื้อก่อนจัดส่ง ---------- */
export function EditOrderForm({ orderNo, ret, init, tax, cancelHref }: { orderNo: string; ret: string; init: Addr; tax: Tax | null; cancelHref: string }) {
  const [state, onSubmit, pending] = useFormAction<OrderFormState>(editOrder, {});
  const [a, setA] = useState(init);
  const [t, setT] = useState<Tax>(tax ?? EMPTY_TAX);
  const bad = (k: string) => (state.fields?.includes(k) ? "bad" : "");
  return (
    <form className="l3-form" onSubmit={onSubmit} id="editOrderForm">
      <input type="hidden" name="orderNo" value={orderNo} />
      <input type="hidden" name="ret" value={ret} />
      <input type="hidden" name="data" value={JSON.stringify({ ...a, tax: t })} />
      <AddrFields a={a} set={setA} bad={bad} />
      <TaxFields t={t} set={setT} bad={bad} />
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      <p className="l3-note">ทุกการแก้ไขถูกบันทึกในประวัติของคำสั่งซื้อ (ค่าเดิม → ค่าใหม่) · แก้ได้จนกว่าจะจัดส่ง</p>
      <div className="act-row">
        <a className="btn btn-outline" href={cancelHref}>ยกเลิก</a>
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button>
      </div>
    </form>
  );
}

/* ---------- สร้างคำสั่งซื้อจากหลังร้าน ---------- */
export type PickProduct = { id: string; sku: string; name: string; priceSatang: number; trackStock: boolean; stock: number; inStock: boolean; isActive: boolean };
type Line = { productId: string; qty: string; price: string };
type Cust = Awaited<ReturnType<typeof findCustomers>>[number];

export function ManualOrderForm({ products, tiers, expressEnabled, expressExtraSatang, sources }: {
  products: PickProduct[]; tiers: { minSatang: number; feeSatang: number }[]; expressEnabled: boolean; expressExtraSatang: number; sources: string[];
}) {
  const [state, onSubmit, pending] = useFormAction<OrderFormState>(createManualOrder, {});
  const [a, setA] = useState<Addr>({ name: "", phone: "", email: "", addr: "", sub: "", dist: "", prov: "", zip: "", note: "" });
  const [t, setT] = useState<Tax>(EMPTY_TAX);
  const [cust, setCust] = useState<Cust | null>(null);
  const [cq, setCq] = useState("");
  const [cres, setCres] = useState<Cust[]>([]);
  const [pq, setPq] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [source, setSource] = useState(sources[0]);
  const [shipping, setShipping] = useState<ManualPayload["shipping"]>("std");
  const [shipFee, setShipFee] = useState("");
  const [paid, setPaid] = useState(false);
  const [payMethod, setPayMethod] = useState("โอนเงินผ่านธนาคาร");
  const [payNote, setPayNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const bad = (k: string) => (state.fields?.includes(k) ? "bad" : "");

  useEffect(() => {
    clearTimeout(timer.current);
    if (cq.trim().length < 2) return;
    timer.current = setTimeout(() => findCustomers(cq).then(setCres), 250);
    return () => clearTimeout(timer.current);
  }, [cq]);

  const matches = useMemo(() => {
    const q = pq.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 12);
  }, [pq, products]);

  const subtotal = lines.reduce((s, l) => s + toSat(l.price) * (Math.floor(Number(l.qty)) || 0), 0);
  const tierFee = tiers.reduce((fee, x) => (subtotal >= x.minSatang ? x.feeSatang : fee), tiers[0]?.feeSatang ?? 0);
  const fee = shipping === "pickup" ? 0 : shipping === "custom" ? toSat(shipFee) : tierFee + (shipping === "express" ? expressExtraSatang : 0);

  const pickCustomer = (c: Cust) => {
    setCust(c);
    setCq("");
    setCres([]);
    setA({ ...a, name: c.name, phone: c.phone, email: c.email, addr: c.addr, sub: c.sub, dist: c.dist, prov: c.prov, zip: c.zip });
    if (c.taxId) setT({ want: true, kind: c.kind, name: c.name, taxId: c.taxId, branch: c.branch, address: [c.addr, c.sub, c.dist, c.prov, c.zip].filter(Boolean).join(" ") });
  };
  const addProduct = (p: PickProduct) => {
    setPq("");
    if (lines.some((l) => l.productId === p.id)) setLines(lines.map((l) => (l.productId === p.id ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l)));
    else setLines([...lines, { productId: p.id, qty: "1", price: p.priceSatang ? String(p.priceSatang / 100) : "" }]);
  };
  const payload: ManualPayload = {
    customerId: cust?.id, ...a, source, items: lines, shipping, shippingFee: shipFee, paid, payMethod, payNote, tax: t,
  };

  return (
    <form onSubmit={onSubmit} id="manualOrderForm">
      <input type="hidden" name="data" value={JSON.stringify(payload)} />
      {state.error && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{state.error}</div>}
      <div className="mo-grid">
        <div style={{ display: "grid", gap: 12 }}>
          <section className="box">
            <h3>สินค้า</h3>
            <div className="mo-search">
              <label htmlFor="pq" className="sr-only">ค้นหาสินค้า</label>
              <input id="pq" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="พิมพ์ชื่อหรือรหัสสินค้าเพื่อเพิ่ม" autoComplete="off" className={bad("items")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) addProduct(matches[0]); } }} />
              {matches.length > 0 && (
                <div className="mo-results" role="listbox" aria-label="ผลการค้นหาสินค้า">
                  {matches.map((p) => {
                    const out = p.trackStock ? p.stock <= 0 : !p.inStock;
                    return (
                      <button type="button" role="option" aria-selected="false" key={p.id} onClick={() => addProduct(p)}>
                        <span>{p.name}<small>{p.sku}{p.isActive ? "" : " · ปิดขาย"}</small></span>
                        <span className="r">
                          {p.priceSatang ? baht(p.priceSatang) : "สอบถามราคา"}
                          <small className={out ? "out" : ""}>{p.trackStock ? `คงเหลือ ${p.stock}` : out ? "หมด" : "ไม่นับสต็อก"}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mo-items" id="moItems">
              {lines.map((l, i) => {
                const p = byId.get(l.productId)!;
                const q = Math.floor(Number(l.qty)) || 0;
                const over = p.trackStock && q > p.stock;
                return (
                  <div className="mo-item" key={l.productId}>
                    <div className="nm"><b>{p.name}</b><small>{p.sku}{p.trackStock ? ` · คงเหลือ ${p.stock}` : ""}{over ? " · สต็อกไม่พอ" : ""}</small></div>
                    <div className="q"><label className="sr-only" htmlFor={`q${i}`}>จำนวน</label><input id={`q${i}`} inputMode="numeric" value={l.qty} className={over || bad(`item.${i}`) ? "bad" : ""} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} /></div>
                    <div className="p"><label className="sr-only" htmlFor={`p${i}`}>ราคาต่อหน่วย (บาท)</label><input id={`p${i}`} inputMode="decimal" value={l.price} placeholder="ราคา" className={bad(`item.${i}`)} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, price: e.target.value } : x)))} /></div>
                    <div className="sum">{baht(toSat(l.price) * q)}</div>
                    <button type="button" className="icon-btn sm x" aria-label={`ลบ ${p.name}`} onClick={() => setLines(lines.filter((_, k) => k !== i))}>✕</button>
                  </div>
                );
              })}
              {!lines.length && <p className="l3-note">ยังไม่มีสินค้า — ค้นหาแล้วกดเพื่อเพิ่ม (แก้ราคาต่อหน่วยได้ตามที่ตกลงกับลูกค้า)</p>}
            </div>
          </section>

          <section className="box">
            <h3>ลูกค้า / ผู้รับ</h3>
            {cust ? (
              <div className="mo-chosen">
                <span>ลูกค้าเดิม <b>{cust.code}</b> · {cust.name}</span>
                <button type="button" className="link" onClick={() => setCust(null)}>เปลี่ยน</button>
              </div>
            ) : (
              <div className="mo-search">
                <label htmlFor="cq" className="sr-only">ค้นหาลูกค้าเดิม</label>
                <input id="cq" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="ค้นหาลูกค้าเดิม (ชื่อ เบอร์โทร รหัส) — หรือกรอกด้านล่างเพื่อสร้างใหม่" autoComplete="off" />
                {cres.length > 0 && cq.trim().length >= 2 && (
                  <div className="mo-results">
                    {cres.map((c) => (
                      <button type="button" key={c.id} onClick={() => pickCustomer(c)}>
                        <span>{c.name}<small>{c.code} · {c.phone || "ไม่มีเบอร์"}</small></span>
                        <small>{c.prov}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <AddrFields a={a} set={setA} bad={bad} optional={shipping === "pickup"} />
            <TaxFields t={t} set={setT} bad={bad} />
          </section>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <section className="box">
            <h3>ช่องทางที่ลูกค้าสั่ง</h3>
            <div className="seg" role="radiogroup" aria-label="ช่องทาง">
              {sources.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={source === s} onClick={() => setSource(s)}>{s}</button>
              ))}
            </div>
            <h3 style={{ marginTop: 6 }}>การจัดส่ง</h3>
            <div className="mo-radio">
              <label><input type="radio" name="ship" checked={shipping === "std"} onChange={() => setShipping("std")} /><span><b>ส่งธรรมดา</b><small>ค่าส่งตามยอดสั่งซื้อ ({baht(tierFee)})</small></span></label>
              {expressEnabled && <label><input type="radio" name="ship" checked={shipping === "express"} onChange={() => setShipping("express")} /><span><b>ส่งด่วน</b><small>+{baht(expressExtraSatang)}</small></span></label>}
              <label><input type="radio" name="ship" checked={shipping === "custom"} onChange={() => setShipping("custom")} /><span><b>กำหนดค่าส่งเอง</b><small>เช่น ของใหญ่/ส่งต่างจังหวัด</small></span></label>
              <label><input type="radio" name="ship" checked={shipping === "pickup"} onChange={() => setShipping("pickup")} /><span><b>รับเองที่ร้าน</b><small>ไม่มีค่าส่ง</small></span></label>
            </div>
            {shipping === "custom" && (
              <div className="field">
                <label htmlFor="shipFee">ค่าส่ง (บาท)</label>
                <input id="shipFee" inputMode="decimal" value={shipFee} onChange={(e) => setShipFee(e.target.value)} className={bad("shippingFee")} />
              </div>
            )}
          </section>

          <section className="box">
            <h3>การชำระเงิน</h3>
            <div className="mo-radio">
              <label><input type="radio" name="paid" checked={!paid} onChange={() => setPaid(false)} /><span><b>รอลูกค้าโอน</b><small>ลูกค้าแนบสลิปได้ที่หน้าติดตามคำสั่งซื้อ (เลขที่ + เบอร์โทร) หรือกด &quot;บันทึกรับชำระ&quot; ภายหลัง</small></span></label>
              <label><input type="radio" name="paid" checked={paid} onChange={() => setPaid(true)} /><span><b>ชำระแล้ว</b><small>ยืนยันการชำระทันทีและตัดสต็อก</small></span></label>
            </div>
            {paid && (
              <div className="two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="field">
                  <label htmlFor="payMethod">วิธีชำระ</label>
                  <select id="payMethod" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    {["โอนเงินผ่านธนาคาร", "QR PromptPay", "เงินสด", "อื่นๆ"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="payNote">อ้างอิง/หมายเหตุ</label>
                  <input id="payNote" value={payNote} maxLength={200} onChange={(e) => setPayNote(e.target.value)} placeholder="เช่น เวลาโอน" />
                </div>
              </div>
            )}
            <div className="mo-sum" aria-live="polite">
              <div><span>ค่าสินค้า</span><b>{baht(subtotal)}</b></div>
              <div><span>ค่าส่ง</span><b>{fee ? baht(fee) : "ฟรี"}</b></div>
              <div className="g"><span>ยอดรวม</span><b id="moTotal">{baht(subtotal + fee)}</b></div>
            </div>
            <p className="l3-note">ระบบคำนวณยอดใหม่ที่เซิร์ฟเวอร์ตอนบันทึก</p>
            <div className="l3-actions">
              <Link className="btn btn-outline" href="/admin">ยกเลิก</Link>
              <button className="btn btn-primary" type="submit" disabled={pending || !lines.length} id="moSubmit">{pending ? "กำลังบันทึก…" : "สร้างคำสั่งซื้อ"}</button>
            </div>
          </section>
        </div>
      </div>
    </form>
  );
}

/* ---------- นำเข้าเลขพัสดุ CSV ---------- */
export function ShipCsvForm() {
  const [pv, onPreview, checking] = useFormAction<ShipCsvState>(previewShipCsv, {});
  const [done, onApply, saving] = useFormAction<ShipCsvState>(applyShipCsv, {});
  const view = done.rows ? done : pv;
  const rows = view.rows ?? [];
  const okRows = rows.filter((r) => !r.error);
  return (
    <div className="l3-form">
      <form className="l3-panel l3-form" onSubmit={onPreview} id="shipPick">
        <h2>1. อัปโหลดไฟล์หรือวางข้อมูล</h2>
        <div className="l3-file">
          <label htmlFor="shipFile" className="sr-only">ไฟล์ CSV</label>
          <input id="shipFile" name="file" type="file" accept=".csv,text/csv,text/plain" />
        </div>
        <div className="field">
          <label htmlFor="shipText">หรือวางข้อมูล (บรรทัดแรกเป็นหัวคอลัมน์)</label>
          <textarea id="shipText" name="csv" rows={5} placeholder={"orderNo,carrier,trackingNo\nMDW-261020-1234,Kerry,KEX123456789"} style={{ fontFamily: "ui-monospace,monospace", fontSize: 13 }} />
        </div>
        <div className="l3-actions"><button className="btn btn-dark" type="submit" disabled={checking}>{checking ? "กำลังตรวจ…" : "ตรวจข้อมูล"}</button></div>
        {pv.error && <div className="login-err" role="alert">{pv.error}</div>}
      </form>
      {rows.length > 0 && (
        <section className="l3-panel" id="shipPreview">
          <div className="l3-ph">
            <div>
              <h2>{done.ok ? "ผลการบันทึก" : "2. ตรวจก่อนบันทึก"}</h2>
              <p>{rows.length} แถว · ถูกต้อง <b className="l3-pos">{okRows.length}</b> · ผิด <b className={rows.length - okRows.length ? "l3-neg" : ""}>{rows.length - okRows.length}</b></p>
            </div>
          </div>
          <table className="l3-tbl" id="shipTbl">
            <thead><tr><th>แถว</th><th>คำสั่งซื้อ</th><th>ขนส่ง</th><th>เลขพัสดุ</th><th>ผลตรวจ</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className={r.error ? "err" : ""}>
                  <td data-l="แถว">{r.line}</td>
                  <td className="main">{r.orderNo || "—"}{r.customerName && <span className="sub">{r.customerName}</span>}</td>
                  <td data-l="ขนส่ง">{r.carrier || "—"}</td>
                  <td data-l="เลขพัสดุ" className="num">{r.trackingNo || "—"}</td>
                  <td data-l="ผล">{r.error ? <span className="l3-neg">{r.error}</span> : <span className="l3-pos">{done.ok ? "บันทึกแล้ว" : "พร้อมบันทึก"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!done.ok && (
            <form onSubmit={onApply} className="l3-actions" style={{ marginTop: 14 }}>
              <input type="hidden" name="csv" value={pv.csv ?? ""} />
              <button className="btn btn-primary" type="submit" disabled={!okRows.length || saving} id="shipApply">
                {saving ? "กำลังบันทึก…" : `บันทึกเลขพัสดุ ${okRows.length} รายการ`}
              </button>
              {rows.length - okRows.length > 0 && <span className="l3-note">แถวที่ผิดจะถูกข้าม</span>}
            </form>
          )}
          {done.error && <div className="login-err" role="alert">{done.error}</div>}
          {done.ok && <div className="ok-box" role="status" style={{ marginTop: 12 }} id="shipDone">{done.ok} <Link href="/admin?tab=SHIPPED">ดูคำสั่งซื้อที่จัดส่งแล้ว</Link></div>}
        </section>
      )}
    </div>
  );
}

/* ---------- เลือกหลายรายการ → พิมพ์ใบปะหน้า ---------- */
export function BulkLabels({ formId }: { formId: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const count = () => setN(document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="pick"]:checked`).length);
    const all = document.getElementById(`${formId}-all`) as HTMLInputElement | null;
    const onAll = () => {
      document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="pick"]`).forEach((c) => (c.checked = !!all?.checked));
      count();
    };
    document.addEventListener("change", count);
    all?.addEventListener("change", onAll);
    count();
    return () => {
      document.removeEventListener("change", count);
      all?.removeEventListener("change", onAll);
    };
  }, [formId]);
  const picked = () => [...document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="pick"]:checked`)].map((c) => c.value);
  const open = (size: "A6" | "A4") => {
    const nos = picked();
    if (nos.length) window.open(`/admin/print/labels?orders=${encodeURIComponent(nos.join(","))}&size=${size}&auto=1`, "_blank", "noopener");
  };
  return (
    <div className="bulkbar" id="bulkBar" hidden={!n}>
      <b>เลือก {n} รายการ</b>
      <button type="button" className="btn btn-dark btn-sm" onClick={() => open("A6")} id="bulkPrint">พิมพ์ใบปะหน้า A6</button>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => open("A4")}>A4 (4 ใบ/หน้า)</button>
    </div>
  );
}
