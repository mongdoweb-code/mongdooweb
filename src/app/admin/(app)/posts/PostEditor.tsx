"use client";
// ฟอร์มบทความ: หัวข้อ/ลิงก์ เนื้อหา (รูปแบบเดียวกับหน้าเนื้อหา + บรรทัดรูป) รูปปก สถานะ/ตั้งเวลา SEO แท็ก สินค้าที่เกี่ยวข้อง URL เดิม
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import type { ContentFormState } from "../_lot10/content-shared";
import { savePost } from "./actions";

export type PostValues = {
  id: string; title: string; slug: string; excerpt: string; body: string; cover: string | null; seoTitle: string; seoDescription: string;
  status: "DRAFT" | "PUBLISHED"; publishAt: string; tags: string; products: string; wpId: string; legacyPath: string; authorName: string;
};

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export function PostEditor({ v, saved }: { v: PostValues; saved: boolean }) {
  const [state, onSubmit, pending] = useFormAction<ContentFormState>(savePost, saved ? { ok: "เพิ่มบทความแล้ว" } : {});
  const [title, setTitle] = useState(v.title);
  const [slug, setSlug] = useState(v.slug);
  const [touched, setTouched] = useState(!!v.id);
  const [status, setStatus] = useState(v.status);
  const [seoTitle, setSeoTitle] = useState(v.seoTitle);
  const [seoDesc, setSeoDesc] = useState(v.seoDescription);
  const bad = (k: string) => (state.fields?.includes(k) ? { "aria-invalid": true as const, style: { borderColor: "var(--c-err)" } } : {});
  return (
    <form onSubmit={onSubmit} className="pform" id="postForm">
      <input type="hidden" name="id" value={v.id} />
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && (
        <div className="login-info" role="status">
          {state.ok}
          {v.id && status === "PUBLISHED" && (
            <>
              {" · "}
              <a href={`/blog/${v.slug}`} target="_blank" rel="noopener">ดูบทความ</a>
            </>
          )}
        </div>
      )}
      <div className="pform-grid">
        <div className="d-col">
          <div className="box">
            <h3>เนื้อหา</h3>
            <div className="field">
              <label htmlFor="title">หัวข้อบทความ</label>
              <input id="title" name="title" value={title} required maxLength={200} {...bad("title")} onChange={(e) => { setTitle(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} />
            </div>
            <div className="field">
              <label htmlFor="slug">ลิงก์ /blog/…</label>
              <input id="slug" name="slug" value={slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" title="a-z 0-9 และ - เท่านั้น" {...bad("slug")} onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }} />
              <small>ภาษาอังกฤษตัวเล็ก ตัวเลข และ - เช่น how-to-choose-pool-light · เปลี่ยนภายหลังได้ ลิงก์เดิมจะ redirect ให้อัตโนมัติ</small>
            </div>
            <div className="field">
              <label htmlFor="excerpt">คำโปรย (แสดงในหน้ารวมบทความ)</label>
              <textarea id="excerpt" name="excerpt" defaultValue={v.excerpt} maxLength={300} rows={2} />
            </div>
            <div className="field">
              <label htmlFor="body">เนื้อหา</label>
              <textarea key={`b${state.n ?? 0}`} id="body" name="body" defaultValue={state.body ?? v.body} rows={18} maxLength={100000} {...bad("body")} />
              <small className="l10-help">
                <code>## หัวข้อ</code> · <code>- รายการ</code> · <code>**ตัวหนา**</code> · <code>[ข้อความลิงก์](/product/...)</code> · รูป: <code>![คำบรรยาย](/media/posts/...)</code> (อัปโหลดด้านล่างแล้วระบบต่อท้ายให้)
              </small>
            </div>
            <div className="field">
              <label htmlFor="bodyImages">เพิ่มรูปในเนื้อหา (ต่อท้ายบทความ ย้ายตำแหน่งได้ในช่องเนื้อหา)</label>
              <input key={`i${state.n ?? 0}`} id="bodyImages" name="bodyImages" type="file" accept="image/jpeg,image/png,image/webp" multiple {...bad("bodyImages")} />
            </div>
          </div>
          <div className="box">
            <h3>SEO (Google)</h3>
            <div className="field">
              <label htmlFor="seoTitle">หัวข้อบน Google <span className={`seo-meter${(seoTitle || title).length > 60 ? " warn" : ""}`}>{(seoTitle || title).length}/60</span></label>
              <input id="seoTitle" name="seoTitle" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={120} placeholder={title} />
              <small>เว้นว่าง = ใช้หัวข้อบทความ</small>
            </div>
            <div className="field">
              <label htmlFor="seoDescription">คำอธิบายบน Google <span className={`seo-meter${seoDesc.length > 160 ? " warn" : ""}`}>{seoDesc.length}/160</span></label>
              <textarea id="seoDescription" name="seoDescription" value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} maxLength={300} rows={3} />
              <small>เว้นว่าง = ใช้คำโปรยหรือย่อหน้าแรก</small>
            </div>
          </div>
        </div>
        <div className="d-col">
          <div className="box">
            <h3>การเผยแพร่</h3>
            <div className="field">
              <label htmlFor="status">สถานะ</label>
              <select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as PostValues["status"])}>
                <option value="DRAFT">ร่าง (ยังไม่แสดง)</option>
                <option value="PUBLISHED">เผยแพร่ / ตั้งเวลา</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="publishAt">วันเวลาเผยแพร่ (เวลาไทย)</label>
              <input id="publishAt" name="publishAt" type="datetime-local" defaultValue={v.publishAt} {...bad("publishAt")} />
              <small>เว้นว่าง = เผยแพร่ทันที · ตั้งเวลาในอนาคต = ขึ้นหน้าเว็บเองเมื่อถึงเวลา</small>
            </div>
            <div className="field">
              <label htmlFor="authorName">ผู้เขียน (ไม่บังคับ)</label>
              <input id="authorName" name="authorName" defaultValue={v.authorName} maxLength={80} />
            </div>
          </div>
          <div className="box">
            <h3>รูปปก</h3>
            {v.cover && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก /media */}
                <img className="l10-cover" src={v.cover} alt="รูปปกปัจจุบัน" />
                <label className="switch-lbl">
                  <input key={`r${state.n ?? 0}`} type="checkbox" name="removeCover" /> ลบรูปปก
                </label>
              </>
            )}
            <div className="field">
              <label htmlFor="cover">{v.cover ? "เปลี่ยนรูปปก" : "อัปโหลดรูปปก"}</label>
              <input key={`c${state.n ?? 0}`} id="cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" {...bad("cover")} />
              <small>แนวนอน 1600×900 px ขึ้นไป ใช้เป็นรูปแชร์บน Facebook/LINE ด้วย</small>
            </div>
          </div>
          <div className="box">
            <h3>แท็กและสินค้าที่เกี่ยวข้อง</h3>
            <div className="field">
              <label htmlFor="tags">แท็ก (คั่นด้วย ,)</label>
              <input id="tags" name="tags" defaultValue={v.tags} maxLength={400} placeholder="ไฟสระว่ายน้ำ, วิธีติดตั้ง" />
            </div>
            <div className="field">
              <label htmlFor="products">รหัสสินค้าที่เกี่ยวข้อง (SKU คั่นด้วย , หรือขึ้นบรรทัดใหม่)</label>
              <textarea id="products" name="products" defaultValue={v.products} rows={3} {...bad("products")} />
            </div>
          </div>
          <div className="box">
            <h3>URL เดิมจาก WordPress</h3>
            <div className="field">
              <label htmlFor="legacyPath">URL เดิม (redirect 301 มาที่บทความนี้)</label>
              <input id="legacyPath" name="legacyPath" defaultValue={v.legacyPath} maxLength={300} placeholder="/2019/05/ชื่อบทความ/" {...bad("legacyPath")} />
            </div>
            <div className="field">
              <label htmlFor="wpId">ID บทความเดิม (?p=)</label>
              <input id="wpId" name="wpId" defaultValue={v.wpId} inputMode="numeric" maxLength={12} {...bad("wpId")} />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending} id="savePost">
            {pending ? "กำลังบันทึก…" : "บันทึกบทความ"}
          </button>
        </div>
      </div>
    </form>
  );
}
