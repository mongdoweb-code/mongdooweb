"use client";
// ฟอร์มปรับสต็อก (รับของเข้า / นับสต็อก / ปรับปรุง) และเริ่มนับสต็อก
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { adjustStock, startTracking, type StockState } from "./actions";

const KINDS = [
  ["RESTOCK", "รับของเข้า", "เพิ่มจำนวนที่รับเข้ามา"],
  ["COUNT", "นับสต็อก", "ตั้งเป็นจำนวนที่นับได้จริง"],
  ["ADJUST", "ปรับปรุง", "เพิ่ม/ลด เช่น ชำรุด สูญหาย ใช้เอง"],
] as const;

export function AdjustForm({ productId, stock }: { productId: string; stock: number }) {
  const [state, onSubmit, pending] = useFormAction<StockState>(adjustStock, {});
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("RESTOCK");
  const [qty, setQty] = useState("");
  const n = Number(qty);
  const after = qty === "" || !Number.isFinite(n) ? null : kind === "COUNT" ? n : Math.max(0, stock + n);
  const bad = (k: string) => (state.fields?.includes(k) ? "bad" : "");
  return (
    <form className="l3-form" onSubmit={onSubmit} id="adjustForm">
      <input type="hidden" name="productId" value={productId} />
      <div className="mo-radio" role="radiogroup" aria-label="ประเภท">
        {KINDS.map(([k, l, d]) => (
          <label key={k}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            <span><b>{l}</b><small>{d}</small></span>
          </label>
        ))}
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="adjQty">{kind === "RESTOCK" ? "จำนวนที่รับเข้า" : kind === "COUNT" ? "จำนวนที่นับได้" : "จำนวน (+ เพิ่ม / − ลด)"}</label>
          <input id="adjQty" name="qty" inputMode="numeric" required value={qty} onChange={(e) => setQty(e.target.value)} className={bad("qty")} placeholder={kind === "ADJUST" ? "-1" : "0"} />
          <small>คงเหลือตอนนี้ {stock}{after !== null ? ` → หลังบันทึก ${after}` : ""}</small>
        </div>
        <div className="field">
          <label htmlFor="adjRef">เลขที่อ้างอิง (ไม่บังคับ)</label>
          <input id="adjRef" name="ref" maxLength={60} placeholder="เช่น เลขใบส่งของ" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="adjNote">หมายเหตุ{kind === "ADJUST" ? " (จำเป็น)" : ""}</label>
        <input id="adjNote" name="note" maxLength={300} className={bad("note")} placeholder={kind === "ADJUST" ? "เช่น สินค้าชำรุดจากการขนส่ง" : "เช่น รับจากซัพพลายเออร์"} />
      </div>
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="l3-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกการปรับสต็อก"}</button>
      </div>
    </form>
  );
}

export function StartTrackingForm({ productId }: { productId: string }) {
  const [state, onSubmit, pending] = useFormAction<StockState>(startTracking, {});
  return (
    <form className="l3-form" onSubmit={onSubmit}>
      <input type="hidden" name="productId" value={productId} />
      <p className="l3-note">สินค้านี้ยังไม่นับสต็อก (ขายได้ไม่จำกัดตามสถานะ &quot;มีสินค้า&quot;) — เริ่มนับเพื่อให้ระบบตัดสต็อกอัตโนมัติและกันขายเกินของที่มี</p>
      <div className="field">
        <label htmlFor="startQty">จำนวนคงเหลือตอนนี้</label>
        <input id="startQty" name="qty" inputMode="numeric" required className={state.fields?.includes("qty") ? "bad" : ""} />
      </div>
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="l3-actions"><button className="btn btn-dark" type="submit" disabled={pending}>เริ่มนับสต็อก</button></div>
    </form>
  );
}
