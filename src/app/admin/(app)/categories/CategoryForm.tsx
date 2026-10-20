"use client";
// ฟอร์มหมวดหมู่ — เลือกไอคอนจากชุดไอคอนของหน้าร้าน
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { saveCategory, type CatState } from "./actions";

export type CatValues = {
  id: string; nameTh: string; nameEn: string; slug: string; legacySlug: string; icon: string; group: string;
  popular: string; description: string; showOnHome: boolean; isActive: boolean;
};

export function CategoryForm({ v, icons }: { v: CatValues; icons: Record<string, string> }) {
  const [state, onSubmit, pending] = useFormAction<CatState>(saveCategory, {});
  const [icon, setIcon] = useState(v.icon);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  return (
    <form className="box cat-form" onSubmit={onSubmit}>
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="icon" value={icon} />
      <h3>{v.id ? `แก้ไขหมวด: ${v.nameTh}` : "เพิ่มหมวดใหม่"}</h3>
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="two">
        <div className="field"><label htmlFor="nameTh">ชื่อหมวด (ไทย)</label><input id="nameTh" name="nameTh" defaultValue={v.nameTh} required maxLength={80} {...bad("nameTh")} /></div>
        <div className="field"><label htmlFor="nameEn">ชื่อหมวด (อังกฤษ)</label><input id="nameEn" name="nameEn" defaultValue={v.nameEn} required maxLength={80} {...bad("nameEn")} /></div>
      </div>
      <div className="two">
        <div className="field"><label htmlFor="slug">ลิงก์หมวด /category/…</label><input id="slug" name="slug" defaultValue={v.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" {...bad("slug")} /></div>
        <div className="field">
          <label htmlFor="group">กลุ่มในเมนู</label>
          <select id="group" name="group" defaultValue={v.group}>
            <option value="WATER">งานน้ำ</option>
            <option value="OUTDOOR">สวนและภายนอก</option>
            <option value="BUILDING">อาคารและภายใน</option>
            <option value="DECO">อุปกรณ์และตกแต่ง</option>
          </select>
        </div>
      </div>
      <div className="field">
        <span className="lbl">ไอคอน</span>
        <div className="icon-pick" role="radiogroup" aria-label="ไอคอน">
          {Object.entries(icons).map(([k, path]) => (
            <button key={k} type="button" role="radio" aria-checked={icon === k} aria-label={k} onClick={() => setIcon(k)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: path }} />
            </button>
          ))}
        </div>
      </div>
      <div className="field"><label htmlFor="popular">รายการยอดนิยมใน dropdown (สูงสุด 4, คั่นด้วย ,)</label><input id="popular" name="popular" defaultValue={v.popular} placeholder="เช่น แสงขาว, RGB เปลี่ยนสี" /></div>
      <div className="field"><label htmlFor="description">คำอธิบายหมวด (แสดงหัวหน้าหมวด, ไม่บังคับ)</label><textarea id="description" name="description" defaultValue={v.description} rows={2} maxLength={2000} /></div>
      <div className="field"><label htmlFor="legacySlug">URL เดิมของเว็บเก่า (สำหรับ redirect 301)</label><input id="legacySlug" name="legacySlug" defaultValue={v.legacySlug} placeholder="วาง URL เดิม /product-category/... ได้เลย" {...bad("legacySlug")} /></div>
      <label className="chk-row"><input type="checkbox" name="isActive" defaultChecked={v.isActive} /> เปิดหน้าหมวดนี้ (ปิด = สินค้าในหมวดไม่แสดงบนหน้าร้าน)</label>
      <label className="chk-row"><input type="checkbox" name="showOnHome" defaultChecked={v.showOnHome} /> แสดงในเมนูหมวดและการ์ดหมวดของหน้าแรก</label>
      <div className="act-row" style={{ marginTop: 4 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกหมวด"}</button>
      </div>
    </form>
  );
}
