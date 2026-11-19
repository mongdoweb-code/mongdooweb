"use client";
// ช่องข้อมูลลูกค้าที่ใช้ร่วมกัน: หน้าลูกค้า (CustomerForm) และ "+ ลูกค้าใหม่" ในตัวแก้ไขเอกสาร (QuickCustomer)
// จัดเป็น 3 ส่วน: ข้อมูลลูกค้า (ประเภท ชื่อ เลขภาษี สาขา) · ข้อมูลติดต่อ (ผู้ติดต่อ อีเมล หลายเบอร์ โทรสาร) · ที่อยู่ออกเอกสาร
import { useRef, useState } from "react";
import { isValidThaiTaxId } from "@/lib/format";
import { formatPhoneEntry, normalizePhone, phoneKind, phoneMain, PHONES_MAX, splitPhones } from "@/lib/phones";
import "./customer-form.css";

export type CustomerFieldValues = {
  kind: "PERSON" | "COMPANY"; name: string; taxId: string; branchType: "hq" | "branch"; branchNo: string; contactName: string;
  phones: string[]; fax: string; email: string;
  addressLine: string; subdistrict: string; district: string; province: string; postalCode: string;
};

export const EMPTY_CUSTOMER: CustomerFieldValues = {
  kind: "PERSON", name: "", taxId: "", branchType: "hq", branchNo: "", contactName: "", phones: [], fax: "", email: "",
  addressLine: "", subdistrict: "", district: "", province: "", postalCode: "",
};

const KIND_LABEL = { mobile: "มือถือ", landline: "บ้าน/สำนักงาน", hotline: "เบอร์สั้น/ศูนย์บริการ", intl: "ต่างประเทศ" } as const;

/** คำอธิบายใต้ช่องเบอร์: รูปแบบที่จะบันทึก หรือข้อผิด */
function phoneHint(raw: string): { ok: boolean; text: string } | null {
  if (!raw.trim()) return null;
  const v = normalizePhone(raw);
  if (!v) return { ok: false, text: "รูปแบบไม่ถูกต้อง — มือถือ 10 หลัก · บ้าน/สำนักงาน 9 หลัก · เบอร์ต่อพิมพ์ “ต่อ 12”" };
  const k = v.startsWith("+") ? "intl" : phoneKind(phoneMain(v));
  return { ok: true, text: `✓ ${formatPhoneEntry(v)}${k ? ` · ${KIND_LABEL[k]}` : ""}` };
}

/** หลายเบอร์: แต่ละแถวเป็น input name="phones" · แถวแรก = เบอร์หลัก (พิมพ์ในเอกสารก่อน ใช้จับคู่คำสั่งซื้อ) */
export function PhoneListField({ initial, idFirst, bad }: { initial: string[]; idFirst: string; bad?: boolean }) {
  const [rows, setRows] = useState<string[]>(() => (initial.length ? initial.map(formatPhoneEntry) : [""]));
  const [touched, setTouched] = useState<boolean[]>(() => initial.map(() => true));
  const [dropped, setDropped] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const focusRow = (i: number) => requestAnimationFrame(() => list.current?.querySelectorAll<HTMLInputElement>("input[name=phones]")[i]?.focus());
  const set = (i: number, v: string) => setRows((r) => r.map((x, j) => (j === i ? v : x)));
  const add = () => {
    if (rows.length >= PHONES_MAX) return;
    setRows((r) => [...r, ""]);
    focusRow(rows.length);
  };
  const remove = (i: number) => {
    setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [""]));
    setTouched((t) => t.filter((_, j) => j !== i));
    focusRow(Math.max(0, i - 1));
  };
  const makeMain = (i: number) => {
    setRows((r) => [r[i], ...r.filter((_, j) => j !== i)]);
    setTouched((t) => [t[i], ...t.filter((_, j) => j !== i)]);
  };
  // วางหลายเบอร์ในช่องเดียว (เช่น "086-309-9066, 044-251-234") → แยกเป็นหลายแถว
  const onPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const parts = splitPhones(e.clipboardData.getData("text"));
    if (parts.length < 2) return;
    e.preventDefault();
    const next = [...rows.slice(0, i), ...parts, ...rows.slice(i + 1)].filter((x) => x.trim());
    setRows(next.slice(0, PHONES_MAX));
    setTouched(Array(PHONES_MAX).fill(true));
    setDropped(Math.max(0, next.length - PHONES_MAX));
  };
  const dupes = rows.map((r, i) => {
    const v = normalizePhone(r);
    return !!v && rows.slice(0, i).some((x) => normalizePhone(x) === v);
  });
  return (
    <div className="field cuf-phones" role="group" aria-labelledby={`${idFirst}-lbl`}>
      <div className="cuf-lbl"><label id={`${idFirst}-lbl`} htmlFor={idFirst}>เบอร์โทร</label><small>{rows.length}/{PHONES_MAX} เบอร์ · เบอร์แรก = เบอร์หลัก</small></div>
      <div className="cuf-plist" ref={list}>
        {rows.map((r, i) => {
          const h = touched[i] ? phoneHint(r) : null;
          const err = (h && !h.ok) || dupes[i] || (bad && !!r.trim() && !normalizePhone(r));
          return (
            <div className="cuf-prow" key={i}>
              <span className={`cuf-tag${i === 0 ? " main" : ""}`}>{i === 0 ? "หลัก" : `เบอร์ ${i + 1}`}</span>
              <div className="cuf-pin">
                <input id={i === 0 ? idFirst : undefined} name="phones" inputMode="tel" autoComplete="off" maxLength={40} value={r}
                  aria-label={i === 0 ? undefined : `เบอร์โทรที่ ${i + 1}`} aria-invalid={err || undefined}
                  placeholder={i === 0 ? "เช่น 086-309-9066" : "เช่น 044-251-234 ต่อ 12"}
                  className={err ? "bad" : undefined}
                  onChange={(e) => set(i, e.target.value)} onPaste={(e) => onPaste(i, e)}
                  onBlur={() => setTouched((t) => { const n = [...t]; n[i] = true; return n; })}
                  onKeyDown={(e) => { if (e.key === "Enter" && r.trim() && i === rows.length - 1 && rows.length < PHONES_MAX) { e.preventDefault(); e.stopPropagation(); add(); } }} />
                {dupes[i] ? <small className="cuf-err">เบอร์ซ้ำกับแถวด้านบน — จะบันทึกครั้งเดียว</small> : h && <small className={h.ok ? "cuf-ok" : "cuf-err"}>{h.text}</small>}
              </div>
              <div className="cuf-pacts">
                {i > 0 && <button type="button" className="cuf-ib" onClick={() => makeMain(i)} data-tip="ตั้งเป็นเบอร์หลัก" aria-label={`ตั้งเบอร์ที่ ${i + 1} เป็นเบอร์หลัก`}>★</button>}
                {(rows.length > 1 || r) && <button type="button" className="cuf-ib del" onClick={() => remove(i)} data-tip="ลบเบอร์นี้" aria-label={`ลบเบอร์ที่ ${i + 1}`}>×</button>}
              </div>
            </div>
          );
        })}
      </div>
      {dropped > 0 && <small className="cuf-err" role="status">ใส่ได้สูงสุด {PHONES_MAX} เบอร์ — ไม่ได้เพิ่มอีก {dropped} เบอร์</small>}
      {rows.length < PHONES_MAX && <button type="button" className="cuf-add" onClick={add}>+ เพิ่มเบอร์โทร</button>}
    </div>
  );
}

export function CustomerFields({ v, bad, idp }: { v: CustomerFieldValues; bad: (k: string) => boolean; idp: "c-" | "qc" }) {
  const [kind, setKind] = useState(v.kind);
  const [branchType, setBranchType] = useState(v.branchType);
  const [tax, setTax] = useState(v.taxId);
  const [fax, setFax] = useState(v.fax);
  const [email, setEmail] = useState(v.email);
  const id = (k: string) => (idp === "c-" ? `c-${k}` : `qc${k[0].toUpperCase()}${k.slice(1)}`);
  const taxDigits = tax.replace(/\D/g, "");
  const taxMsg = !taxDigits ? "" : taxDigits.length !== 13 ? `ต้องมี 13 หลัก (ตอนนี้ ${taxDigits.length})` : isValidThaiTaxId(taxDigits) ? "✓ เลขถูกต้อง" : "หลักสุดท้ายไม่ถูกต้อง — ตรวจเลขอีกครั้ง";
  const faxHint = phoneHint(fax);
  const emailBad = !!email.trim() && !/^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(email.trim());
  const cls = (k: string, extra = false) => (bad(k) || extra ? "bad" : undefined);
  const inp = (k: keyof CustomerFieldValues, label: string, p: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <div className="field">
      <label htmlFor={id(k)}>{label}</label>
      <input id={id(k)} name={k} defaultValue={v[k] as string} className={cls(k)} aria-invalid={bad(k) || undefined} {...p} />
      {hint && <small className="cuf-hint">{hint}</small>}
    </div>
  );
  const isCo = kind === "COMPANY";
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <section className="cuf-sec" aria-labelledby={id("secInfo")}>
        <h3 id={id("secInfo")}><span className="cuf-n">1</span>ข้อมูลลูกค้า</h3>
        <div className="seg" role="group" aria-label="ประเภทลูกค้า">
          <button type="button" aria-pressed={kind === "PERSON"} onClick={() => setKind("PERSON")}>บุคคลธรรมดา</button>
          <button type="button" aria-pressed={isCo} onClick={() => setKind("COMPANY")}>นิติบุคคล / บริษัท</button>
        </div>
        {inp("name", isCo ? "ชื่อบริษัท / นิติบุคคล *" : "ชื่อ-นามสกุล *", { maxLength: 200, required: true, autoComplete: "off", autoFocus: idp === "qc" })}
        <div className={isCo ? "cuf-g3" : "cuf-g2"}>
          <div className="field">
            <label htmlFor={id("taxId")}>{isCo ? "เลขประจำตัวผู้เสียภาษี (13 หลัก)" : "เลขผู้เสียภาษี / บัตรประชาชน"}</label>
            <input id={id("taxId")} name="taxId" inputMode="numeric" maxLength={17} value={tax} onChange={(e) => setTax(e.target.value)}
              className={cls("taxId", !!taxMsg && !taxMsg.startsWith("✓"))} aria-invalid={bad("taxId") || undefined} />
            <small className={taxMsg ? (taxMsg.startsWith("✓") ? "cuf-ok" : "cuf-err") : "cuf-hint"}>{taxMsg || (isCo ? "ใช้ออกใบกำกับภาษี" : "ใส่เมื่อลูกค้าต้องการใบกำกับภาษี")}</small>
          </div>
          {isCo && (
            <div className="field"><label htmlFor={id("branchType")}>สำนักงาน</label>
              <select id={id("branchType")} name="branchType" value={branchType} onChange={(e) => setBranchType(e.target.value === "branch" ? "branch" : "hq")}>
                <option value="hq">สำนักงานใหญ่</option><option value="branch">สาขา</option>
              </select></div>
          )}
          {isCo && branchType === "branch"
            ? inp("branchNo", "เลขที่สาขา (5 หลัก)", { inputMode: "numeric", maxLength: 5, placeholder: "00001" })
            : isCo ? <div className="field cuf-spacer" aria-hidden="true" /> : null}
        </div>
      </section>

      <section className="cuf-sec" aria-labelledby={id("secContact")}>
        <h3 id={id("secContact")}><span className="cuf-n">2</span>ข้อมูลติดต่อ</h3>
        <div className="cuf-g2">
          {inp("contactName", isCo ? "ชื่อผู้ติดต่อ / ฝ่าย" : "ชื่อผู้ติดต่อ (ถ้าไม่ใช่ลูกค้าเอง)", { maxLength: 120, autoComplete: "off" })}
          <div className="field">
            <label htmlFor={id("email")}>อีเมล</label>
            <input id={id("email")} name="email" type="email" inputMode="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.co.th" className={cls("email", emailBad)} aria-invalid={bad("email") || emailBad || undefined} />
            {emailBad ? <small className="cuf-err">รูปแบบอีเมลไม่ถูกต้อง</small> : <small className="cuf-hint">ส่งใบเสนอราคา/ใบแจ้งหนี้ทางอีเมล</small>}
          </div>
        </div>
        <div className="cuf-g2 cuf-pf">
          <PhoneListField initial={v.phones} idFirst={id("phone")} bad={bad("phones")} />
          <div className="field">
            <label htmlFor={id("fax")}>โทรสาร (แฟกซ์)</label>
            <input id={id("fax")} name="fax" inputMode="tel" maxLength={40} value={fax} onChange={(e) => setFax(e.target.value)} placeholder="เช่น 02-123-4568"
              className={cls("fax", !!faxHint && !faxHint.ok)} aria-invalid={bad("fax") || (!!faxHint && !faxHint.ok) || undefined} />
            {faxHint ? <small className={faxHint.ok ? "cuf-ok" : "cuf-err"}>{faxHint.ok ? faxHint.text : "รูปแบบไม่ถูกต้อง (ใส่ได้ 1 เบอร์)"}</small> : <small className="cuf-hint">ไม่บังคับ</small>}
          </div>
        </div>
      </section>

      <section className="cuf-sec" aria-labelledby={id("secAddr")}>
        <h3 id={id("secAddr")}><span className="cuf-n">3</span>ที่อยู่ (ใช้ออกเอกสาร)</h3>
        {inp("addressLine", "บ้านเลขที่ หมู่ อาคาร ซอย ถนน", { maxLength: 300, autoComplete: "off" })}
        <div className="four">
          {inp("subdistrict", "ตำบล/แขวง", { maxLength: 80 })}
          {inp("district", "อำเภอ/เขต", { maxLength: 80 })}
          {inp("province", "จังหวัด", { maxLength: 80 })}
          {inp("postalCode", "รหัสไปรษณีย์", { inputMode: "numeric", maxLength: 5 })}
        </div>
      </section>
    </>
  );
}
