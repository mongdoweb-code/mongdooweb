"use client";
// แผงแก้ไขด่วนของสินค้า (เปิดจาก "แก้ไขด่วน" ใต้ชื่อสินค้าในตาราง): ชื่อ รหัส หมวด ราคา สต็อก การขาย — บันทึกโดยไม่ต้องเปิดหน้าแก้ไข
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuickDrawer, useQuickOpen } from "../../_components/QuickDrawer";
import type { QuickResult } from "./quick-actions";

export type QuickProduct = {
  kind: "product"; id: string; name: string; sku: string; categoryId: string; price: string; compareAt: string;
  trackStock: boolean; stock: number; inStock: boolean; isActive: boolean; isBestSeller: boolean; badge: string; img: string | null; slug: string;
};

export function QuickEditProduct({ categories, action }: { categories: { id: string; name: string }[]; action: (f: FormData) => Promise<QuickResult & { fields?: string[] }> }) {
  const router = useRouter();
  const [p, setP] = useState<QuickProduct | null>(null);
  const [track, setTrack] = useState(false);
  const [res, setRes] = useState<QuickResult & { fields?: string[] }>({});
  const [toast, setToast] = useState("");
  const [pending, start] = useTransition();
  useQuickOpen<QuickProduct>("product", (d) => {
    setP(d);
    setTrack(d.trackStock);
    setRes({});
  });
  const close = useCallback(() => setP(null), []);
  const bad = (k: string) => (res.fields?.includes(k) ? " bad" : "");

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await action(fd);
      setRes(r);
      if (r.ok) {
        setToast(`✓ บันทึก ${fd.get("sku")} แล้ว`);
        setTimeout(() => setToast(""), 2500);
        setP(null);
        router.refresh();
      }
    });
  };

  return (
    <>
      {toast && <div className="sort-toast" role="status"><span className="sort-msg ok">{toast}</span></div>}
      <QuickDrawer
        open={!!p}
        title={p?.name ?? ""}
        sub={p && <>{p.sku} · <a className="link" href={`/admin/products/${p.id}`}>เปิดหน้าแก้ไขเต็ม</a></>}
        onClose={close}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={close}>ยกเลิก</button>
            <button type="submit" form="qeProduct" className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
          </>
        }
      >
        {p && (
          <form id="qeProduct" className="qd-form" onSubmit={submit} key={p.id}>
            <input type="hidden" name="id" value={p.id} />
            {res.error && <div className="login-err" role="alert">{res.error}</div>}
            <div className="qd-prod">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.img ? <img src={p.img} alt="" /> : <span />}
              <div className="field grow"><label htmlFor="qeName">ชื่อสินค้า</label><textarea id="qeName" name="name" defaultValue={p.name} rows={2} maxLength={250} className={bad("name")} /></div>
            </div>
            <div className="qd-two">
              <div className="field"><label htmlFor="qeSku">รหัสสินค้า (SKU)</label><input id="qeSku" name="sku" defaultValue={p.sku} maxLength={60} className={bad("sku")} /></div>
              <div className="field">
                <label htmlFor="qeCat">หมวดหมู่</label>
                <select id="qeCat" name="categoryId" defaultValue={p.categoryId} className={bad("categoryId")}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <fieldset className="qd-sec">
              <legend>💰 ราคา</legend>
              <div className="qd-two">
                <div className="field"><label htmlFor="qePrice">ราคาขาย (บาท)</label><input id="qePrice" name="price" defaultValue={p.price} inputMode="decimal" className={`qd-big${bad("price")}`} /><small>0 หรือเว้นว่าง = &quot;สอบถามราคา&quot;</small></div>
                <div className="field"><label htmlFor="qeCmp">ราคาปกติก่อนลด</label><input id="qeCmp" name="compareAt" defaultValue={p.compareAt} inputMode="decimal" className={bad("compareAt")} /><small>เว้นว่าง = ไม่ลดราคา</small></div>
              </div>
            </fieldset>

            <fieldset className="qd-sec">
              <legend>📦 สต็อก</legend>
              <label className="chk-row"><input type="checkbox" name="trackStock" checked={track} onChange={(e) => setTrack(e.target.checked)} /> นับสต็อก (ขายได้ไม่เกินจำนวนคงเหลือ)</label>
              {track ? (
                <div className="field"><label htmlFor="qeStock">คงเหลือ</label><input id="qeStock" name="stock" defaultValue={p.trackStock ? p.stock : 0} inputMode="numeric" className={`qd-big${bad("stock")}`} /><small>บันทึกในประวัติสต็อกให้อัตโนมัติ</small></div>
              ) : (
                <label className="chk-row"><input type="checkbox" name="inStock" defaultChecked={p.inStock} /> มีสินค้าพร้อมขาย</label>
              )}
            </fieldset>

            <fieldset className="qd-sec">
              <legend>🏷️ การขาย</legend>
              <label className="chk-row"><input type="checkbox" name="isActive" defaultChecked={p.isActive} /> เปิดขายบนหน้าร้าน</label>
              <label className="chk-row"><input type="checkbox" name="isBestSeller" defaultChecked={p.isBestSeller} /> แสดงใน &quot;สินค้าขายดี&quot; หน้าแรก</label>
              <div className="field"><label htmlFor="qeBadge">ป้ายบนการ์ด</label><input id="qeBadge" name="badge" defaultValue={p.badge} maxLength={20} placeholder="เช่น ขายดี, แนะนำ, ใหม่" /></div>
            </fieldset>
          </form>
        )}
      </QuickDrawer>
    </>
  );
}
