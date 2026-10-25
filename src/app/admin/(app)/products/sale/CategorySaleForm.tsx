"use client";
// ตั้งลดราคาตามเวลาทั้งหมวด (A3): % ส่วนลด + ช่วงเวลา (เวลาไทย) หรือยกเลิกทั้งหมวด
import { useFormAction } from "../../../_components/useFormAction";
import { categorySale, type Lot9State } from "../lot9-actions";

export function CategorySaleForm({ categories }: { categories: { id: string; name: string; count: number }[] }) {
  const [state, onSubmit, pending] = useFormAction<Lot9State>(categorySale, {});
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  return (
    <form className="box" onSubmit={onSubmit} id="catSaleForm" style={{ maxWidth: 720 }}>
      <h3>ลดราคาทั้งหมวด</h3>
      <p className="sub">ตั้งราคาลดเป็น % ให้ทุกสินค้าที่มีราคาในหมวด (ปัดเป็นบาทเต็ม) · หมดเวลาแล้วกลับราคาปกติเอง ไม่ต้องกดอะไร</p>
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="two">
        <div className="field">
          <label htmlFor="csCat">หมวด</label>
          <select id="csCat" name="categoryId" required {...bad("categoryId")}>
            <option value="">— เลือกหมวด —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="csPct">ส่วนลด (%)</label>
          <input id="csPct" name="salePct" inputMode="numeric" placeholder="เช่น 10" {...bad("salePct")} />
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="csStart">เริ่ม (เวลาไทย)</label>
          <input id="csStart" name="saleStartsAt" type="datetime-local" />
          <small>เว้นว่าง = เริ่มทันที</small>
        </div>
        <div className="field">
          <label htmlFor="csEnd">สิ้นสุด (เวลาไทย)</label>
          <input id="csEnd" name="saleEndsAt" type="datetime-local" {...bad("saleEndsAt")} />
        </div>
      </div>
      <label className="chk-row">
        <input type="checkbox" name="activeOnly" defaultChecked /> เฉพาะสินค้าที่เปิดขายอยู่
      </label>
      <div className="act-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" name="mode" value="set" disabled={pending}>
          ตั้งลดราคาทั้งหมวด
        </button>
        <button className="btn btn-outline" type="submit" name="mode" value="clear" disabled={pending}>
          ยกเลิกลดราคาทั้งหมวด
        </button>
      </div>
    </form>
  );
}
