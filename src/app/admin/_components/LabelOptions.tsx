"use client";
// ตัวเลือกใบปะหน้า (ขนาด, จำนวนกล่อง, เก็บเงินปลายทาง, เครื่องหมายระวัง, แสดงรายการ) — จำค่าที่เลือกล่าสุดไว้ในเบราว์เซอร์
import { useEffect, useState } from "react";

const KEY = "mdw_label_prefs";
const MARKS = [["fragile", "ระวังแตก"], ["noThrow", "ห้ามโยน"], ["upright", "ตั้งขึ้น"]] as const;
type Prefs = { size: "A6" | "A4"; marks: Record<string, boolean>; showItems: boolean };
const DEF: Prefs = { size: "A6", marks: { fragile: true, noThrow: true, upright: true }, showItems: false };

/** codFixed (สตางค์): ใบปะหน้าจากคำสั่งซื้อ — ยอดเก็บเงินปลายทางมาจากคำสั่งซื้อ (0 = ไม่เก็บ) แสดงอย่างเดียว ไม่ส่ง ?cod= */
export function LabelOptions({ target, idKey, cod: cod0 = "", codFixed }: { target: string; idKey: string; cod?: string; codFixed?: number }) {
  const [p, setP] = useState<Prefs>(DEF);
  const [boxes, setBoxes] = useState(1);
  const [cod, setCod] = useState(cod0);
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
      <a className="btn btn-outline" href={url} target="_blank" rel="noopener">พิมพ์ใบปะหน้า {boxes > 1 ? `(${boxes} ใบ)` : ""}</a>
    </div>
  );
}
