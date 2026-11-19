"use client";
// ฟอร์มค่าใช้จ่าย: วันที่ · หมวด · รายละเอียด · จ่ายให้ · ยอดรวม (+ ภาษีซื้อ / ภาษีที่ร้านหัก ณ ที่จ่าย) · วิธีจ่าย · หลักฐาน (รูป/PDF)
import { useState } from "react";
import { EXPENSE_CATEGORIES, EXPENSE_METHODS } from "@/lib/expense-rules";
import { useFormAction } from "../../_components/useFormAction";
import { saveExpense, type ExpenseState } from "./actions";

export type ExpenseValues = {
  id: string; date: string; category: string; description: string; payee: string; amount: string; vat: string; wht: string;
  method: string; reference: string; note: string; fileUrl: string | null; fileIsPdf: boolean;
};

const num = (s: string) => {
  const n = Number(String(s).replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const m = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ExpenseForm({ v, today, vatRegistered, payees }: { v: ExpenseValues; today: string; vatRegistered: boolean; payees: string[] }) {
  const [state, onSubmit, pending] = useFormAction<ExpenseState>(saveExpense, {});
  const [amount, setAmount] = useState(v.amount);
  const [vatOn, setVatOn] = useState(num(v.vat) > 0);
  const [vat, setVat] = useState(v.vat);
  const [whtOn, setWhtOn] = useState(num(v.wht) > 0);
  const [wht, setWht] = useState(v.wht);
  const [removeFile, setRemoveFile] = useState(false);
  const [picked, setPicked] = useState("");
  const bad = (k: string) => (state.fields?.includes(k) ? "bad" : undefined);
  const total = num(amount);
  const vatCalc = Math.round((total * 7) / 107 * 100) / 100; // VAT 7% ที่รวมอยู่ในยอด
  const cash = total - (whtOn ? num(wht) : 0);
  return (
    <form onSubmit={onSubmit} className="cu-form xp-form" encType="multipart/form-data">
      <input type="hidden" name="id" value={v.id} />
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="xp-g3">
        <div className="field"><label htmlFor="xDate">วันที่จ่าย *</label><input id="xDate" name="date" type="date" defaultValue={v.date} max={today} required className={bad("date")} /></div>
        <div className="field"><label htmlFor="xCat">หมวด *</label>
          <select id="xCat" name="category" defaultValue={v.category} required className={bad("category")}>
            <option value="">— เลือกหมวด —</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select></div>
        <div className="field"><label htmlFor="xMethod">วิธีจ่าย *</label>
          <select id="xMethod" name="method" defaultValue={v.method || EXPENSE_METHODS[1]} className={bad("method")}>
            {EXPENSE_METHODS.map((x) => <option key={x}>{x}</option>)}
            {v.method && !(EXPENSE_METHODS as readonly string[]).includes(v.method) && <option>{v.method}</option>}
          </select></div>
      </div>
      <div className="field"><label htmlFor="xDesc">รายละเอียด *</label><input id="xDesc" name="description" defaultValue={v.description} maxLength={200} required placeholder="เช่น ค่าส่งพัสดุ Kerry 12 กล่อง, ค่าไฟเดือน พ.ย." className={bad("description")} /></div>
      <div className="xp-g2">
        <div className="field"><label htmlFor="xPayee">จ่ายให้ (ผู้รับเงิน)</label><input id="xPayee" name="payee" defaultValue={v.payee} maxLength={120} list="xPayees" placeholder="ชื่อร้าน/บุคคล" /><datalist id="xPayees">{payees.map((p) => <option key={p} value={p} />)}</datalist></div>
        <div className="field"><label htmlFor="xRef">เลขที่บิล / เลขอ้างอิง</label><input id="xRef" name="reference" defaultValue={v.reference} maxLength={100} /></div>
      </div>
      <fieldset className="cu-addr xp-money">
        <legend>จำนวนเงิน</legend>
        <div className="field"><label htmlFor="xAmount">ยอดรวมตามบิล (บาท) *</label><input id="xAmount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" className={bad("amount")} /></div>
        <label className="chk-row"><input type="checkbox" checked={vatOn} onChange={(e) => { setVatOn(e.target.checked); if (e.target.checked && !num(vat)) setVat(vatCalc ? vatCalc.toFixed(2) : ""); }} /> บิลนี้มีภาษีซื้อ (VAT){vatRegistered ? " — ขอคืนได้ ไม่นับเป็นค่าใช้จ่าย" : ""}</label>
        {vatOn ? (
          <div className="field"><label htmlFor="xVat">ภาษีซื้อในบิล (บาท)</label><input id="xVat" name="vat" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} className={bad("vat")} />
            <small>VAT 7% ที่รวมอยู่ในยอด {m(vatCalc)} บาท{num(vat) !== vatCalc && <> · <button type="button" className="link" onClick={() => setVat(vatCalc.toFixed(2))}>ใช้ค่านี้</button></>}</small></div>
        ) : <input type="hidden" name="vat" value="0" />}
        <label className="chk-row"><input type="checkbox" checked={whtOn} onChange={(e) => setWhtOn(e.target.checked)} /> ร้านหักภาษี ณ ที่จ่ายไว้ (ต้องนำส่งสรรพากรเอง)</label>
        {whtOn ? (
          <div className="field"><label htmlFor="xWht">ภาษีที่หักไว้ (บาท)</label><input id="xWht" name="wht" inputMode="decimal" value={wht} onChange={(e) => setWht(e.target.value)} className={bad("wht")} />
            <small>เช่น ค่าจ้างติดตั้ง 3% ของยอดก่อน VAT = {m(Math.round((total - (vatOn ? num(vat) : 0)) * 3) / 100)} บาท</small></div>
        ) : <input type="hidden" name="wht" value="0" />}
        <div className="wht-sum" aria-live="polite">
          <span>ยอดรวมตามบิล<b>{m(total)}</b></span>
          {whtOn && <span>หัก ณ ที่จ่าย<b>−{m(num(wht))}</b></span>}
          <span className="net">จ่ายออกจริง<b>{m(Math.max(0, cash))}</b></span>
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="xFile">หลักฐาน (รูปใบเสร็จ/บิล หรือ PDF ≤ 10 MB)</label>
        {v.fileUrl && !removeFile && !picked && (
          <div className="xp-file">
            {v.fileIsPdf ? <a className="link" href={v.fileUrl} target="_blank" rel="noopener">เปิดไฟล์ PDF</a>
              : (
                <a href={v.fileUrl} target="_blank" rel="noopener">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ส่วนตัว (no-store) ไม่ผ่านตัวย่อรูป */}
                  <img src={v.fileUrl} alt="หลักฐานค่าใช้จ่าย" />
                </a>
              )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoveFile(true)}>ลบหลักฐาน</button>
          </div>
        )}
        {removeFile && <input type="hidden" name="removeFile" value="1" />}
        <input id="xFile" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={bad("file")} onChange={(e) => { setPicked(e.target.files?.[0]?.name ?? ""); setRemoveFile(false); }} />
        <small>{picked ? `ไฟล์ใหม่: ${picked} (แทนไฟล์เดิมเมื่อบันทึก)` : "ถ่ายรูปบิลจากมือถือได้ · เก็บแบบส่วนตัว เปิดได้เฉพาะแอดมิน"}</small>
      </div>
      <div className="field"><label htmlFor="xNote">หมายเหตุ</label><textarea id="xNote" name="note" defaultValue={v.note} rows={2} maxLength={1000} /></div>
      <div className="act-row"><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : v.id ? "บันทึกการแก้ไข" : "บันทึกค่าใช้จ่าย"}</button></div>
    </form>
  );
}
