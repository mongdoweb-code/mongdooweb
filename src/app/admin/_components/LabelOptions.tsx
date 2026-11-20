"use client";
// ตัวเลือกใบปะหน้า (ขนาด, จำนวนกล่อง, เก็บเงินปลายทาง, เครื่องหมายระวัง, แสดงรายการ) — จำค่าที่เลือกล่าสุดไว้ในเบราว์เซอร์
import { useEffect, useState } from "react";

const KEY = "mdw_label_prefs";
const MARKS = [["fragile", "ระวังแตก"], ["noThrow", "ห้ามโยน"], ["upright", "ตั้งขึ้น"]] as const;
type Prefs = { size: "A6" | "A4"; marks: Record<string, boolean>; showItems: boolean };
const DEF: Prefs = { size: "A6", marks: { fragile: true, noThrow: true, upright: true }, showItems: false };

export type LabelTo = { name: string; phone: string; addr: string; zip: string };

/**
 * codFixed (สตางค์): ใบปะหน้าจากคำสั่งซื้อ — ยอดเก็บเงินปลายทางมาจากคำสั่งซื้อ (0 = ไม่เก็บ) แสดงอย่างเดียว ไม่ส่ง ?cod=
 * to: ผู้รับตามเอกสาร/คำสั่งซื้อ — แก้ได้เฉพาะใบปะหน้านี้ (ผู้สั่งกับที่ส่งของต่างที่กัน) ไม่เปลี่ยนข้อมูลลูกค้า/เอกสาร
 */
export function LabelOptions({ target, idKey, cod: cod0 = "", codFixed, to }: { target: string; idKey: string; cod?: string; codFixed?: number; to?: LabelTo }) {
  const [p, setP] = useState<Prefs>(DEF);
  const [boxes, setBoxes] = useState(1);
  const [cod, setCod] = useState(cod0);
  const [edit, setEdit] = useState(false);
  const [rcv, setRcv] = useState<LabelTo>(to ?? { name: "", phone: "", addr: "", zip: "" });
  const changed = !!to && (rcv.name !== to.name || rcv.phone !== to.phone || rcv.addr !== to.addr || rcv.zip !== to.zip);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v && typeof v === "object") setP({ size: v.size === "A4" ? "A4" : "A6", marks: { ...DEF.marks, ...(v.marks ?? {}) }, showItems: v.showItems === true });
    } catch {}
  }, []);
  const save = (n: Prefs) => {
    setP(n);
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {}
  };
  const qs = new URLSearchParams({ size: p.size, boxes: String(boxes), marks: MARKS.filter(([k]) => p.marks[k]).map(([k]) => k).join(",") || "none", auto: "1" });
  if (p.showItems) qs.set("items", "1");
  const codN = Number(cod.replace(/[,\s฿]/g, ""));
  if (codFixed === undefined && codN > 0) qs.set("cod", String(codN));
  // ผู้รับที่แก้เอง (เฉพาะใบนี้)
  if (changed) {
    qs.set("toName", rcv.name.trim().slice(0, 120));
    qs.set("toPhone", rcv.phone.trim().slice(0, 60));
    qs.set("toAddr", rcv.addr.trim().slice(0, 400));
    qs.set("toZip", rcv.zip.replace(/\D/g, "").slice(0, 5));
  }
  const url = `/admin/print/labels?${target}&${qs}`;
  return (
    <div className="lbo">
      <div className="lbo-grid">
        <div className="field"><label htmlFor={`lb-size-${idKey}`}>ขนาด</label>
          <select id={`lb-size-${idKey}`} value={p.size} onChange={(e) => save({ ...p, size: e.target.value === "A4" ? "A4" : "A6" })}>
            <option value="A6">A6 100×150 มม. (เครื่องพิมพ์ฉลาก)</option><option value="A4">A4 — 4 ใบต่อแผ่น</option>
          </select></div>
        <div className="field"><label htmlFor={`lb-boxes-${idKey}`}>จำนวนกล่อง</label><input id={`lb-boxes-${idKey}`} type="number" min={1} max={50} value={boxes} onChange={(e) => setBoxes(Math.min(50, Math.max(1, Math.round(Number(e.target.value) || 1))))} /></div>
        {codFixed === undefined ? (
          <div className="field"><label htmlFor={`lb-cod-${idKey}`}>เก็บเงินปลายทาง (บาท)</label><input id={`lb-cod-${idKey}`} inputMode="decimal" placeholder="ไม่เก็บ" value={cod} onChange={(e) => setCod(e.target.value)} /></div>
        ) : (
          <div className="field"><span className="sub">เก็บเงินปลายทาง</span><b id={`lb-cod-${idKey}`}>{codFixed > 0 ? `฿${(codFixed / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : "ไม่เก็บ"}</b></div>
        )}
      </div>
      <div className="lbo-chk">
        {MARKS.map(([k, l]) => <label key={k}><input type="checkbox" checked={!!p.marks[k]} onChange={(e) => save({ ...p, marks: { ...p.marks, [k]: e.target.checked } })} /> {l}</label>)}
        <label><input type="checkbox" checked={p.showItems} onChange={(e) => save({ ...p, showItems: e.target.checked })} /> แสดงรายการสินค้า</label>
      </div>
      {to && (
        <>
          <label className="chk-row lbo-edit"><input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} /> แก้ไขชื่อ/ที่อยู่/เบอร์ผู้รับ (ส่งของคนละที่กับผู้สั่ง)</label>
          {edit && (
            <div className="lbo-to" role="group" aria-label="ผู้รับบนใบปะหน้า">
              <div className="field"><label htmlFor={`lb-to-name-${idKey}`}>ชื่อผู้รับ</label><input id={`lb-to-name-${idKey}`} value={rcv.name} maxLength={120} onChange={(e) => setRcv({ ...rcv, name: e.target.value })} /></div>
              <div className="field"><label htmlFor={`lb-to-addr-${idKey}`}>ที่อยู่จัดส่ง</label><textarea id={`lb-to-addr-${idKey}`} value={rcv.addr} maxLength={400} rows={3} onChange={(e) => setRcv({ ...rcv, addr: e.target.value })} /></div>
              <div className="two">
                <div className="field"><label htmlFor={`lb-to-phone-${idKey}`}>เบอร์โทรผู้รับ</label><input id={`lb-to-phone-${idKey}`} inputMode="tel" value={rcv.phone} maxLength={60} placeholder="ว่าง = เว้นช่องให้เขียน" onChange={(e) => setRcv({ ...rcv, phone: e.target.value })} /></div>
                <div className="field"><label htmlFor={`lb-to-zip-${idKey}`}>รหัสไปรษณีย์</label><input id={`lb-to-zip-${idKey}`} inputMode="numeric" value={rcv.zip} maxLength={5} onChange={(e) => setRcv({ ...rcv, zip: e.target.value })} /></div>
              </div>
              {changed && <button type="button" className="link lbo-reset" onClick={() => setRcv(to)}>ใช้ข้อมูลเดิม</button>}
              <small className="sub">ใช้กับใบปะหน้านี้เท่านั้น — ไม่เปลี่ยนข้อมูลลูกค้าหรือเอกสาร</small>
            </div>
          )}
        </>
      )}
      <a className="btn btn-outline" href={url} target="_blank" rel="noopener">พิมพ์ใบปะหน้า {boxes > 1 ? `(${boxes} ใบ)` : ""}</a>
    </div>
  );
}
