"use client";
// เครื่องคำนวณหม้อแปลง (ฝั่งเบราว์เซอร์) — ใส่ตะกร้าผ่าน window.addToCart ของ public/js/shell.js
import { useEffect, useId, useState } from "react";
import { PSU_FACTOR, neededWatt, powerText, recommendPsu, type PsuItem, type PsuLight, type PsuPower } from "@/lib/product-psu";
import { formatBaht } from "../../_components/format";

type Row = { key: number; light: string; watt: string; qty: string };
type ShellWin = Window & { addToCart?: (id: string, qty: number, mode: string) => boolean; openCart?: (from?: Element) => void };

const VOLTS: { v: string; label: string; power: PsuPower }[] = [
  { v: "dc12", label: "DC 12V", power: { v: "12", ac: false } },
  { v: "dc24", label: "DC 24V", power: { v: "24", ac: false } },
  { v: "ac12", label: "AC 12V", power: { v: "12", ac: true } },
  { v: "ac24", label: "AC 24V", power: { v: "24", ac: true } },
];
const voltKey = (p: PsuPower | null) => (p ? `${p.ac ? "ac" : "dc"}${p.v}` : "dc12");
let seq = 1;

export function PsuCalculator({ psus, lights }: { psus: PsuItem[]; lights: PsuLight[] }) {
  const uid = useId();
  const [rows, setRows] = useState<Row[]>([{ key: 0, light: "", watt: "", qty: "1" }]);
  const [volt, setVolt] = useState("dc12");

  // ?light=<slug>&qty=<n> จากหน้าสินค้า/ตัวช่วยเลือกไฟ
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const l = lights.find((x) => x.id === sp.get("light"));
    if (!l) return;
    const q = Math.min(999, Math.max(1, Math.floor(Number(sp.get("qty"))) || 1));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน URL ได้หลัง mount เท่านั้น (หน้าแคชทั้งหน้า)
    setRows([{ key: 0, light: l.id, watt: String(l.watt), qty: String(q) }]);
    setVolt(voltKey(l.power));
  }, [lights]);

  const nums = rows.map((r) => ({ watt: Number(r.watt) || 0, qty: Math.floor(Number(r.qty)) || 0 }));
  const total = nums.reduce((s, r) => s + (r.watt > 0 && r.qty > 0 ? r.watt * r.qty : 0), 0);
  const need = neededWatt(nums);
  const power = VOLTS.find((x) => x.v === volt)?.power ?? null;
  const rec = recommendPsu(need, power, psus);
  const set = (key: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (id: string, qty: number, el: Element) => {
    const w = window as ShellWin;
    if (w.addToCart?.(id, qty, "silent")) w.openCart?.(el);
  };

  return (
    <div className="psu-grid">
      <section className="psu-box" aria-labelledby={`${uid}-h1`}>
        <h2 id={`${uid}-h1`}>1. โคมไฟที่จะต่อกับหม้อแปลง</h2>
        {rows.map((r, i) => (
          <div className="psu-row" key={r.key} data-psu-row={i}>
            <label>
              รุ่นโคม (ไม่บังคับ)
              <select
                value={r.light}
                onChange={(e) => {
                  const l = lights.find((x) => x.id === e.target.value);
                  set(r.key, { light: e.target.value, ...(l ? { watt: String(l.watt) } : {}) });
                  if (l && i === 0) setVolt(voltKey(l.power));
                }}
              >
                <option value="">ใส่วัตต์เอง</option>
                {lights.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.watt}W {powerText(l.power!)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              วัตต์/ดวง
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={r.watt}
                placeholder="เช่น 10"
                name={`watt${i}`}
                onChange={(e) => set(r.key, { watt: e.target.value, light: "" })}
              />
            </label>
            <label>
              จำนวน
              <input type="number" inputMode="numeric" min={1} max={999} value={r.qty} name={`qty${i}`} onChange={(e) => set(r.key, { qty: e.target.value })} />
            </label>
            <button
              type="button"
              className="del"
              aria-label={`ลบแถวที่ ${i + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
            >
              ×
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setRows([...rows, { key: seq++, light: "", watt: "", qty: "1" }])} disabled={rows.length >= 10}>
            + เพิ่มโคมอีกรุ่น
          </button>
        </div>
        <label className="psu-volt">
          แรงดันไฟของโคม
          <select value={volt} onChange={(e) => setVolt(e.target.value)} name="volt">
            {VOLTS.map((v) => (
              <option key={v.v} value={v.v}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <p className="pdp-note">
          โคมไฟใต้น้ำ/ไฟสวนแรงดันต่ำ <b>ห้ามต่อไฟบ้าน 220V โดยตรง</b> · ระยะสายยาวมากควรแบ่งเป็นหลายวงจร หม้อแปลงละวงจร
        </p>
      </section>

      <section className="psu-box" aria-labelledby={`${uid}-h2`} aria-live="polite">
        <h2 id={`${uid}-h2`}>2. หม้อแปลงที่แนะนำ</h2>
        <div className="psu-sum" data-psu-need={need}>
          <small>วัตต์รวม {total.toLocaleString("th-TH", { maximumFractionDigits: 1 })}W × {PSU_FACTOR} (เผื่อ 20%)</small>
          <span>ต้องใช้หม้อแปลงอย่างน้อย</span>
          <span className="big">{need > 0 ? `${need.toLocaleString("th-TH", { maximumFractionDigits: 1 })} W` : "–"}</span>
          {power && <small>แรงดัน {powerText(power)}</small>}
        </div>
        {need <= 0 ? (
          <p className="psu-empty">ใส่วัตต์ต่อดวงและจำนวนดวงเพื่อดูหม้อแปลงที่เหมาะ</p>
        ) : rec.single.length ? (
          <div className="psu-recs" data-psu-recs>
            {rec.single.map((x, i) => (
              <div key={x.item.id} className={`psu-rec${i === 0 ? " best" : ""}`} data-psu-rec={x.item.id}>
                {x.item.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={x.item.img} alt="" width={64} height={64} loading="lazy" />
                ) : (
                  <span className="ph acc" />
                )}
                <div>
                  {i === 0 && <span className="tag">แนะนำ</span>}
                  <a className="nm" href={`/product/${encodeURIComponent(x.item.id)}`}>
                    <span style={{ display: "block" }}>{x.item.name}</span>
                  </a>
                  <span className="meta">
                    {x.item.watt}W · ใช้ไป {Math.round((need / PSU_FACTOR / x.item.watt) * 100)}% · {formatBaht(x.item.price)}
                  </span>
                </div>
                <button type="button" className="add-btn" onClick={(e) => add(x.item.id, 1, e.currentTarget)} aria-label={`ใส่ตะกร้า: ${x.item.name}`}>
                  ใส่ตะกร้า
                </button>
              </div>
            ))}
          </div>
        ) : rec.multi ? (
          <div className="psu-recs" data-psu-recs>
            <p className="psu-empty">ไม่มีหม้อแปลงตัวเดียวที่พอ — แนะนำแบ่งโคมเป็น {rec.multi.qty} วงจร ใช้หม้อแปลงวงจรละ 1 ตัว</p>
            <div className="psu-rec best" data-psu-rec={rec.multi.item.id}>
              {rec.multi.item.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rec.multi.item.img} alt="" width={64} height={64} loading="lazy" />
              ) : (
                <span className="ph acc" />
              )}
              <div>
                <span className="tag">× {rec.multi.qty} ตัว</span>
                <a className="nm" href={`/product/${encodeURIComponent(rec.multi.item.id)}`}>
                  <span style={{ display: "block" }}>{rec.multi.item.name}</span>
                </a>
                <span className="meta">
                  {rec.multi.item.watt}W ต่อตัว · รวม {formatBaht(rec.multi.total)}
                </span>
              </div>
              <button type="button" className="add-btn" onClick={(e) => add(rec.multi!.item.id, rec.multi!.qty, e.currentTarget)}>
                ใส่ตะกร้า {rec.multi.qty} ตัว
              </button>
            </div>
          </div>
        ) : (
          <p className="psu-empty" data-psu-none>
            ยังไม่มีหม้อแปลง {power ? powerText(power) : ""} ที่พร้อมขายบนหน้าเว็บ —{" "}
            <a href="/contact" className="link-more">
              สอบถามทีมงาน
            </a>
          </p>
        )}
      </section>
    </div>
  );
}
