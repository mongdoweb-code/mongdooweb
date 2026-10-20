"use client";
// ฟอร์มเพิ่ม/แก้ไขสินค้า: ข้อมูลหลัก ราคา สต็อก รูป (เรียงลำดับ/ลบ/อัปโหลดหลายรูป) สเปก คำอธิบาย ตัวช่วยเลือกไฟ SEO
import Link from "next/link";
import { useState } from "react";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { useFormAction } from "../../_components/useFormAction";
import { deleteProduct, saveProduct, type ProductFormState } from "./actions";

export type ProductValues = {
  id: string; name: string; slug: string; sku: string; categoryId: string; unit: string;
  price: string; compareAt: string; trackStock: boolean; stock: number; inStock: boolean;
  isActive: boolean; isBestSeller: boolean; badge: string; shortDescription: string; description: string;
  keywords: string; seoTitle: string; seoDescription: string; weightGram: string;
  specs: { label: string; value: string }[]; images: { key: string; url: string }[];
  useAreas: string[]; lightColor: string; includesPsu: boolean; isAccessory: boolean;
  orders: number;
};

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const USE = [["POOL", "สระว่ายน้ำ"], ["POND", "บ่อปลา/บ่อน้ำ"], ["FOUNTAIN", "น้ำพุ"], ["GARDEN", "สวน"]];

export function ProductForm({ v, categories, saved }: { v: ProductValues; categories: { id: string; name: string }[]; saved: boolean }) {
  const [state, onSubmit, pending] = useFormAction<ProductFormState>(saveProduct, saved ? { ok: "เพิ่มสินค้าแล้ว" } : {});
  const [images, setImages] = useState(v.images);
  const [newFiles, setNewFiles] = useState<{ name: string; url: string }[]>([]);
  const [specs, setSpecs] = useState(v.specs.length ? v.specs : [{ label: "", value: "" }]);
  const [track, setTrack] = useState(v.trackStock);
  const [slug, setSlug] = useState(v.slug);
  const [slugTouched, setSlugTouched] = useState(!!v.id);
  const [preview, setPreview] = useState(false);
  const [desc, setDesc] = useState(v.description);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  const move = (i: number, d: number) => {
    const next = [...images];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
    setImages(next);
  };

  return (
    <>
      <form onSubmit={onSubmit} className="pform">
        <input type="hidden" name="id" value={v.id} />
        <input type="hidden" name="images" value={JSON.stringify(images.map((i) => i.key))} />
        <input type="hidden" name="specs" value={JSON.stringify(specs)} />
        {state.error && <div className="login-err" role="alert">{state.error}</div>}
        {state.ok && <div className="login-info" role="status">{state.ok}{v.id && <> · <a href={`/product/${v.slug}`} target="_blank" rel="noopener">ดูหน้าสินค้า</a></>}</div>}

        <div className="pform-grid">
          <div className="d-col">
            <div className="box set-grid-inner">
              <h3>ข้อมูลสินค้า</h3>
              <div className="field"><label htmlFor="name">ชื่อสินค้า</label>
                <input id="name" name="name" defaultValue={v.name} required maxLength={250} {...bad("name")} onChange={(e) => { if (!slugTouched) setSlug(slugify(e.target.value)); }} /></div>
              <div className="two">
                <div className="field"><label htmlFor="sku">รหัสสินค้า (SKU)</label><input id="sku" name="sku" defaultValue={v.sku} required maxLength={60} {...bad("sku")} /></div>
                <div className="field"><label htmlFor="slug">ลิงก์สินค้า /product/…</label>
                  <input id="slug" name="slug" value={slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" title="a-z 0-9 และ - เท่านั้น" {...bad("slug")} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} />
                  <small>ภาษาอังกฤษตัวเล็ก ตัวเลข และ - (เปลี่ยนแล้วลิงก์เดิมจะใช้ไม่ได้)</small></div>
              </div>
              <div className="two">
                <div className="field"><label htmlFor="categoryId">หมวดหมู่</label>
                  <select id="categoryId" name="categoryId" defaultValue={v.categoryId} required {...bad("categoryId")}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div className="field"><label htmlFor="unit">หน่วย</label><input id="unit" name="unit" defaultValue={v.unit} maxLength={20} placeholder="ชิ้น / ชุด / ม้วน" /></div>
              </div>
            </div>

            <div className="box">
              <h3>รูปสินค้า <span className="sub">รูปแรก = รูปหลัก</span></h3>
              <div className="img-grid" {...bad("newImages")}>
                {images.map((im, i) => (
                  <figure key={im.key}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt={`รูปที่ ${i + 1}`} />
                    <figcaption>
                      <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="เลื่อนขึ้น">←</button>
                      <button type="button" className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="เลื่อนลง">→</button>
                      <button type="button" className="icon-btn sm del" onClick={() => setImages(images.filter((_, k) => k !== i))} aria-label="ลบรูป">✕</button>
                    </figcaption>
                  </figure>
                ))}
                {newFiles.map((n) => (
                  <figure key={n.url} className="new">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={n.url} alt={n.name} />
                    <figcaption><span className="sub">ใหม่ — บันทึกเพื่ออัปโหลด</span></figcaption>
                  </figure>
                ))}
              </div>
              <label className="btn btn-outline btn-sm" htmlFor="newImages" style={{ width: "max-content" }}>+ เลือกรูป (ได้หลายรูป)</label>
              <input id="newImages" name="newImages" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only"
                onChange={(e) => setNewFiles([...(e.target.files ?? [])].map((f) => ({ name: f.name, url: URL.createObjectURL(f) })))} />
              <small className="sub">JPG/PNG/WEBP ไม่เกิน 10 MB ต่อรูป · ระบบย่อเป็น WebP ให้อัตโนมัติ</small>
            </div>

            <div className="box">
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

            <div className="box">
              <h3>คำอธิบาย</h3>
              <div className="field"><label htmlFor="shortDescription">คำอธิบายย่อ (แสดงใต้ราคา)</label><textarea id="shortDescription" name="shortDescription" defaultValue={v.shortDescription} rows={3} maxLength={5000} /></div>
              <div className="field">
                <label htmlFor="description">รายละเอียดสินค้า <span className="sub">รองรับ HTML พื้นฐาน เช่น &lt;h2&gt; &lt;p&gt; &lt;ul&gt; &lt;img&gt; &lt;table&gt;</span></label>
                <div className="seg" role="group" style={{ width: "max-content" }}>
                  <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>แก้ไข</button>
                  <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>ตัวอย่าง</button>
                </div>
                <textarea id="description" name="description" value={desc} onChange={(e) => setDesc(e.target.value)} rows={14} hidden={preview} style={{ fontFamily: "ui-monospace,monospace", fontSize: 13 }} />
                {/* ตัวอย่างแสดงในกล่องแยก — ระบบล้าง HTML อันตรายอีกครั้งตอนบันทึก */}
                {preview && <iframe className="desc-preview" sandbox="" title="ตัวอย่างคำอธิบาย" srcDoc={`<meta charset="utf-8"><style>body{font-family:sans-serif;font-size:15px;line-height:1.6;padding:12px}img{max-width:100%;height:auto}</style>${desc}`} />}
              </div>
            </div>
          </div>

          <div className="d-col">
            <div className="act">
              <h3>ราคาและการขาย</h3>
              <div className="two">
                <div className="field"><label htmlFor="price">ราคาขาย (บาท)</label><input id="price" name="price" defaultValue={v.price} inputMode="decimal" {...bad("price")} /><small>0 หรือเว้นว่าง = &quot;สอบถามราคา&quot;</small></div>
                <div className="field"><label htmlFor="compareAt">ราคาปกติก่อนลด</label><input id="compareAt" name="compareAt" defaultValue={v.compareAt} inputMode="decimal" {...bad("compareAt")} /><small>เว้นว่าง = ไม่ลดราคา</small></div>
              </div>
              <label className="chk-row"><input type="checkbox" name="trackStock" checked={track} onChange={(e) => setTrack(e.target.checked)} /> นับสต็อก (ขายได้ไม่เกินจำนวนคงเหลือ)</label>
              {track ? (
                <div className="field"><label htmlFor="stock">คงเหลือ</label><input id="stock" name="stock" defaultValue={v.stock} inputMode="numeric" {...bad("stock")} /><small>ระบบตัดสต็อกให้อัตโนมัติเมื่ออนุมัติการชำระเงิน</small></div>
              ) : (
                <label className="chk-row"><input type="checkbox" name="inStock" defaultChecked={v.inStock} /> มีสินค้าพร้อมขาย</label>
              )}
              <label className="chk-row"><input type="checkbox" name="isActive" defaultChecked={v.isActive} /> เปิดขายบนหน้าร้าน</label>
              <label className="chk-row"><input type="checkbox" name="isBestSeller" defaultChecked={v.isBestSeller} /> แสดงใน &quot;สินค้าขายดี&quot; หน้าแรก</label>
              <div className="field"><label htmlFor="badge">ป้ายบนการ์ด</label><input id="badge" name="badge" defaultValue={v.badge} maxLength={20} placeholder="เช่น ขายดี, แนะนำ, ใหม่" /></div>
              <div className="act-row">
                <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกสินค้า"}</button>
                <Link className="btn btn-outline" href="/admin/products">กลับ</Link>
              </div>
            </div>

            <div className="box">
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

            <div className="box">
              <h3>SEO และการค้นหา</h3>
              <div className="field"><label htmlFor="seoTitle">หัวข้อบน Google <span className="sub">≤ 60 ตัวอักษร</span></label><input id="seoTitle" name="seoTitle" defaultValue={v.seoTitle} maxLength={120} /></div>
              <div className="field"><label htmlFor="seoDescription">คำอธิบายบน Google <span className="sub">≤ 160 ตัวอักษร</span></label><textarea id="seoDescription" name="seoDescription" defaultValue={v.seoDescription} maxLength={300} rows={3} /></div>
              <div className="field"><label htmlFor="keywords">คำค้นเพิ่มเติม (คั่นด้วย ,)</label><textarea id="keywords" name="keywords" defaultValue={v.keywords} rows={2} maxLength={2000} /></div>
              <div className="field"><label htmlFor="weightGram">น้ำหนัก (กรัม)</label><input id="weightGram" name="weightGram" defaultValue={v.weightGram} inputMode="numeric" {...bad("weightGram")} /></div>
            </div>
          </div>
        </div>
      </form>
      {v.id && (
        <form action={deleteProduct} className="box" style={{ marginTop: 16, maxWidth: 520 }}>
          <input type="hidden" name="id" value={v.id} />
          <h3>ลบสินค้า</h3>
          <p className="sub">{v.orders ? `สินค้านี้อยู่ในคำสั่งซื้อ/เอกสาร ${v.orders} รายการ ระบบจะปิดขายแทนการลบ เพื่อเก็บประวัติไว้` : "ลบถาวร กู้คืนไม่ได้"}</p>
          <div><ConfirmSubmit className="btn btn-danger" title="ลบสินค้านี้?" body={`${v.name} — ${v.orders ? "จะถูกปิดขาย" : "จะถูกลบถาวร"}`} confirmLabel="ยืนยันลบ">{v.orders ? "ปิดขายสินค้า" : "ลบสินค้า"}</ConfirmSubmit></div>
        </form>
      )}
    </>
  );
}
