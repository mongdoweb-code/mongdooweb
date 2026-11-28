"use client";
// ลายน้ำรูปภาพ (ตั้งค่าร้าน): อัปโหลดไฟล์ลายน้ำ (PNG พื้นใส) · ตำแหน่ง 9 จุด/เรียงซ้ำ · ขนาด · ความทึบ · ระยะขอบ · ใช้กับรูปสินค้าหลักด้วย
// ลายน้ำถูกใส่ลงในไฟล์ที่ลูกค้าเห็น (/media/wm/…) — เปลี่ยนค่าแล้วรูปสร้างใหม่อัตโนมัติ ไฟล์ต้นฉบับไม่เปลี่ยน
// ตัวอย่างด้านขวาวางลายน้ำด้วย CSS ตามสัดส่วนเดียวกับไฟล์จริง
import { useState } from "react";
import { WM_LIMITS, WM_POSITIONS, WM_POS_LABEL, wmPreviewStyle, type Watermark, type WmPos } from "@/lib/watermark";

export function WatermarkField({ init, url }: { init: Watermark; url: string | null }) {
  const [w, setW] = useState(init);
  const [img, setImg] = useState<string | null>(url);
  const [remove, setRemove] = useState(false);
  const set = <K extends keyof Watermark>(k: K, v: Watermark[K]) => setW((x) => ({ ...x, [k]: v }));
  const shown = remove ? null : img;
  return (
    <fieldset className="set-sign wmf" id="watermark">
      <legend>ลายน้ำรูปภาพ</legend>
      <input type="hidden" name="watermark" value={JSON.stringify({ pos: w.pos, size: w.size, opacity: w.opacity, margin: w.margin, main: w.main, cards: w.cards })} />
      <p className="wmf-hint">ใส่ลายน้ำ (เช่น โลโก้ร้าน) บนรูปประกอบใต้ Data Sheet ของสินค้า (เปิด/ปิดได้ต่อสินค้า) และเลือกใช้กับรูปสินค้าหลักในหน้ารายละเอียดได้ · ใช้ไฟล์ PNG พื้นใส · ลายน้ำใส่ลงในไฟล์ที่ลูกค้าเห็น รูปต้นฉบับไม่เปลี่ยน</p>
      <div className="wmf-cols">
        <div className="wmf-ctl">
          <div className="field">
            <label htmlFor="watermarkFile">ไฟล์ลายน้ำ</label>
            <input id="watermarkFile" name="watermarkFile" type="file" accept="image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImg(URL.createObjectURL(f)); setRemove(false); } }} />
            {url && <label className="chk-row"><input type="checkbox" name="removeWatermark" checked={remove} onChange={(e) => setRemove(e.target.checked)} /> ลบลายน้ำ (ไม่ใส่ลายน้ำทุกรูป)</label>}
          </div>
          <div className="wmf-row">
            <span className="lbl">ตำแหน่ง</span>
            <span className="wmf-pos" role="radiogroup" aria-label="ตำแหน่งลายน้ำ">
              {WM_POSITIONS.filter((p) => p !== "tile").map((p) => (
                <button key={p} type="button" role="radio" aria-checked={w.pos === p} aria-label={WM_POS_LABEL[p]} title={WM_POS_LABEL[p]} className={w.pos === p ? "on" : undefined} onClick={() => set("pos", p as WmPos)}><i /></button>
              ))}
            </span>
            <button type="button" className={`wmf-tile${w.pos === "tile" ? " on" : ""}`} aria-pressed={w.pos === "tile"} onClick={() => set("pos", "tile")}>เรียงซ้ำทั้งภาพ</button>
          </div>
          <Range id="wmSize" label="ขนาด (% ของความกว้างรูป)" value={w.size} lim={WM_LIMITS.size} onChange={(v) => set("size", v)} />
          <Range id="wmOpacity" label="ความทึบ (%)" value={w.opacity} lim={WM_LIMITS.opacity} onChange={(v) => set("opacity", v)} />
          <Range id="wmMargin" label="ระยะจากขอบ (%)" value={w.margin} lim={WM_LIMITS.margin} onChange={(v) => set("margin", v)} disabled={w.pos === "tile" || w.pos === "mc"} />
          <label className="chk-row"><input type="checkbox" checked={w.main} onChange={(e) => set("main", e.target.checked)} /> ใส่ลายน้ำบนรูปสินค้าหลักในหน้ารายละเอียดสินค้าด้วย</label>
          <label className="chk-row"><input type="checkbox" checked={w.cards} onChange={(e) => set("cards", e.target.checked)} data-wm-cards /> ใส่ลายน้ำบนรูปการ์ดสินค้า (หน้าแรก / สินค้าทั้งหมด / หมวด / ค้นหา)</label>
        </div>
        <div className="wmf-pv" aria-label="ตัวอย่างลายน้ำ">
          <div className="wmf-photo">
            {shown && (w.pos === "tile"
              ? <div className="wmf-tilebg" style={{ backgroundImage: `url("${shown}")`, backgroundSize: `${w.size}% auto`, opacity: w.opacity / 100 }} />
              // eslint-disable-next-line @next/next/no-img-element -- ตัวอย่างไฟล์ที่เลือก
              : <img src={shown} alt="" style={wmPreviewStyle(w) as React.CSSProperties} />)}
            {!shown && <span className="wmf-none">ยังไม่มีไฟล์ลายน้ำ</span>}
          </div>
          <small>ตัวอย่างบนรูปขนาด 4:3 · ไฟล์จริงใส่ตามสัดส่วนเดียวกัน</small>
        </div>
      </div>
    </fieldset>
  );
}

function Range({ id, label, value, lim, onChange, disabled }: { id: string; label: string; value: number; lim: readonly [number, number]; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="wmf-sl">
      <div className="wmf-sl-h"><label htmlFor={id}>{label}</label><output htmlFor={id}>{value}</output></div>
      <input id={id} type="range" min={lim[0]} max={lim[1]} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} style={{ "--p": `${((value - lim[0]) / (lim[1] - lim[0])) * 100}%` } as React.CSSProperties} />
    </div>
  );
}
