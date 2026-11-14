"use client";
// ฟอร์มหมวดหมู่ — ไอคอน: เลือกจากคลัง (ค้นหา/แบ่งกลุ่ม) หรืออัปโหลดเอง (PNG/JPG/WEBP/SVG) · ตัวอย่างแบบเมนูหน้าร้าน
import { useMemo, useState } from "react";
import type { CatIcon } from "@/lib/icons";
import { useFormAction } from "../../_components/useFormAction";
import { saveCategory, type CatState } from "./actions";

export type CatValues = {
  id: string; nameTh: string; nameEn: string; slug: string; legacySlug: string; icon: string; group: string;
  /** ไอคอนที่อัปโหลดเอง (ลิงก์รูป) — ว่าง = ใช้ไอคอนจากคลัง */
  iconUrl: string;
  popular: string; description: string; showOnHome: boolean; isActive: boolean;
  /** รูปหมวดที่อัปโหลดไว้ (ลิงก์รูปย่อ) · fallback = รูปสินค้าตัวแรกของหมวด (แสดงเป็นตัวอย่างเมื่อยังไม่อัปโหลด) */
  imageUrl: string; fallbackUrl: string;
};

export function CategoryForm({ v, icons }: { v: CatValues; icons: CatIcon[] }) {
  const [state, onSubmit, pending] = useFormAction<CatState>(saveCategory, {});
  const [icon, setIcon] = useState(v.icon);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"lib" | "upload">(v.iconUrl ? "upload" : "lib");
  const [iconPrev, setIconPrev] = useState<string | null>(null);
  const [clearIcon, setClearIcon] = useState(false);
  const [nameTh, setNameTh] = useState(v.nameTh);
  const [nameEn, setNameEn] = useState(v.nameEn);
  const shownIcon = iconPrev ?? (clearIcon ? null : v.iconUrl || null);
  const cur = icons.find((i) => i.key === icon) ?? icons.find((i) => i.key === "deco")!;
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? icons.filter((i) => i.label.toLowerCase().includes(t) || i.key.includes(t) || i.group.includes(t)) : icons;
    return [...new Set(list.map((i) => i.group))].map((g) => [g, list.filter((i) => i.group === g)] as const);
  }, [icons, q]);
  const [preview, setPreview] = useState<string | null>(null);
  const [clear, setClear] = useState(false);
  const shown = preview ?? (clear ? null : v.imageUrl || null);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  return (
    <form className="box cat-form" onSubmit={onSubmit}>
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="icon" value={icon} />
      <h3>{v.id ? `แก้ไขหมวด: ${v.nameTh}` : "เพิ่มหมวดใหม่"}</h3>
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="two">
        <div className="field"><label htmlFor="nameTh">ชื่อหมวด (ไทย)</label><input id="nameTh" name="nameTh" value={nameTh} onChange={(e) => setNameTh(e.target.value)} required maxLength={80} {...bad("nameTh")} /></div>
        <div className="field"><label htmlFor="nameEn">ชื่อหมวด (อังกฤษ)</label><input id="nameEn" name="nameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required maxLength={80} {...bad("nameEn")} /></div>
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
      <div className="field ip-field" id="catIcon">
        <span className="lbl">ไอคอน (แสดงในเมนูหมวด เมนูมือถือ และการ์ดหมวดที่ยังไม่มีรูป)</span>
        <div className="ip-head">
          {/* ตัวอย่างแบบเมนูหมวดหน้าร้าน */}
          <div className="ip-preview" aria-label="ตัวอย่างในเมนูหน้าร้าน">
            <span className="ip-mi">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {shownIcon ? <img src={shownIcon} alt="" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: cur.path }} />}
            </span>
            <span><b>{nameTh || "ชื่อหมวด"}</b><small>{nameEn || "Category"}</small></span>
            <em>{shownIcon ? "ไอคอนที่อัปโหลด" : cur.label}</em>
          </div>
          <div className="ip-tabs" role="tablist" aria-label="แหล่งไอคอน">
            <button type="button" role="tab" aria-selected={tab === "lib"} onClick={() => setTab("lib")}>คลังไอคอน <span>{icons.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === "upload"} onClick={() => setTab("upload")}>อัปโหลดเอง{shownIcon ? <span>✓</span> : null}</button>
          </div>
        </div>
        <div className="ip-body" hidden={tab !== "lib"}>
          <input className="ip-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาไอคอน เช่น โคม, หลอด, น้ำพุ, สาย" aria-label="ค้นหาไอคอน" />
          {shownIcon && <p className="ip-note">ตอนนี้ใช้ไอคอนที่อัปโหลด — เลือกไอคอนจากคลังได้ แต่จะใช้แทนเมื่อเอาไอคอนที่อัปโหลดออก</p>}
          <div className="icon-pick ip-grid" role="radiogroup" aria-label="ไอคอนจากคลัง">
            {groups.map(([g, list]) => (
              <div key={g} className="ip-grp" role="group" aria-label={g}>
                <span className="ip-gl">{g}</span>
                <div className="ip-items">
                  {list.map((i) => (
                    <button key={i.key} type="button" role="radio" aria-checked={icon === i.key} aria-label={i.label} title={i.label} onClick={() => setIcon(i.key)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: i.path }} />
                      <span>{i.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!groups.length && <p className="ip-none">ไม่พบไอคอน “{q}” — ลองคำอื่น หรืออัปโหลดไอคอนเอง</p>}
          </div>
        </div>
        <div className="ip-body ip-up" hidden={tab !== "upload"}>
          <span className="ip-up-prev">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shownIcon ? <img src={shownIcon} alt="ไอคอนที่อัปโหลด" /> : <span aria-hidden="true">+</span>}
          </span>
          <div className="cat-img-ctl">
            <label className="btn btn-outline btn-sm" htmlFor="catIconFile">{shownIcon ? "เปลี่ยนไอคอน" : "อัปโหลดไอคอน"}</label>
            <input
              id="catIconFile" name="iconFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" className="sr-only" {...bad("iconFile")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                setIconPrev(f ? URL.createObjectURL(f) : null);
                if (f) setClearIcon(false);
              }}
            />
            {v.iconUrl && !iconPrev && (
              <label className="chk-row"><input type="checkbox" name="clearIcon" checked={clearIcon} onChange={(e) => setClearIcon(e.target.checked)} /> เอาไอคอนที่อัปโหลดออก (กลับไปใช้ไอคอนจากคลัง)</label>
            )}
            <small className="sub">
              {iconPrev ? "ไอคอนใหม่ — กด “บันทึกหมวด” เพื่อใช้" : "PNG, JPG, WEBP หรือ SVG ไม่เกิน 2 MB · แนะนำรูปสี่เหลี่ยมจัตุรัส พื้นโปร่งใส เส้นเรียบ (ระบบย่อเป็น 192×192 และแปลง SVG เป็นรูปให้อัตโนมัติ)"}
            </small>
          </div>
        </div>
      </div>
      <div className="field cat-img-field">
        <span className="lbl">รูปหมวด (แสดงในแถบ &quot;เลือกซื้อตามหมวดหมู่&quot; และการ์ดหมวดหน้าแรก)</span>
        <div className="cat-img-row">
          <span className={`cat-img-prev${shown ? "" : " fallback"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shown ? <img src={shown} alt="" /> : v.fallbackUrl ? <img src={v.fallbackUrl} alt="" /> : <span aria-hidden="true">?</span>}
          </span>
          <div className="cat-img-ctl">
            <label className="btn btn-outline btn-sm" htmlFor="catImage">{v.imageUrl || preview ? "เปลี่ยนรูป" : "อัปโหลดรูป"}</label>
            <input
              id="catImage" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" {...bad("image")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
                if (f) setClear(false);
              }}
            />
            {v.imageUrl && !preview && (
              <label className="chk-row"><input type="checkbox" name="clearImage" checked={clear} onChange={(e) => setClear(e.target.checked)} /> เอารูปหมวดออก (กลับไปใช้รูปสินค้า)</label>
            )}
            <small className="sub">
              {preview ? "รูปใหม่ — กด “บันทึกหมวด” เพื่อใช้รูปนี้" : shown ? "รูปที่อัปโหลดไว้" : "ยังไม่ได้อัปโหลด — ตอนนี้ใช้รูปสินค้าตัวแรกของหมวด"} · JPG, PNG, WEBP ไม่เกิน 10 MB · แนะนำรูปสี่เหลี่ยมจัตุรัส พื้นขาวหรือโปร่งใส
            </small>
          </div>
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
