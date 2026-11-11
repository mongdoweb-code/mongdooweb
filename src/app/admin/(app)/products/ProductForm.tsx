"use client";
// ฟอร์มเพิ่ม/แก้ไขสินค้า: ข้อมูลหลัก ราคา สต็อก รูป (เรียงลำดับ/ลบ/อัปโหลดหลายรูป) สเปก คำอธิบาย ตัวช่วยเลือกไฟ SEO
import Link from "next/link";
import { useState } from "react";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { RichEditor } from "../../_components/RichEditor";
import { useFormAction } from "../../_components/useFormAction";
import type { SpecDef } from "@/lib/specs";
import { cleanProductSlug, PRODUCT_SLUG_MAX, slugFromName } from "@/lib/slug";
import { deleteProduct, duplicateProduct, saveProduct, type ProductFormState } from "./actions";
import { SaleTierFields, SpecFields, type ExtrasValues } from "./ProductExtras";
import { ProductMedia, type VideoValue } from "./ProductMedia";
import { SectionNav, type NavSection } from "../../_components/SectionNav";
import { SaveResultPopup } from "../../_components/SaveResultPopup";

/** เมนูด่วนด้านบนฟอร์ม — ลำดับตามที่ใช้บ่อย (ส่วนที่ไม่มีในหน้าถูกซ่อนเอง) */
const SECTIONS: NavSection[] = [
  { id: "sec-info", label: "ข้อมูลสินค้า" },
  { id: "productMedia", label: "รูปสินค้า" },
  { id: "sec-price", label: "ราคาและการขาย" },
  { id: "sec-seo", label: "SEO และการค้นหา" },
  { id: "sec-finder", label: "ตัวช่วยเลือกไฟ (หน้าแรก)" },
  { id: "sec-specs", label: "สเปกสินค้า" },
  { id: "specBox", label: "สเปกตามหมวด" },
  { id: "sec-desc", label: "คำอธิบาย" },
  { id: "downloadsBox", label: "ไฟล์ดาวน์โหลด" },
  { id: "sec-dup", label: "ทำสำเนาสินค้า" },
  { id: "saleBox", label: "ลดราคาตามช่วงเวลา" },
  { id: "tierBox", label: "ราคาขายส่ง" },
  { id: "variantBox", label: "กลุ่มตัวเลือก" },
];

export type ProductValues = {
  id: string; name: string; slug: string; sku: string; categoryId: string; unit: string;
  price: string; compareAt: string; trackStock: boolean; stock: number; inStock: boolean;
  isActive: boolean; isBestSeller: boolean; badge: string; shortDescription: string; description: string;
  keywords: string; seoTitle: string; seoDescription: string; weightGram: string;
  specs: { label: string; value: string }[]; images: { key: string; url: string }[]; video: VideoValue | null;
  useAreas: string[]; lightColor: string; includesPsu: boolean; isAccessory: boolean;
  orders: number;
  /** ล็อต 9: ราคาลดตามเวลา ราคาขายส่ง สเปกตามหมวด กลุ่มตัวเลือก */
  extras: ExtrasValues;
};

const USE = [["POOL", "สระว่ายน้ำ"], ["POND", "บ่อปลา/บ่อน้ำ"], ["FOUNTAIN", "น้ำพุ"], ["GARDEN", "สวน"]];

export function ProductForm({ v, categories, saved, copied, owner, siteHost, shortText, specDefs, children }: {
  v: ProductValues; categories: { id: string; name: string }[]; saved: boolean; copied?: boolean; owner?: boolean; siteHost?: string; shortText?: string;
  specDefs: SpecDef[]; children?: React.ReactNode;
}) {
  const [state, onSubmit, pending] = useFormAction<ProductFormState>(saveProduct, saved ? { ok: "เพิ่มสินค้าแล้ว" } : copied ? { ok: "ทำสำเนาแล้ว — สำเนานี้ปิดขายอยู่ แก้ไขแล้วเปิดขายได้" } : {});
  const [name, setName] = useState(v.name);
  const [seoTitle, setSeoTitle] = useState(v.seoTitle);
  const [seoDesc, setSeoDesc] = useState(v.seoDescription);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [specs, setSpecs] = useState(v.specs.length ? v.specs : [{ label: "", value: "" }]);
  const [track, setTrack] = useState(v.trackStock);
  const [slug, setSlug] = useState(v.slug);
  const [slugTouched, setSlugTouched] = useState(!!v.id);
  const [cat, setCat] = useState(v.categoryId);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  const serpTitle = `${seoTitle || name || "ชื่อสินค้า"} — มองดูเว็บ`;
  const serpDesc = seoDesc || shortText || `${name} ราคาพิเศษ สั่งออนไลน์ได้ที่มองดูเว็บ`;

  return (
    <>
      <SectionNav
        sections={SECTIONS}
        watch={state.error ? `${state.error}|${state.fields?.join() ?? ""}` : undefined}
        action={
          <button className="btn btn-primary btn-sm" type="submit" form="productForm" disabled={pending || mediaBusy} title={mediaBusy ? "รอรูป/วิดีโออัปโหลดเสร็จก่อน" : "บันทึกสินค้า"}>
            {pending ? "กำลังบันทึก…" : mediaBusy ? "รออัปโหลด…" : "บันทึก"}
          </button>
        }
      />
      <SaveResultPopup
        result={state}
        viewHref={v.id && v.isActive ? `/product/${v.slug}` : undefined}
        onFix={() => {
          // โฟกัสช่องแรกที่ผิด (SectionNav เลื่อนไปส่วนนั้นให้แล้ว)
          const el = document.querySelector<HTMLElement>('#productForm [style*="--c-err"], #productForm .bad input, #productForm [aria-invalid="true"]');
          el?.focus({ preventScroll: false });
        }}
      />
      <form onSubmit={onSubmit} className="pform" id="productForm">
        <input type="hidden" name="id" value={v.id} />
        <input type="hidden" name="stock0" value={v.stock} />
        <input type="hidden" name="specs" value={JSON.stringify(specs)} />
        {state.error && <div className="login-err" role="alert">{state.error}</div>}
        {state.ok && <div className="login-info" role="status">{state.ok}{v.id && <> · <a href={`/product/${v.slug}`} target="_blank" rel="noopener">ดูหน้าสินค้า</a></>}</div>}

        <div className="pform-grid">
          <div className="d-col">
            <div className="box set-grid-inner" id="sec-info">
              <h3>ข้อมูลสินค้า</h3>
              <div className="field"><label htmlFor="name">ชื่อสินค้า</label>
                <input id="name" name="name" value={name} required maxLength={250} {...bad("name")} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugFromName(e.target.value)); }} /></div>
              <div className="two">
                <div className="field"><label htmlFor="sku">รหัสสินค้า (SKU)</label><input id="sku" name="sku" defaultValue={v.sku} required maxLength={60} {...bad("sku")} /></div>
                <div className="field"><label htmlFor="slug">ลิงก์สินค้า /product/…</label>
                  <div className="slug-row">
                    <input id="slug" name="slug" value={slug} required maxLength={PRODUCT_SLUG_MAX} {...bad("slug")} lang="th"
                      onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
                      onBlur={() => setSlug((x) => cleanProductSlug(x))} />
                    <button type="button" className="btn btn-outline btn-sm" id="slugFromName" disabled={!name.trim()}
                      data-tip="สร้างลิงก์ภาษาไทยจากชื่อสินค้า" onClick={() => { setSlug(slugFromName(name)); setSlugTouched(true); }}>สร้างจากชื่อ</button>
                  </div>
                  <small>ภาษาไทย อังกฤษตัวเล็ก ตัวเลข คั่นด้วย - (เว้นวรรคเปลี่ยนเป็น - ให้อัตโนมัติ) · เปลี่ยนแล้วลิงก์เดิมจะพามาหน้านี้อัตโนมัติ (301)</small></div>
              </div>
              <div className="two">
                <div className="field"><label htmlFor="categoryId">หมวดหมู่</label>
                  <select id="categoryId" name="categoryId" value={cat} onChange={(e) => setCat(e.target.value)} required {...bad("categoryId")}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div className="field"><label htmlFor="unit">หน่วย</label><input id="unit" name="unit" defaultValue={v.unit} maxLength={20} placeholder="ชิ้น / ชุด / ม้วน" /></div>
              </div>
            </div>

            <ProductMedia images={v.images} video={v.video} onBusy={setMediaBusy} invalid={{ images: state.fields?.includes("newImages"), video: state.fields?.includes("video") }} />

            <div className="box" id="sec-specs">
              <h3>สเปกสินค้า</h3>
              {specs.map((s, i) => (
                <div className="spec-row" key={i}>
                  <input aria-label="หัวข้อ" placeholder="หัวข้อ เช่น กำลังไฟ" value={s.label} onChange={(e) => setSpecs(specs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                  <input aria-label="ค่า" placeholder="ค่า เช่น 10W" value={s.value} onChange={(e) => setSpecs(specs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
                  <button type="button" className="link" onClick={() => setSpecs(specs.filter((_, k) => k !== i))}>ลบ</button>
                </div>
              ))}
              <div><button type="button" className="btn btn-outline btn-sm" onClick={() => setSpecs([...specs, { label: "", value: "" }])}>+ เพิ่มสเปก</button></div>
            </div>

            <SpecFields v={v.extras} defs={specDefs} categoryId={cat} fields={state.fields} />

            <div className="box" id="sec-desc">
              <h3>คำอธิบาย</h3>
              <div className="field">
                <span className="lbl">คำอธิบายย่อ (แสดงใต้ราคา)</span>
                <RichEditor name="shortDescription" defaultValue={v.shortDescription} label="คำอธิบายย่อ" minHeight={110} maxLength={5000} />
              </div>
              <div className="field">
                <span className="lbl">รายละเอียดสินค้า <span className="sub">พิมพ์และจัดรูปแบบได้เหมือนเอกสาร · ใส่ลิงก์ แนบรูป ตาราง · ปุ่ม &lt;/&gt; = แก้เป็น HTML</span></span>
                <RichEditor name="description" defaultValue={v.description} label="รายละเอียดสินค้า" minHeight={360} />
              </div>
            </div>
          </div>

          <div className="d-col">
            <div className="act" id="sec-price">
              <h3>ราคาและการขาย</h3>
              <div className="two">
                <div className="field"><label htmlFor="price">ราคาขาย (บาท)</label><input id="price" name="price" defaultValue={v.price} inputMode="decimal" {...bad("price")} /><small>0 หรือเว้นว่าง = &quot;สอบถามราคา&quot;</small></div>
                <div className="field"><label htmlFor="compareAt">ราคาปกติก่อนลด</label><input id="compareAt" name="compareAt" defaultValue={v.compareAt} inputMode="decimal" {...bad("compareAt")} /><small>เว้นว่าง = ไม่ลดราคา</small></div>
              </div>
              <label className="chk-row"><input type="checkbox" name="trackStock" checked={track} onChange={(e) => setTrack(e.target.checked)} /> นับสต็อก (ขายได้ไม่เกินจำนวนคงเหลือ)</label>
              {track ? (
                <div className="field"><label htmlFor="stock">คงเหลือ</label><input id="stock" name="stock" defaultValue={v.stock} inputMode="numeric" {...bad("stock")} /><small>ระบบตัดสต็อกให้อัตโนมัติเมื่ออนุมัติการชำระเงิน · แก้ตัวเลขที่นี่ = บันทึกในประวัติสต็อก{v.id ? <> · <a className="link" href={`/admin/stock/${v.id}`}>รับของเข้า/ดูประวัติ</a></> : null}</small></div>
              ) : (
                <label className="chk-row"><input type="checkbox" name="inStock" defaultChecked={v.inStock} /> มีสินค้าพร้อมขาย</label>
              )}
              <label className="chk-row"><input type="checkbox" name="isActive" defaultChecked={v.isActive} /> เปิดขายบนหน้าร้าน</label>
              <label className="chk-row"><input type="checkbox" name="isBestSeller" defaultChecked={v.isBestSeller} /> แสดงใน &quot;สินค้าขายดี&quot; หน้าแรก</label>
              <div className="field"><label htmlFor="badge">ป้ายบนการ์ด</label><input id="badge" name="badge" defaultValue={v.badge} maxLength={20} placeholder="เช่น ขายดี, แนะนำ, ใหม่" /></div>
              <div className="act-row">
                <button className="btn btn-primary" type="submit" disabled={pending || mediaBusy} title={mediaBusy ? "รอรูป/วิดีโออัปโหลดเสร็จก่อน" : undefined}>{pending ? "กำลังบันทึก…" : mediaBusy ? "กำลังอัปโหลดไฟล์…" : "บันทึกสินค้า"}</button>
                <Link className="btn btn-outline" href="/admin/products">กลับ</Link>
              </div>
            </div>

            <SaleTierFields v={v.extras} fields={state.fields} />
            {v.extras.group && (
              <div className="box" id="variantBox">
                <h3>กลุ่มตัวเลือกสินค้า</h3>
                <p>
                  อยู่ในกลุ่ม <b>{v.extras.group.name}</b>
                  {v.extras.group.options ? ` · ตัวนี้: ${v.extras.group.options}` : ""}
                </p>
                <div><Link className="btn btn-outline btn-sm" href={`/admin/products/variants/${v.extras.group.id}`}>จัดการกลุ่มตัวเลือก</Link></div>
              </div>
            )}

            <div className="box" id="sec-finder">
              <h3>ตัวช่วยเลือกไฟ (หน้าแรก)</h3>
              <span className="lbl" style={{ fontSize: 13, fontWeight: 600, color: "var(--c-muted)" }}>เหมาะกับพื้นที่</span>
              <div className="chk-wrap">
                {USE.map(([k, l]) => <label key={k} className="chk-row"><input type="checkbox" name="useAreas" value={k} defaultChecked={v.useAreas.includes(k)} /> {l}</label>)}
              </div>
              <div className="field"><label htmlFor="lightColor">สีแสง</label>
                <select id="lightColor" name="lightColor" defaultValue={v.lightColor}><option value="WHITE">แสงขาว/วอร์ม</option><option value="RGB">RGB เปลี่ยนสี</option><option value="ANY">ไม่ระบุ</option></select></div>
              <label className="chk-row"><input type="checkbox" name="includesPsu" defaultChecked={v.includesPsu} /> ชุดพร้อมใช้ (มีหม้อแปลงในกล่อง)</label>
              <label className="chk-row"><input type="checkbox" name="isAccessory" defaultChecked={v.isAccessory} /> เป็นอุปกรณ์เสริม</label>
            </div>

            <div className="box" id="sec-seo">
              <h3>SEO และการค้นหา</h3>
              <div className="field"><label htmlFor="seoTitle">หัวข้อบน Google <span className={`seo-meter${serpTitle.length > 60 ? " warn" : ""}`}>{serpTitle.length}/60</span></label><input id="seoTitle" name="seoTitle" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={120} placeholder={name} /><small>เว้นว่าง = ใช้ชื่อสินค้า</small></div>
              <div className="field"><label htmlFor="seoDescription">คำอธิบายบน Google <span className={`seo-meter${serpDesc.length > 160 ? " warn" : ""}`}>{serpDesc.length}/160</span></label><textarea id="seoDescription" name="seoDescription" value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} maxLength={300} rows={3} /><small>เว้นว่าง = ใช้คำอธิบายย่อ</small></div>
              <div className="field">
                <span className="lbl">ตัวอย่างผลการค้นหา Google</span>
                <div className="seo-prev" id="seoPreview" aria-label="ตัวอย่างผลการค้นหา">
                  <div className="u"><i aria-hidden="true" />{siteHost ?? "www.mongdooweb.com"} › product › {slug || "…"}</div>
                  <div className="t">{serpTitle}</div>
                  <div className="d">{serpDesc}</div>
                </div>
                {(serpTitle.length > 60 || serpDesc.length > 160) && <small className="seo-meter warn">ยาวเกิน — Google อาจตัดข้อความด้วย &quot;…&quot;</small>}
              </div>
              <div className="field"><label htmlFor="keywords">คำค้นเพิ่มเติม (คั่นด้วย ,)</label><textarea id="keywords" name="keywords" defaultValue={v.keywords} rows={2} maxLength={2000} /></div>
              <div className="field"><label htmlFor="weightGram">น้ำหนัก (กรัม)</label><input id="weightGram" name="weightGram" defaultValue={v.weightGram} inputMode="numeric" {...bad("weightGram")} /></div>
            </div>
          </div>
        </div>
      </form>
      {/* ส่วนท้ายฟอร์ม: ไฟล์ดาวน์โหลด (เต็มกว้าง) · ทำสำเนา + ลบสินค้า (คู่กัน ขนาดเท่ากัน) */}
      <div className="pform-tail">
        {children}
        {v.id && (
          <div className="pform-acts">
            <form action={duplicateProduct} className="box pa-card" id="sec-dup">
              <input type="hidden" name="id" value={v.id} />
              <div className="pa-head">
                <span className="pa-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></span>
                <h3>ทำสำเนาสินค้า</h3>
              </div>
              <p className="sub">สร้างสินค้าใหม่จากข้อมูลนี้ (ชื่อ ราคา รูป สเปก คำอธิบาย) — สำเนาจะปิดขายไว้ก่อนและสต็อกเป็น 0 แก้แล้วค่อยเปิดขาย</p>
              <div className="pa-btn"><button className="btn btn-outline" type="submit" id="dupBtn">ทำสำเนา</button></div>
            </form>
            <form action={deleteProduct} className="box pa-card pa-danger" id="sec-del">
              <input type="hidden" name="id" value={v.id} />
              <div className="pa-head">
                <span className="pa-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg></span>
                <h3>{v.orders ? "ปิดขายสินค้า" : "ลบสินค้า"}</h3>
              </div>
              <p className="sub">{!owner ? "ลบ/ปิดขายได้เฉพาะเจ้าของร้าน" : v.orders ? `สินค้านี้อยู่ในคำสั่งซื้อ/เอกสาร ${v.orders} รายการ — ระบบจะปิดขายแทนการลบ เพื่อเก็บประวัติไว้` : "ลบถาวร กู้คืนไม่ได้ — ถ้าแค่ไม่อยากให้ขาย ให้ปิด \"เปิดขายบนหน้าร้าน\" แทน"}</p>
              <div className="pa-btn">
                {owner ? (
                  <ConfirmSubmit className="btn btn-danger" title={v.orders ? "ปิดขายสินค้านี้?" : "ลบสินค้านี้?"} body={`${v.name} — ${v.orders ? "จะถูกปิดขาย (ประวัติยังอยู่)" : "จะถูกลบถาวร"}`} confirmLabel="ยืนยันลบ">{v.orders ? "ปิดขายสินค้า" : "ลบสินค้า"}</ConfirmSubmit>
                ) : (
                  <button className="btn btn-danger" type="button" disabled>ลบสินค้า</button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
