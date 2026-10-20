"use client";
// ฟอร์มตั้งค่าร้าน — บัญชีรับโอนและขั้นค่าส่งเพิ่ม/ลบได้, บันทึกด้วย server action
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { saveSettings, type FormState } from "./actions";

export type SettingsValues = {
  legalName: string; phone: string; email: string; lineId: string; lineOaUrl: string; website: string; addressText: string;
  businessHours: string; facebookUrl: string; youtubeUrl: string; tiktokUrl: string;
  bankAccounts: { bank: string; account: string; holder: string }[];
  promptpayId: string; promptpayName: string;
  tiers: { min: string; fee: string }[]; expressEnabled: boolean; expressExtra: string;
  slipCheckWithin: string; newOrderSound: boolean;
  taxId: string; branch: string; vatEnabled: boolean; vatMode: string;
  prefixQuote: string; prefixInvoice: string; prefixReceipt: string; dateEra: string;
  quoteValidDays: number; invoiceDueDays: number; termsQuote: string; termsInvoice: string; termsReceipt: string; showSignature: boolean;
  logoUrl: string | null;
};

const bahtNum = (v: string) => Number(String(v).replace(/[,\s]/g, ""));
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

export function SettingsForm({ v, banks }: { v: SettingsValues; banks: Record<string, string> }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveSettings, {});
  const [accounts, setAccounts] = useState(v.bankAccounts.length ? v.bankAccounts : [{ bank: "KBANK", account: "", holder: "" }]);
  const [tiers, setTiers] = useState(v.tiers.length ? v.tiers : [{ min: "0", fee: "0" }]);
  const [express, setExpress] = useState(v.expressEnabled);
  const [vat, setVat] = useState(v.vatEnabled);
  const [logoPreview, setLogoPreview] = useState<string | null>(v.logoUrl);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  const sortedTiers = [...tiers].sort((a, b) => bahtNum(a.min) - bahtNum(b.min));

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="bankAccounts" value={JSON.stringify(accounts)} />
      <input type="hidden" name="shippingTiers" value={JSON.stringify(tiers)} />
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}

      <div className="set-grid">
        <div className="box">
          <h3>ข้อมูลร้าน (แสดงท้ายเว็บ ใบปะหน้า และหัวเอกสาร)</h3>
          <div className="field"><label htmlFor="legalName">ชื่อร้าน / ชื่อบริษัท</label><input id="legalName" name="legalName" defaultValue={v.legalName} required maxLength={120} {...bad("legalName")} /></div>
          <div className="two">
            <div className="field"><label htmlFor="phone">เบอร์โทร</label><input id="phone" name="phone" defaultValue={v.phone} required inputMode="tel" maxLength={40} {...bad("phone")} /></div>
            <div className="field"><label htmlFor="email">อีเมล</label><input id="email" name="email" type="email" defaultValue={v.email} maxLength={120} {...bad("email")} /></div>
          </div>
          <div className="field"><label htmlFor="addressText">ที่อยู่ร้าน</label><textarea id="addressText" name="addressText" defaultValue={v.addressText} required maxLength={300} rows={2} {...bad("addressText")} /></div>
          <div className="field"><label htmlFor="businessHours">เวลาทำการ</label><input id="businessHours" name="businessHours" defaultValue={v.businessHours} maxLength={120} placeholder="เช่น จ.–ส. 09:00–18:00" /></div>
          <div className="field"><label htmlFor="website">เว็บไซต์</label><input id="website" name="website" defaultValue={v.website} placeholder="https://..." {...bad("website")} /></div>
        </div>

        <div className="box">
          <h3>LINE และโซเชียล</h3>
          <div className="two">
            <div className="field"><label htmlFor="lineId">LINE ID</label><input id="lineId" name="lineId" defaultValue={v.lineId} placeholder="@mongdoweb" maxLength={60} /></div>
            <div className="field"><label htmlFor="lineOaUrl">ลิงก์ LINE OA</label><input id="lineOaUrl" name="lineOaUrl" defaultValue={v.lineOaUrl} placeholder="https://line.me/ti/p/~@..." {...bad("lineOaUrl")} /></div>
          </div>
          <div className="field"><label htmlFor="facebookUrl">Facebook</label><input id="facebookUrl" name="facebookUrl" defaultValue={v.facebookUrl} placeholder="https://facebook.com/... (เว้นว่าง = ไม่แสดง)" {...bad("facebookUrl")} /></div>
          <div className="field"><label htmlFor="youtubeUrl">YouTube</label><input id="youtubeUrl" name="youtubeUrl" defaultValue={v.youtubeUrl} placeholder="เว้นว่าง = ไม่แสดง" {...bad("youtubeUrl")} /></div>
          <div className="field"><label htmlFor="tiktokUrl">TikTok</label><input id="tiktokUrl" name="tiktokUrl" defaultValue={v.tiktokUrl} placeholder="เว้นว่าง = ไม่แสดง" {...bad("tiktokUrl")} /></div>
        </div>

        <div className="box">
          <h3>บัญชีรับโอน</h3>
          {accounts.map((a, i) => (
            <div key={i} className="bank-edit" {...bad("bankAccounts")}>
              <div className="two">
                <div className="field">
                  <label htmlFor={`bk-${i}`}>ธนาคาร</label>
                  <select id={`bk-${i}`} value={a.bank} onChange={(e) => setAccounts(accounts.map((x, k) => (k === i ? { ...x, bank: e.target.value } : x)))}>
                    {Object.entries(banks).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`ac-${i}`}>เลขที่บัญชี</label>
                  <input id={`ac-${i}`} value={a.account} inputMode="numeric" onChange={(e) => setAccounts(accounts.map((x, k) => (k === i ? { ...x, account: e.target.value } : x)))} />
                </div>
              </div>
              <div className="field">
                <label htmlFor={`ho-${i}`}>ชื่อบัญชี (ลูกค้าเห็นในหน้าชำระเงิน)</label>
                <input id={`ho-${i}`} value={a.holder} placeholder="เช่น นาย... / บจก. ..." onChange={(e) => setAccounts(accounts.map((x, k) => (k === i ? { ...x, holder: e.target.value } : x)))} />
              </div>
              {accounts.length > 1 && <button type="button" className="link" onClick={() => setAccounts(accounts.filter((_, k) => k !== i))}>ลบบัญชีนี้</button>}
            </div>
          ))}
          <div><button type="button" className="btn btn-outline btn-sm" onClick={() => setAccounts([...accounts, { bank: "SCB", account: "", holder: "" }])}>+ เพิ่มบัญชี</button></div>
        </div>

        <div className="box">
          <h3>PromptPay</h3>
          <div className="field">
            <label htmlFor="promptpayId">เบอร์มือถือ / เลขผู้เสียภาษีที่ผูก PromptPay</label>
            <input id="promptpayId" name="promptpayId" defaultValue={v.promptpayId} inputMode="numeric" placeholder="เว้นว่าง = ไม่แสดง QR" {...bad("promptpayId")} />
            <small>ใส่เลขที่ผูก PromptPay จริงเท่านั้น ระบบสร้าง QR พร้อมยอดเงินให้อัตโนมัติ (เบอร์ 10 หลัก หรือเลข 13 หลัก)</small>
          </div>
          <div className="field"><label htmlFor="promptpayName">ชื่อที่ลูกค้าเห็นตอนสแกน</label><input id="promptpayName" name="promptpayName" defaultValue={v.promptpayName} required {...bad("promptpayName")} /></div>
        </div>

        <div className="box">
          <h3>ค่าจัดส่งตามยอดสั่งซื้อ</h3>
          <table className="tier-tbl" {...bad("shippingTiers")}>
            <thead><tr><th>ยอดสินค้าตั้งแต่ (บาท)</th><th>ค่าส่ง (บาท, 0 = ส่งฟรี)</th><th /></tr></thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={i}>
                  <td><input aria-label={`ยอดขั้นที่ ${i + 1}`} value={t.min} inputMode="numeric" disabled={i === 0} onChange={(e) => setTiers(tiers.map((x, k) => (k === i ? { ...x, min: e.target.value } : x)))} /></td>
                  <td><input aria-label={`ค่าส่งขั้นที่ ${i + 1}`} value={t.fee} inputMode="numeric" onChange={(e) => setTiers(tiers.map((x, k) => (k === i ? { ...x, fee: e.target.value } : x)))} /></td>
                  <td>{i > 0 && <button type="button" className="link" onClick={() => setTiers(tiers.filter((_, k) => k !== i))}>ลบ</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div><button type="button" className="btn btn-outline btn-sm" onClick={() => setTiers([...tiers, { min: "", fee: "" }])}>+ เพิ่มขั้น</button></div>
          <small className="sub">
            ลูกค้าเห็น:{" "}
            {sortedTiers.map((t, i) => {
              const next = sortedTiers[i + 1];
              const fee = bahtNum(t.fee);
              return `${fmt(bahtNum(t.min))}${next ? `–${fmt(bahtNum(next.min) - 0.01)}` : "+"} บาท = ${fee ? `฿${fmt(fee)}` : "ส่งฟรี"}`;
            }).join(" · ")}
          </small>
          <label className="chk-row"><input type="checkbox" name="expressEnabled" checked={express} onChange={(e) => setExpress(e.target.checked)} /> เปิดตัวเลือก &quot;ส่งด่วน&quot;</label>
          {express && <div className="field"><label htmlFor="expressExtra">ส่งด่วน คิดเพิ่มจากค่าส่งปกติ (บาท)</label><input id="expressExtra" name="expressExtra" defaultValue={v.expressExtra} inputMode="numeric" {...bad("expressExtra")} /></div>}
          {!express && <input type="hidden" name="expressExtra" value={v.expressExtra} />}
        </div>

        <div className="box">
          <h3>การตรวจสลิปและแจ้งเตือน</h3>
          <div className="field"><label htmlFor="slipCheckWithin">ระยะเวลาตรวจสลิป (แสดงหลังลูกค้าสั่งซื้อ)</label><input id="slipCheckWithin" name="slipCheckWithin" defaultValue={v.slipCheckWithin} required {...bad("slipCheckWithin")} /></div>
          <label className="chk-row"><input type="checkbox" name="newOrderSound" defaultChecked={v.newOrderSound} /> เล่นเสียงเตือนเมื่อมีสลิปใหม่ (ต้องเปิดหน้าคำสั่งซื้อค้างไว้)</label>
        </div>

        <div className="box set-docs">
          <h3>เอกสารขาย (ใบเสนอราคา · ใบแจ้งหนี้ · ใบเสร็จรับเงิน)</h3>
          <div className="two">
            <div className="field"><label htmlFor="taxId">เลขประจำตัวผู้เสียภาษีของร้าน (13 หลัก)</label><input id="taxId" name="taxId" defaultValue={v.taxId} inputMode="numeric" maxLength={17} placeholder="เว้นว่างได้ถ้ายังไม่มี" {...bad("taxId")} /></div>
            <div className="field"><label htmlFor="branch">สาขา</label><input id="branch" name="branch" defaultValue={v.branch} maxLength={40} placeholder="สำนักงานใหญ่" /></div>
          </div>
          <div className="field">
            <span className="lbl">โลโก้บนเอกสาร</span>
            <div className="logo-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logoPreview ? <img src={logoPreview} alt="โลโก้ปัจจุบัน" /> : <span className="sub">ยังไม่มีโลโก้</span>}
              <label className="btn btn-outline btn-sm" htmlFor="logo">อัปโหลดโลโก้ใหม่</label>
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setLogoPreview(URL.createObjectURL(f)); }} />
              {v.logoUrl && <label className="chk-row"><input type="checkbox" name="removeLogo" /> ลบโลโก้</label>}
            </div>
            <small>PNG พื้นใสคมชัดที่สุด · ระบบย่อให้อัตโนมัติ</small>
          </div>
          <label className="chk-row"><input type="checkbox" name="vatEnabled" checked={vat} onChange={(e) => setVat(e.target.checked)} /> คิดภาษีมูลค่าเพิ่ม 7% (จดทะเบียน VAT แล้ว) — ใบเสร็จจะเป็น &quot;ใบเสร็จรับเงิน / ใบกำกับภาษี&quot;</label>
          {vat && (
            <div className="field">
              <label htmlFor="vatMode">รูปแบบราคา (ค่าเริ่มต้นของเอกสารใหม่)</label>
              <select id="vatMode" name="vatMode" defaultValue={v.vatMode}>
                <option value="EXCLUSIVE">ราคาไม่รวม VAT (บวกเพิ่ม 7%)</option>
                <option value="INCLUSIVE">ราคารวม VAT แล้ว (ถอดภาษีออกมาแสดง)</option>
              </select>
            </div>
          )}
          <div className="three">
            <div className="field"><label htmlFor="prefixQuote">คำนำหน้า ใบเสนอราคา</label><input id="prefixQuote" name="prefixQuote" defaultValue={v.prefixQuote} maxLength={6} {...bad("prefixQuote")} /></div>
            <div className="field"><label htmlFor="prefixInvoice">คำนำหน้า ใบแจ้งหนี้</label><input id="prefixInvoice" name="prefixInvoice" defaultValue={v.prefixInvoice} maxLength={6} {...bad("prefixInvoice")} /></div>
            <div className="field"><label htmlFor="prefixReceipt">คำนำหน้า ใบเสร็จ</label><input id="prefixReceipt" name="prefixReceipt" defaultValue={v.prefixReceipt} maxLength={6} {...bad("prefixReceipt")} /></div>
          </div>
          <small className="sub">รูปแบบเลขที่: คำนำหน้า + ปี ค.ศ. 2 หลัก + เดือน + ลำดับ 5 หลัก เช่น {v.prefixQuote}2610-00001 (เริ่มใหม่ทุกเดือน)</small>
          <div className="three">
            <div className="field"><label htmlFor="dateEra">รูปแบบวันที่</label><select id="dateEra" name="dateEra" defaultValue={v.dateEra}><option value="AD">ค.ศ. (5/5/2026)</option><option value="BE">พ.ศ. (5/5/2569)</option></select></div>
            <div className="field"><label htmlFor="quoteValidDays">ยืนราคา (วัน)</label><input id="quoteValidDays" name="quoteValidDays" defaultValue={v.quoteValidDays} inputMode="numeric" {...bad("quoteValidDays")} /></div>
            <div className="field"><label htmlFor="invoiceDueDays">ครบกำหนดชำระ (วัน)</label><input id="invoiceDueDays" name="invoiceDueDays" defaultValue={v.invoiceDueDays} inputMode="numeric" {...bad("invoiceDueDays")} /></div>
          </div>
          <div className="three">
            <div className="field"><label htmlFor="termsQuote">เงื่อนไข ใบเสนอราคา</label><textarea id="termsQuote" name="termsQuote" defaultValue={v.termsQuote} maxLength={600} rows={4} /></div>
            <div className="field"><label htmlFor="termsInvoice">เงื่อนไข ใบแจ้งหนี้</label><textarea id="termsInvoice" name="termsInvoice" defaultValue={v.termsInvoice} maxLength={600} rows={4} /></div>
            <div className="field"><label htmlFor="termsReceipt">ข้อความ ใบเสร็จ</label><textarea id="termsReceipt" name="termsReceipt" defaultValue={v.termsReceipt} maxLength={600} rows={4} placeholder="ไม่บังคับ" /></div>
          </div>
          <label className="chk-row"><input type="checkbox" name="showSignature" defaultChecked={v.showSignature} /> แสดงช่องลงชื่อท้ายเอกสาร</label>
        </div>
      </div>
      <div className="set-foot">
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}</button>
        <a className="btn btn-outline" href="/checkout" target="_blank" rel="noopener">เปิดหน้าชำระเงินเพื่อตรวจ</a>
      </div>
    </form>
  );
}
