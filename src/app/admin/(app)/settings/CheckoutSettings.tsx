"use client";
// ส่วนตั้งค่า: เก็บเงินปลายทาง · ค่าส่งพื้นที่ห่างไกล/ตามน้ำหนัก · รับที่ร้าน (A18) · อีเมลลูกค้า + ส่งทดสอบ (A19)
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { saveCheckoutSettings, sendTestEmailAction, type CheckoutSettingsState } from "./checkout-actions";

export type CheckoutSettingsValues = {
  codEnabled: boolean; codFee: string; codMax: string;
  remoteZips: string; remoteFee: string; weightTiers: { maxKg: string; extra: string }[];
  pickupEnabled: boolean; pickupNote: string;
  emailEnabled: boolean; templates: Record<string, { subject: string; body: string }>; defaults: Record<string, { subject: string; body: string }>;
  smtp: { configured: boolean; host: string; port: number; from: string };
  vars: string[];
};
const TPL_LABEL: Record<string, string> = { ORDER_RECEIVED: "ได้รับคำสั่งซื้อ", PAID: "ชำระเงินแล้ว / ร้านยืนยัน", SHIPPED: "จัดส่งแล้ว (มีเลขพัสดุ)" };

export function CheckoutSettings({ v }: { v: CheckoutSettingsValues }) {
  const [state, onSubmit, pending] = useFormAction<CheckoutSettingsState>(saveCheckoutSettings, {});
  const [test, onTest, testing] = useFormAction<CheckoutSettingsState>(sendTestEmailAction, {});
  const [cod, setCod] = useState(v.codEnabled);
  const [pickup, setPickup] = useState(v.pickupEnabled);
  const [email, setEmail] = useState(v.emailEnabled);
  const [tiers, setTiers] = useState(v.weightTiers);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  return (
    <>
      <form onSubmit={onSubmit} id="checkoutSettings">
        <input type="hidden" name="weightTiers" value={JSON.stringify(tiers)} />
        <h2 style={{ fontSize: 18, margin: "28px 0 10px" }}>การชำระเงินและการจัดส่ง (รอบ 3)</h2>
        {state.error && <div className="login-err" role="alert">{state.error}</div>}
        {state.ok && <div className="login-info" role="status">{state.ok}</div>}
        <div className="set-grid">
          <div className="box" id="codBox">
            <h3>เก็บเงินปลายทาง (COD)</h3>
            <label className="chk-row"><input type="checkbox" name="codEnabled" checked={cod} onChange={(e) => setCod(e.target.checked)} /> เปิดให้ลูกค้าเลือกเก็บเงินปลายทาง</label>
            <div className="two">
              <div className="field"><label htmlFor="codFee">ค่าธรรมเนียม COD (บาท)</label><input id="codFee" name="codFee" defaultValue={v.codFee} inputMode="decimal" {...bad("codFee")} /></div>
              <div className="field"><label htmlFor="codMax">ยอดสูงสุดที่รับ COD (บาท)</label><input id="codMax" name="codMax" defaultValue={v.codMax} inputMode="decimal" placeholder="0 = ไม่จำกัด" {...bad("codMax")} /></div>
            </div>
            <small className="sub">ออเดอร์ COD ไม่ต้องแนบสลิป — เข้าคิว &quot;รอยืนยัน COD&quot; ในหน้าคำสั่งซื้อ ร้านโทรยืนยันก่อนส่ง</small>
          </div>

          <div className="box" id="remoteBox">
            <h3>ค่าส่งพื้นที่ห่างไกล</h3>
            <div className="field"><label htmlFor="remoteFee">ค่าส่งเพิ่ม (บาท)</label><input id="remoteFee" name="remoteFee" defaultValue={v.remoteFee} inputMode="decimal" {...bad("remoteFee")} /></div>
            <div className="field">
              <label htmlFor="remoteZips">รหัสไปรษณีย์ (5 หลัก หรือขึ้นต้น 2–4 หลัก เช่น 95 = ทุกรหัสที่ขึ้นต้น 95)</label>
              <textarea id="remoteZips" name="remoteZips" rows={4} defaultValue={v.remoteZips} placeholder="เช่น 63170 95 96 58" {...bad("remoteZips")} />
            </div>
          </div>

          <div className="box" id="weightBox">
            <h3>ค่าส่งเพิ่มตามน้ำหนักรวม</h3>
            <table className="tier-tbl" {...bad("weightTiers")}>
              <thead><tr><th>น้ำหนักรวมไม่เกิน (กก.)</th><th>ค่าส่งเพิ่ม (บาท)</th><th /></tr></thead>
              <tbody>
                {tiers.map((t, i) => (
                  <tr key={i}>
                    <td><input aria-label={`น้ำหนักขั้นที่ ${i + 1}`} value={t.maxKg} inputMode="decimal" onChange={(e) => setTiers(tiers.map((x, k) => (k === i ? { ...x, maxKg: e.target.value } : x)))} /></td>
                    <td><input aria-label={`ค่าส่งเพิ่มขั้นที่ ${i + 1}`} value={t.extra} inputMode="decimal" onChange={(e) => setTiers(tiers.map((x, k) => (k === i ? { ...x, extra: e.target.value } : x)))} /></td>
                    <td><button type="button" className="link" onClick={() => setTiers(tiers.filter((_, k) => k !== i))}>ลบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div><button type="button" className="btn btn-outline btn-sm" id="addWeightTier" onClick={() => setTiers([...tiers, { maxKg: "", extra: "" }])}>+ เพิ่มขั้นน้ำหนัก</button></div>
            <small className="sub">ใช้น้ำหนักสินค้า (กรัม) จากหน้าสินค้า × จำนวน · สินค้าที่ไม่ได้ใส่น้ำหนักนับเป็น 0 · หนักเกินขั้นสุดท้ายใช้ขั้นสุดท้าย · ไม่มีขั้น = ไม่คิด</small>
          </div>

          <div className="box" id="pickupBox">
            <h3>รับสินค้าที่ร้าน</h3>
            <label className="chk-row"><input type="checkbox" name="pickupEnabled" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> ให้ลูกค้าเลือก &quot;รับสินค้าที่ร้าน&quot; (ไม่มีค่าส่ง ไม่ต้องกรอกที่อยู่)</label>
            <div className="field"><label htmlFor="pickupNote">จุดรับ / เวลาเปิดร้าน (ลูกค้าเห็นตอนเลือก)</label><input id="pickupNote" name="pickupNote" defaultValue={v.pickupNote} maxLength={300} placeholder="เช่น จ.–ส. 09:00–17:00 โทรนัดก่อนเข้ารับ" /></div>
          </div>

          <div className="box" id="emailBox" style={{ gridColumn: "1 / -1" }}>
            <h3>อีเมลแจ้งลูกค้า</h3>
            <p className={v.smtp.configured ? "sub" : "warn-box"} id="smtpStatus">
              {v.smtp.configured
                ? `SMTP พร้อมใช้: ${v.smtp.host}:${v.smtp.port} · ผู้ส่ง ${v.smtp.from}`
                : "ยังไม่ได้ตั้งค่า SMTP ในเซิร์ฟเวอร์ (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM) — อีเมลจะถูกบันทึกเป็น \"ข้าม\" จนกว่าจะตั้งค่า"}
            </p>
            <label className="chk-row"><input type="checkbox" name="emailEnabled" checked={email} onChange={(e) => setEmail(e.target.checked)} /> ส่งอีเมลเมื่อ ได้รับคำสั่งซื้อ / ชำระแล้ว / จัดส่ง (เฉพาะลูกค้าที่กรอกอีเมล)</label>
            <small className="sub">ตัวแปรที่ใช้ได้: {v.vars.join(" ")} · เว้นว่าง = ใช้ข้อความเริ่มต้น</small>
            {Object.keys(TPL_LABEL).map((k) => (
              <details key={k} className="tpl-box">
                <summary>{TPL_LABEL[k]}</summary>
                <div className="field"><label htmlFor={`tpl_${k}_subject`}>หัวเรื่อง</label><input id={`tpl_${k}_subject`} name={`tpl_${k}_subject`} defaultValue={v.templates[k]?.subject ?? ""} placeholder={v.defaults[k].subject} maxLength={200} /></div>
                <div className="field"><label htmlFor={`tpl_${k}_body`}>ข้อความ</label><textarea id={`tpl_${k}_body`} name={`tpl_${k}_body`} rows={6} defaultValue={v.templates[k]?.body ?? ""} placeholder={v.defaults[k].body} /></div>
              </details>
            ))}
          </div>
        </div>
        <div className="set-foot">
          <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกการชำระเงิน/จัดส่ง/อีเมล"}</button>
        </div>
      </form>

      <form onSubmit={onTest} className="box" id="emailTest" style={{ marginTop: 16, maxWidth: 640 }}>
        <h3>ส่งอีเมลทดสอบ</h3>
        {test.error && <div className="login-err" role="alert">{test.error}</div>}
        {test.ok && <div className="login-info" role="status">{test.ok}</div>}
        <div className="two">
          <div className="field"><label htmlFor="testTo">ส่งถึง</label><input id="testTo" name="testTo" type="email" required placeholder="you@example.com" /></div>
          <div className="field">
            <label htmlFor="testTemplate">แม่แบบ</label>
            <select id="testTemplate" name="testTemplate">{Object.entries(TPL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
        </div>
        <button className="btn btn-outline" type="submit" disabled={testing}>{testing ? "กำลังส่ง…" : "ส่งทดสอบ (ใช้แม่แบบที่บันทึกแล้ว)"}</button>
      </form>
    </>
  );
}
