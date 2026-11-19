"use client";
// ฟอร์มลูกค้า (หน้า /admin/customers/:id): ช่องหลักใช้ CustomerFields ร่วมกับ "+ ลูกค้าใหม่" ในตัวแก้ไขเอกสาร
// + ที่อยู่จัดส่งแยก (ใบปะหน้า) และโน้ตภายในร้าน
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { saveCustomer, type CustomerState } from "./actions";
import { CustomerFields, type CustomerFieldValues } from "./CustomerFields";

export type CustomerValues = CustomerFieldValues & {
  id: string; note: string;
  shipName: string; shipPhone: string; shipLine: string; shipSub: string; shipDist: string; shipProv: string; shipZip: string;
};

export function CustomerForm({ v, saved }: { v: CustomerValues; saved: boolean }) {
  const [state, onSubmit, pending] = useFormAction<CustomerState>(saveCustomer, saved ? { ok: "เพิ่มลูกค้าแล้ว" } : {});
  const [ship, setShip] = useState(!!v.shipName);
  const bad = (k: string) => !!state.fields?.includes(k);
  const f = (k: keyof CustomerValues, label: string, p: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field"><label htmlFor={`c-${k}`}>{label}</label><input id={`c-${k}`} name={k} defaultValue={v[k] as string} className={bad(k) ? "bad" : undefined} {...p} /></div>
  );
  return (
    <form onSubmit={onSubmit} className="cu-form cu-page">
      <input type="hidden" name="id" value={v.id} />
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <CustomerFields v={v} bad={bad} idp="c-" />
      <section className="cuf-sec">
        <h3><span className="cuf-n">4</span>การจัดส่งและโน้ต</h3>
        <label className="chk-row"><input type="checkbox" checked={ship} onChange={(e) => setShip(e.target.checked)} /> ที่อยู่จัดส่งต่างจากที่อยู่ออกเอกสาร</label>
        {ship && (
          <fieldset className="cu-addr">
            <legend>ที่อยู่จัดส่ง (ใช้ในใบปะหน้า)</legend>
            <div className="two">{f("shipName", "ชื่อผู้รับ", { maxLength: 200, required: true })}{f("shipPhone", "เบอร์ผู้รับ", { inputMode: "tel", maxLength: 20 })}</div>
            {f("shipLine", "บ้านเลขที่ หมู่ ถนน", { maxLength: 300 })}
            <div className="four">{f("shipSub", "ตำบล/แขวง", { maxLength: 80 })}{f("shipDist", "อำเภอ/เขต", { maxLength: 80 })}{f("shipProv", "จังหวัด", { maxLength: 80 })}{f("shipZip", "รหัสไปรษณีย์", { inputMode: "numeric", maxLength: 5 })}</div>
          </fieldset>
        )}
        <div className="field"><label htmlFor="c-note">โน้ตภายในร้าน (ลูกค้าไม่เห็น)</label><textarea id="c-note" name="note" defaultValue={v.note} rows={2} maxLength={1000} /></div>
      </section>
      <div className="act-row"><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกข้อมูลลูกค้า"}</button></div>
    </form>
  );
}
