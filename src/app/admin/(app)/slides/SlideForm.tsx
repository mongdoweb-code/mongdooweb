"use client";
// ตัวแก้ไขสไลด์: อัปโหลดรูป/URL, คลิกบนภาพเพื่อเลือกจุดโฟกัส, ตัวอย่างแบบเดียวกับหน้าแรก (เดสก์ท็อป + มือถือ)
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { saveSlide, type SlideState } from "./actions";

export type SlideValues = {
  id: string; imageSrc: string | null; imageUrl: string; focalX: number; focalY: number; alt: string; eyebrow: string; title: string;
  subtitle: string; cta1Label: string; cta1Href: string; cta2Label: string; cta2Href: string; align: string; overlay: number;
  startAt: string; endAt: string; credit: string; isActive: boolean; hasUpload: boolean;
};

const LIM = { eyebrow: 40, title: 60, subtitle: 140 };
const LINKS = [["#categories", "หมวดสินค้า (หน้าแรก)"], ["#finder", "ตัวช่วยเลือกไฟ"], ["#products", "สินค้าขายดี"], ["#contact", "ติดต่อเรา"], ["/products", "สินค้าทั้งหมด"]];

export function SlideForm({ v, saved, categories }: { v: SlideValues; saved: boolean; categories: { slug: string; name: string }[] }) {
  const [state, onSubmit, pending] = useFormAction<SlideState>(saveSlide, saved ? { ok: "เพิ่มสไลด์แล้ว" } : {});
  const [s, setS] = useState(v);
  const [file, setFile] = useState<string | null>(null);
  const set = <K extends keyof SlideValues>(k: K, val: SlideValues[K]) => setS((x) => ({ ...x, [k]: val }));
  const src = file ?? (s.imageUrl && /^https:\/\//.test(s.imageUrl) && !v.hasUpload ? s.imageUrl : s.imageSrc);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  const cnt = (k: keyof typeof LIM) => <span className={`cnt ${String(s[k]).length > LIM[k] ? "over" : ""}`}>{String(s[k]).length}/{LIM[k]}</span>;
  const linkOpts = (
    <datalist id="slideLinks">
      {LINKS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
      {categories.map((c) => <option key={c.slug} value={`/category/${c.slug}`}>{`หมวด: ${c.name}`}</option>)}
    </datalist>
  );
  const preview = (mobile: boolean) => (
    <div className={`sl-prev ${mobile ? "m" : ""} ${s.align === "CENTER" ? "c" : ""}`} style={{ ["--ov" as string]: Math.max(30, s.overlay) / 100 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" style={{ objectPosition: `${s.focalX}% ${s.focalY}%` }} /> : <div className="sl-fb" />}
      <div className="sl-shade" />
      <div className="sl-copy">
        {s.eyebrow && <small>{s.eyebrow}</small>}
        <b>{s.title || "หัวข้อสไลด์"}</b>
        {s.subtitle && <p>{s.subtitle}</p>}
        <div className="sl-ctas">{s.cta1Label && <span className="p">{s.cta1Label} →</span>}{s.cta2Label && <span className="o">{s.cta2Label}</span>}</div>
      </div>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="pform">
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="focalX" value={s.focalX} />
      <input type="hidden" name="focalY" value={s.focalY} />
      {linkOpts}
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="pform-grid">
        <div className="d-col">
          <div className="box">
            <h3>ตัวอย่าง (เดสก์ท็อป / มือถือ)</h3>
            <div className="sl-prevs">{preview(false)}{preview(true)}</div>
          </div>
          <div className="box">
            <h3>รูปภาพ <span className="sub">คลิกบนรูปเพื่อเลือกจุดที่ต้องการให้เห็นเสมอ (จุดโฟกัส)</span></h3>
            {src ? (
              <div className="focal" onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                set("focalX", Math.round(((e.clientX - r.left) / r.width) * 100));
                set("focalY", Math.round(((e.clientY - r.top) / r.height) * 100));
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="เลือกจุดโฟกัส" />
                <i style={{ left: `${s.focalX}%`, top: `${s.focalY}%` }} aria-hidden="true" />
              </div>
            ) : <div className="empty">ยังไม่มีรูป</div>}
            <small className="sub">จุดโฟกัส: {s.focalX}% , {s.focalY}%</small>
            <div className="two">
              <div className="field">
                <span className="lbl">อัปโหลดรูป</span>
                <label className="btn btn-outline btn-sm" htmlFor="image" style={{ width: "max-content" }}>เลือกรูปจากเครื่อง</label>
                <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" {...bad("image")} onChange={(e) => { const f = e.target.files?.[0]; setFile(f ? URL.createObjectURL(f) : null); }} />
                <small>แนวนอน กว้างอย่างน้อย 1920px · ไม่เกิน 10 MB</small>
              </div>
              <div className="field"><label htmlFor="imageUrl">หรือ URL รูป (https://)</label><input id="imageUrl" name="imageUrl" value={s.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://images.unsplash.com/..." {...bad("imageUrl")} /></div>
            </div>
            {v.hasUpload && <label className="chk-row"><input type="checkbox" name="clearImage" /> ลบรูปที่อัปโหลด (ใช้ URL แทน)</label>}
            <div className="field"><label htmlFor="alt">คำอธิบายรูป (สำหรับผู้พิการทางสายตา/SEO)</label><input id="alt" name="alt" value={s.alt} onChange={(e) => set("alt", e.target.value)} required maxLength={200} {...bad("alt")} /></div>
            <div className="field"><label htmlFor="credit">เครดิตภาพ (ถ้ามี)</label><input id="credit" name="credit" value={s.credit} onChange={(e) => set("credit", e.target.value)} maxLength={120} placeholder="เช่น Photo: ... / Unsplash" /></div>
          </div>
        </div>

        <div className="d-col">
          <div className="act">
            <h3>ข้อความ</h3>
            <div className="field"><label htmlFor="eyebrow">ข้อความเล็กด้านบน {cnt("eyebrow")}</label><input id="eyebrow" name="eyebrow" value={s.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} maxLength={60} /></div>
            <div className="field"><label htmlFor="title">หัวข้อ {cnt("title")}</label><input id="title" name="title" value={s.title} onChange={(e) => set("title", e.target.value)} required maxLength={120} {...bad("title")} /></div>
            <div className="field"><label htmlFor="subtitle">คำบรรยาย {cnt("subtitle")}</label><textarea id="subtitle" name="subtitle" value={s.subtitle} onChange={(e) => set("subtitle", e.target.value)} rows={3} maxLength={240} /></div>
            <div className="two">
              <div className="field"><label htmlFor="cta1Label">ปุ่มหลัก</label><input id="cta1Label" name="cta1Label" value={s.cta1Label} onChange={(e) => set("cta1Label", e.target.value)} required maxLength={40} {...bad("cta1Label")} /></div>
              <div className="field"><label htmlFor="cta1Href">ลิงก์ปุ่มหลัก</label><input id="cta1Href" name="cta1Href" list="slideLinks" value={s.cta1Href} onChange={(e) => set("cta1Href", e.target.value)} required {...bad("cta1Href")} /></div>
            </div>
            <div className="two">
              <div className="field"><label htmlFor="cta2Label">ปุ่มรอง (ไม่บังคับ)</label><input id="cta2Label" name="cta2Label" value={s.cta2Label} onChange={(e) => set("cta2Label", e.target.value)} maxLength={40} /></div>
              <div className="field"><label htmlFor="cta2Href">ลิงก์ปุ่มรอง</label><input id="cta2Href" name="cta2Href" list="slideLinks" value={s.cta2Href} onChange={(e) => set("cta2Href", e.target.value)} {...bad("cta2Href")} /></div>
            </div>
            <div className="two">
              <div className="field"><label htmlFor="align">ตำแหน่งข้อความ</label>
                <select id="align" name="align" value={s.align} onChange={(e) => set("align", e.target.value)}><option value="LEFT">ชิดซ้าย</option><option value="CENTER">กึ่งกลาง</option></select></div>
              <div className="field"><label htmlFor="overlay">ความเข้มเงาบนรูป {s.overlay}%</label><input id="overlay" name="overlay" type="range" min={30} max={90} value={s.overlay} onChange={(e) => set("overlay", Number(e.target.value))} /></div>
            </div>
          </div>
          <div className="box">
            <h3>การแสดงผล</h3>
            <label className="chk-row"><input type="checkbox" name="isActive" checked={s.isActive} onChange={(e) => set("isActive", e.target.checked)} /> แสดงบนหน้าแรก</label>
            <div className="two">
              <div className="field"><label htmlFor="startAt">เริ่มแสดง (ไม่บังคับ)</label><input id="startAt" name="startAt" type="datetime-local" value={s.startAt} onChange={(e) => set("startAt", e.target.value)} /></div>
              <div className="field"><label htmlFor="endAt">หยุดแสดง (ไม่บังคับ)</label><input id="endAt" name="endAt" type="datetime-local" value={s.endAt} onChange={(e) => set("endAt", e.target.value)} {...bad("endAt")} /></div>
            </div>
            <small className="sub">เหมาะกับโปรโมชันช่วงเวลา — หน้าแรกเปลี่ยนสไลด์ให้เองเมื่อถึงเวลา (เวลาไทย)</small>
            <div className="act-row">
              <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกสไลด์"}</button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
