"use client";
// ฟอร์มลูกค้า: บุคคล/นิติบุคคล, เลขผู้เสียภาษี (ตรวจ checksum ทันที), สาขา, ที่อยู่ออกเอกสาร + ที่อยู่จัดส่งแยก
import { useState } from "react";
import { isValidThaiTaxId } from "@/lib/format";
import { useFormAction } from "../../_components/useFormAction";
import { saveCustomer, type CustomerState } from "./actions";

export type CustomerValues = {
  id: string; kind: "PERSON" | "COMPANY"; name: string; taxId: string; branchType: "hq" | "branch"; branchNo: string; contactName: string; phone: string; email: string;
  addressLine: string; subdistrict: string; district: string; province: string; postalCode: string; note: string;
  shipName: string; shipPhone: string; shipLine: string; shipSub: string; shipDist: string; shipProv: string; shipZip: string;
};

export function CustomerForm({ v, saved }: { v: CustomerValues; saved: boolean }) {
  const [state, onSubmit, pending] = useFormAction<CustomerState>(saveCustomer, saved ? { ok: "เพิ่มลูกค้าแล้ว" } : {});
  const [kind, setKind] = useState(v.kind);
  const [branchType, setBranchType] = useState(v.branchType);
  const [tax, setTax] = useState(v.taxId);
  const [ship, setShip] = useState(!!v.shipName);
  const taxDigits = tax.replace(/\D/g, "");
  const taxMsg = !taxDigits ? "" : taxDigits.length !== 13 ? `ต้องมี 13 หลัก (ตอนนี้ ${taxDigits.length})` : isValidThaiTaxId(taxDigits) ? "✓ เลขถูกต้อง" : "หลักสุดท้ายไม่ถูกต้อง — ตรวจเลขอีกครั้ง";
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  const f = (k: keyof CustomerValues, label: string, p: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field"><label htmlFor={`c-${k}`}>{label}</label><input id={`c-${k}`} name={k} defaultValue={v[k]} {...p} {...bad(k)} /></div>
  );
  return (
    <form onSubmit={onSubmit} className="cu-form cu-page">
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="kind" value={kind} />
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="seg" role="group" aria-label="ประเภทลูกค้า">
        <button type="button" aria-pressed={kind === "PERSON"} onClick={() => setKind("PERSON")}>บุคคลธรรมดา</button>
        <button type="button" aria-pressed={kind === "COMPANY"} onClick={() => setKind("COMPANY")}>นิติบุคคล / บริษัท</button>
      </div>
      <div className="two">
        {f("name", kind === "COMPANY" ? "ชื่อบริษัท / นิติบุคคล" : "ชื่อ-นามสกุล", { required: true, maxLength: 200 })}
        <div className="field">
          <label htmlFor="c-taxId">{kind === "COMPANY" ? "เลขประจำตัวผู้เสียภาษี" : "เลขประจำตัวผู้เสียภาษี / บัตรประชาชน (ถ้าต้องการใบกำกับภาษี)"}</label>
          <input id="c-taxId" name="taxId" inputMode="numeric" maxLength={17} value={tax} onChange={(e) => setTax(e.target.value)} {...bad("taxId")} />
          {taxMsg && <small style={{ color: taxMsg.startsWith("✓") ? "var(--c-ok)" : "var(--c-err)" }}>{taxMsg}</small>}
        </div>
      </div>
      {kind === "COMPANY" && (
        <div className="two">
          <div className="field"><label htmlFor="c-branchType">สำนักงาน</label>
            <select id="c-branchType" name="branchType" value={branchType} onChange={(e) => setBranchType(e.target.value === "branch" ? "branch" : "hq")}><option value="hq">สำนักงานใหญ่</option><option value="branch">สาขา</option></select></div>
          {branchType === "branch" ? f("branchNo", "เลขที่สาขา (5 หลัก)", { inputMode: "numeric", maxLength: 5, placeholder: "00001" }) : f("contactName", "ผู้ติดต่อ", { maxLength: 120 })}
        </div>
      )}
      <div className="two">
        {f("phone", "เบอร์โทร", { inputMode: "tel", maxLength: 20 })}
        {f("email", "อีเมล", { type: "email", maxLength: 120 })}
      </div>
      {kind === "COMPANY" && branchType === "branch" && f("contactName", "ผู้ติดต่อ", { maxLength: 120 })}
      <fieldset className="cu-addr">
        <legend>ที่อยู่ (ใช้ออกเอกสาร)</legend>
        {f("addressLine", "บ้านเลขที่ หมู่ ถนน", { maxLength: 300 })}
        <div className="four">
          {f("subdistrict", "ตำบล/แขวง", { maxLength: 80 })}
          {f("district", "อำเภอ/เขต", { maxLength: 80 })}
          {f("province", "จังหวัด", { maxLength: 80 })}
          {f("postalCode", "รหัสไปรษณีย์", { inputMode: "numeric", maxLength: 5 })}
        </div>
      </fieldset>
      <label className="chk-row"><input type="checkbox" checked={ship} onChange={(e) => setShip(e.target.checked)} /> ที่อยู่จัดส่งต่างจากที่อยู่ออกเอกสาร</label>
      {ship && (
        <fieldset className="cu-addr">
          <legend>ที่อยู่จัดส่ง (ใช้ในใบปะหน้า)</legend>
          <div className="two">{f("shipName", "ชื่อผู้รับ", { maxLength: 200, required: true })}{f("shipPhone", "เบอร์ผู้รับ", { inputMode: "tel", maxLength: 20 })}</div>
          {f("shipLine", "บ้านเลขที่ หมู่ ถนน", { maxLength: 300 })}
          <div className="four">{f("shipSub", "ตำบล/แขวง", { maxLength: 80 })}{f("shipDist", "อำเภอ/เขต", { maxLength: 80 })}{f("shipProv", "จังหวัด", { maxLength: 80 })}{f("shipZip", "รหัสไปรษณีย์", { inputMode: "numeric", maxLength: 5 })}</div>
        </fieldset>
      )}
      <div className="field"><label htmlFor="c-note">โน้ตภายในร้าน</label><textarea id="c-note" name="note" defaultValue={v.note} rows={2} maxLength={1000} /></div>
      <div className="act-row"><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกข้อมูลลูกค้า"}</button></div>
    </form>
  );
}
