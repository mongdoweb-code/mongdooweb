"use client";
// ฟอร์มใบสั่งซื้อฉบับร่าง: ผู้ขาย + รายการสินค้า (ค้นจากชื่อ/รหัส หรือพิมพ์ชื่อสินค้านอกระบบ) + จำนวน + ต้นทุนต่อหน่วย
// ยอดรวมในหน้านี้เป็นตัวอย่าง — server คำนวณใหม่ตอนบันทึก
import { useMemo, useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { savePo, type PoFormState } from "./actions";

export type PoPick = { id: string; sku: string; name: string; costSatang: number | null; trackStock: boolean; stock: number };
export type PoValues = { id: string; supplierName: string; supplierContact: string; note: string; items: { productId: string | null; name: string; qty: string; cost: string }[] };

const baht = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toSat = (s: string) => {
  const n = Number(String(s).replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

export function PoForm({ v, products, suppliers }: { v: PoValues; products: PoPick[]; suppliers: string[] }) {
  const [state, onSubmit, pending] = useFormAction<PoFormState>(savePo, {});
  const [supplierName, setSupplier] = useState(v.supplierName);
  const [supplierContact, setContact] = useState(v.supplierContact);
  const [note, setNote] = useState(v.note);
  const [items, setItems] = useState(v.items);
  const [pq, setPq] = useState("");
  const bad = (k: string) => (state.fields?.includes(k) ? "bad" : "");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const matches = useMemo(() => {
    const q = pq.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 12);
  }, [pq, products]);
  const add = (p: PoPick) => {
    setPq("");
    if (items.some((l) => l.productId === p.id)) return;
    setItems([...items, { productId: p.id, name: p.name, qty: "1", cost: p.costSatang != null ? String(p.costSatang / 100) : "" }]);
  };
  const addFree = () => {
    if (!pq.trim()) return;
    setItems([...items, { productId: null, name: pq.trim(), qty: "1", cost: "" }]);
    setPq("");
  };
  const set = (i: number, patch: Partial<PoValues["items"][number]>) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const total = items.reduce((s, l) => s + toSat(l.cost) * (Math.floor(Number(l.qty)) || 0), 0);
  const payload = { supplierName, supplierContact, note, items: items.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, cost: l.cost })) };

  return (
    <form onSubmit={onSubmit} id="poForm">
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="data" value={JSON.stringify(payload)} />
      {state.error && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{state.error}</div>}
      <div className="mo-grid">
        <div style={{ display: "grid", gap: 12 }}>
          <section className="box">
            <h3>รายการสินค้าที่สั่ง</h3>
            <div className="mo-search">
              <label htmlFor="poPq" className="sr-only">ค้นหาสินค้า</label>
              <input id="poPq" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="พิมพ์ชื่อหรือรหัสสินค้าเพื่อเพิ่ม" autoComplete="off" className={bad("items")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) add(matches[0]); else addFree(); } }} />
              {pq.trim() && (
                <div className="mo-results" role="listbox" aria-label="ผลการค้นหาสินค้า">
                  {matches.map((p) => (
                    <button type="button" role="option" aria-selected="false" key={p.id} onClick={() => add(p)}>
                      <span>{p.name}<small>{p.sku}</small></span>
                      <span className="r">{p.costSatang != null ? `ต้นทุนล่าสุด ${baht(p.costSatang)}` : "ยังไม่มีต้นทุน"}<small>{p.trackStock ? `คงเหลือ ${p.stock}` : "ไม่นับสต็อก"}</small></span>
                    </button>
                  ))}
                  <button type="button" role="option" aria-selected="false" onClick={addFree} className="po-free">
                    <span>+ เพิ่ม “{pq.trim()}” เป็นรายการนอกระบบ<small>ไม่ผูกสินค้า — ไม่เพิ่มสต็อก/ต้นทุน</small></span>
                  </button>
                </div>
              )}
            </div>
            <div className="mo-items" id="poItems">
              {items.map((l, i) => {
                const p = l.productId ? byId.get(l.productId) : null;
                return (
                  <div className="mo-item" key={`${l.productId ?? "free"}-${i}`}>
                    <div className="nm"><b>{l.name}</b><small>{p ? `${p.sku}${p.trackStock ? ` · คงเหลือ ${p.stock}` : " · ไม่นับสต็อก"}` : "รายการนอกระบบ"}</small></div>
                    <div className="q"><label className="sr-only" htmlFor={`poq${i}`}>จำนวน</label><input id={`poq${i}`} inputMode="numeric" value={l.qty} className={bad(`item.${i}`)} onChange={(e) => set(i, { qty: e.target.value })} /></div>
                    <div className="p"><label className="sr-only" htmlFor={`poc${i}`}>ต้นทุนต่อหน่วย (บาท)</label><input id={`poc${i}`} inputMode="decimal" value={l.cost} placeholder="ต้นทุน/หน่วย" className={bad(`item.${i}`)} onChange={(e) => set(i, { cost: e.target.value })} /></div>
                    <div className="sum">{baht(toSat(l.cost) * (Math.floor(Number(l.qty)) || 0))}</div>
                    <button type="button" className="icon-btn sm x" aria-label={`ลบ ${l.name}`} onClick={() => setItems(items.filter((_, k) => k !== i))}>✕</button>
                  </div>
                );
              })}
              {!items.length && <p className="l3-note">ยังไม่มีรายการ — ค้นหาสินค้าแล้วกดเพื่อเพิ่ม</p>}
            </div>
            <div className="po-total">รวม <b className="num" id="poTotal">{baht(total)}</b></div>
          </section>
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <section className="box">
            <h3>ผู้ขาย</h3>
            <div className="field">
              <label htmlFor="poSup">ชื่อผู้ขาย / บริษัท</label>
              <input id="poSup" value={supplierName} onChange={(e) => setSupplier(e.target.value)} required maxLength={160} list="poSuppliers" className={bad("supplierName")} />
              <datalist id="poSuppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="field">
              <label htmlFor="poCon">ผู้ติดต่อ / เบอร์โทร / LINE</label>
              <input id="poCon" value={supplierContact} onChange={(e) => setContact(e.target.value)} maxLength={300} />
            </div>
            <div className="field">
              <label htmlFor="poNote">หมายเหตุ (พิมพ์บนใบสั่งซื้อ)</label>
              <textarea id="poNote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            </div>
          </section>
          <div className="po-acts">
            <button className="btn btn-outline" type="submit" name="intent" value="draft" disabled={pending}>บันทึกฉบับร่าง</button>
            <button className="btn btn-primary" type="submit" name="intent" value="order" disabled={pending}>บันทึกและออกใบสั่งซื้อ</button>
          </div>
          <p className="l3-note">ออกใบสั่งซื้อแล้วจะได้เลขที่ PO และแก้รายการไม่ได้ (ยกเลิกแล้วสร้างใหม่ได้)</p>
        </div>
      </div>
    </form>
  );
}
