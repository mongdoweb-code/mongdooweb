"use client";
// ฟอร์มในหน้าดูเอกสาร: บันทึกรับชำระ (ออกใบเสร็จอัตโนมัติ) และยกเลิกเอกสาร (ต้องระบุเหตุผล)
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { recordPayment, voidDoc, type DocState } from "./actions";

export function PaymentForm({ id, outstanding, today, methods, minDate }: { id: string; outstanding: number; today: string; methods: string[]; minDate: string }) {
  const [state, onSubmit, pending] = useFormAction<DocState>(recordPayment, {});
  const [amt, setAmt] = useState((outstanding / 100).toFixed(2));
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  const n = Number(amt.replace(/[,\s]/g, ""));
  const partial = Number.isFinite(n) && n > 0 && Math.round(n * 100) < outstanding;
  return (
    <form onSubmit={onSubmit} className="pay-form" key={outstanding}>
      <input type="hidden" name="id" value={id} />
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      <div className="two">
        <div className="field"><label htmlFor="paidAt">วันที่รับเงิน</label><input id="paidAt" name="paidAt" type="date" defaultValue={today} min={minDate} max={today} required {...bad("paidAt")} /></div>
        <div className="field"><label htmlFor="amount">ยอดเงิน (บาท)</label><input id="amount" name="amount" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} required {...bad("amount")} /></div>
      </div>
      <div className="two">
        <div className="field"><label htmlFor="method">วิธีชำระ</label><select id="method" name="method" defaultValue={methods[0]} {...bad("method")}>{methods.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div className="field"><label htmlFor="reference">เลขอ้างอิง (ถ้ามี)</label><input id="reference" name="reference" maxLength={100} placeholder="เลขที่รายการโอน / เลขเช็ค" /></div>
      </div>
      <small className="sub">{partial ? "ชำระบางส่วน — ใบเสร็จจะเป็นรายการ “รับชำระตามใบแจ้งหนี้ (งวดที่ n)”" : "ชำระเต็มจำนวน — ใบเสร็จจะแสดงรายการสินค้าเหมือนใบแจ้งหนี้"}</small>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกรับชำระ + ออกใบเสร็จ"}</button>
    </form>
  );
}

export function VoidForm({ id, label, hint }: { id: string; label: string; hint?: string }) {
  const [state, onSubmit, pending] = useFormAction<DocState>(voidDoc, {});
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)} style={{ color: "var(--c-err)" }}>ยกเลิก{label}</button>;
  return (
    <form onSubmit={onSubmit} className="void-form">
      <input type="hidden" name="id" value={id} />
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      <div className="field">
        <label htmlFor="vReason">เหตุผลการยกเลิก (แสดงบนเอกสาร)</label>
        <input id="vReason" name="reason" required minLength={3} maxLength={200} placeholder="เช่น ออกผิดลูกค้า, ลูกค้ายกเลิกคำสั่งซื้อ" autoFocus />
        {hint && <small>{hint}</small>}
      </div>
      <div className="act-row">
        <button className="btn btn-outline btn-sm" type="button" onClick={() => setOpen(false)}>ไม่ยกเลิก</button>
        <button className="btn btn-danger btn-sm" type="submit" disabled={pending}>{pending ? "กำลังยกเลิก…" : `ยืนยันยกเลิก${label}`}</button>
      </div>
    </form>
  );
}

