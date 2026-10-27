"use client";
// ฟอร์มผลงานติดตั้ง: ชื่อ/ลิงก์ ประเภท สถานที่ สรุป รายละเอียด รูป (เรียง/ลบ/เพิ่ม) สินค้าที่ใช้ เผยแพร่
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import type { ContentFormState } from "../_lot10/content-shared";
import { saveProject } from "./actions";

export type ProjectValues = {
  id: string; title: string; slug: string; kind: string; location: string; summary: string; body: string;
  images: { key: string; url: string }[]; products: string; isPublished: boolean; sortOrder: number;
};

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const KINDS = ["สระว่ายน้ำ", "น้ำพุ", "บ่อปลา", "สวน", "อาคาร", "ร้านค้า/ร้านอาหาร", "โรงแรม/รีสอร์ท"];

export function ProjectEditor({ v, saved, kinds }: { v: ProjectValues; saved: boolean; kinds: string[] }) {
  const [state, onSubmit, pending] = useFormAction<ContentFormState>(saveProject, saved ? { ok: "เพิ่มผลงานแล้ว" } : {});
  const [slug, setSlug] = useState(v.slug);
  const [touched, setTouched] = useState(!!v.id);
  const [images, setImages] = useState(v.images);
  // หลังบันทึก server ส่งรายการรูปล่าสุดมา (รวมรูปที่เพิ่งอัปโหลด) → ใช้ชุดใหม่
  const sig = v.images.map((i) => i.key).join("|");
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setImages(v.images);
  }
  const bad = (k: string) => (state.fields?.includes(k) ? { "aria-invalid": true as const, style: { borderColor: "var(--c-err)" } } : {});
  const move = (i: number, d: number) => {
    const next = [...images];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
    setImages(next);
  };
  return (
    <form onSubmit={onSubmit} className="pform" id="projectForm">
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="images" value={JSON.stringify(images.map((i) => i.key))} />
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && (
        <div className="login-info" role="status">
          {state.ok}
          {v.id && v.isPublished && (
            <>
              {" · "}
              <a href={`/projects/${v.slug}`} target="_blank" rel="noopener">ดูหน้าผลงาน</a>
            </>
          )}
        </div>
      )}
      <div className="pform-grid">
        <div className="d-col">
          <div className="box">
            <h3>รายละเอียดงาน</h3>
            <div className="field">
              <label htmlFor="title">ชื่อผลงาน</label>
              <input id="title" name="title" defaultValue={v.title} required maxLength={200} {...bad("title")} onChange={(e) => { if (!touched) setSlug(slugify(e.target.value)); }} />
            </div>
            <div className="field">
              <label htmlFor="slug">ลิงก์ /projects/…</label>
              <input id="slug" name="slug" value={slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" title="a-z 0-9 และ - เท่านั้น" {...bad("slug")} onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }} />
              <small>เช่น pool-villa-hua-hin · เปลี่ยนภายหลังได้ ลิงก์เดิมจะ redirect ให้อัตโนมัติ</small>
            </div>
            <div className="two-col">
              <div className="field">
                <label htmlFor="kind">ประเภทงาน</label>
                <input id="kind" name="kind" defaultValue={v.kind} maxLength={60} list="kindList" placeholder="สระว่ายน้ำ" />
                <datalist id="kindList">
                  {[...new Set([...kinds, ...KINDS])].map((k) => <option key={k} value={k} />)}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="location">สถานที่</label>
                <input id="location" name="location" defaultValue={v.location} maxLength={120} placeholder="หัวหิน ประจวบคีรีขันธ์" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="summary">สรุปสั้น (แสดงบนการ์ด)</label>
              <textarea id="summary" name="summary" defaultValue={v.summary} maxLength={300} rows={2} />
            </div>
            <div className="field">
              <label htmlFor="body">รายละเอียด</label>
              <textarea id="body" name="body" defaultValue={v.body} rows={10} maxLength={50000} />
              <small className="l10-help"><code>## หัวข้อ</code> · <code>- รายการ</code> · <code>**ตัวหนา**</code> · <code>[ลิงก์](/product/...)</code></small>
            </div>
          </div>
          <div className="box">
            <h3>รูปงานจริง ({images.length}) <small className="sub">รูปแรก = รูปปก</small></h3>
            {images.length > 0 && (
              <div className="img-grid">
                {images.map((im, i) => (
                  <figure key={im.key}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก /media */}
                    <img src={im.url} alt={`รูปที่ ${i + 1}`} />
                    <figcaption>
                      <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`เลื่อนรูปที่ ${i + 1} ขึ้น`}>←</button>
                      <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label={`เลื่อนรูปที่ ${i + 1} ลง`}>→</button>
                      <button type="button" className="icon-btn del" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label={`ลบรูปที่ ${i + 1}`}>✕</button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="newImages">เพิ่มรูป (เลือกได้หลายรูป)</label>
              <input key={`n${state.n ?? 0}`} id="newImages" name="newImages" type="file" accept="image/jpeg,image/png,image/webp" multiple {...bad("newImages")} />
            </div>
          </div>
        </div>
        <div className="d-col">
          <div className="box">
            <h3>การแสดงผล</h3>
            <label className="switch-lbl">
              <input type="checkbox" name="isPublished" defaultChecked={v.isPublished} /> เผยแพร่บนหน้าเว็บ
            </label>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="sortOrder">ลำดับ (น้อย = แสดงก่อน)</label>
              <input id="sortOrder" name="sortOrder" type="number" defaultValue={v.sortOrder} min={-9999} max={9999} />
            </div>
          </div>
          <div className="box">
            <h3>สินค้าที่ใช้ในงานนี้</h3>
            <div className="field">
              <label htmlFor="products">รหัสสินค้า (SKU คั่นด้วย , หรือขึ้นบรรทัดใหม่)</label>
              <textarea id="products" name="products" defaultValue={v.products} rows={4} {...bad("products")} />
              <small>แสดงเป็นการ์ดสินค้าในหน้าผลงาน ลูกค้ากดใส่ตะกร้าได้เลย</small>
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending} id="saveProject">
            {pending ? "กำลังบันทึก…" : "บันทึกผลงาน"}
          </button>
        </div>
      </div>
    </form>
  );
}
