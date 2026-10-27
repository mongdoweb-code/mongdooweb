"use client";
// ฟอร์มคูปอง (สร้าง/แก้) — ตรวจซ้ำที่ server ทุกช่อง
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { saveCoupon, type CouponState } from "./actions";

export type CouponValues = {
  id?: string; code: string; kind: "PERCENT" | "FIXED"; value: string; minOrder: string; maxDiscount: string; startsAt: string; endsAt: string;
  usageLimit: string; perPhoneLimit: string; categoryIds: string[]; isActive: boolean; note: string;
};

export function CouponForm({ v, categories }: { v: CouponValues; categories: { id: string; name: string }[] }) {
  const [state, onSubmit, pending] = useFormAction<CouponState>(saveCoupon, {});
  const [kind, setKind] = useState(v.kind);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  return (
    <form onSubmit={onSubmit} className="box cp-form" id="couponForm">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      <div className="two">
        <div className="field">
          <label htmlFor="cpCode">โค้ด</label>
          <input id="cpCode" name="code" defaultValue={v.code} required maxLength={30} placeholder="เช่น POOL10" style={{ textTransform: "uppercase", ...(bad("code").style ?? {}) }} />
          <small>ตัวอักษรอังกฤษ ตัวเลข หรือ - (ลูกค้าพิมพ์ตัวเล็กได้)</small>
        </div>
        <div className="field">
          <label htmlFor="cpKind">ประเภทส่วนลด</label>
          <select id="cpKind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "PERCENT" | "FIXED")}>
            <option value="PERCENT">ลดเป็น %</option>
            <option value="FIXED">ลดเป็นบาท</option>
          </select>
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="cpValue">{kind === "PERCENT" ? "ส่วนลด (%)" : "ส่วนลด (บาท)"}</label>
          <input id="cpValue" name="value" defaultValue={v.value} inputMode="decimal" required {...bad("value")} />
        </div>
        {kind === "PERCENT" ? (
          <div className="field">
            <label htmlFor="cpMax">ลดสูงสุด (บาท)</label>
            <input id="cpMax" name="maxDiscount" defaultValue={v.maxDiscount} inputMode="decimal" placeholder="เว้นว่าง = ไม่จำกัด" {...bad("maxDiscount")} />
          </div>
        ) : <div />}
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="cpMin">ยอดสินค้าขั้นต่ำ (บาท)</label>
          <input id="cpMin" name="minOrder" defaultValue={v.minOrder} inputMode="decimal" placeholder="0" {...bad("minOrder")} />
        </div>
        <div className="field">
          <label htmlFor="cpNote">หมายเหตุภายใน</label>
          <input id="cpNote" name="note" defaultValue={v.note} maxLength={300} placeholder="เช่น แจกในกลุ่ม LINE ลูกค้าโครงการ" />
        </div>
      </div>
      <div className="two">
        <div className="field"><label htmlFor="cpStart">เริ่มใช้ (วันที่ เวลาไทย)</label><input id="cpStart" name="startsAt" type="date" defaultValue={v.startsAt} {...bad("startsAt")} /></div>
        <div className="field"><label htmlFor="cpEnd">ใช้ได้ถึง (สิ้นวัน)</label><input id="cpEnd" name="endsAt" type="date" defaultValue={v.endsAt} {...bad("endsAt")} /></div>
      </div>
      <div className="two">
        <div className="field"><label htmlFor="cpLimit">จำนวนครั้งทั้งหมด</label><input id="cpLimit" name="usageLimit" defaultValue={v.usageLimit} inputMode="numeric" placeholder="เว้นว่าง = ไม่จำกัด" {...bad("usageLimit")} /></div>
        <div className="field"><label htmlFor="cpPhone">จำกัดต่อเบอร์โทร (ครั้ง)</label><input id="cpPhone" name="perPhoneLimit" defaultValue={v.perPhoneLimit} inputMode="numeric" placeholder="เว้นว่าง = ไม่จำกัด" {...bad("perPhoneLimit")} /></div>
      </div>
      <fieldset className="field cp-cats">
        <legend>ใช้ได้เฉพาะหมวด (ไม่เลือก = ทุกหมวด · ส่วนลดคิดจากสินค้าในหมวดที่เลือกเท่านั้น)</legend>
        <div className="cp-cat-list">
          {categories.map((c) => (
            <label key={c.id} className="chk-row"><input type="checkbox" name="categoryIds" value={c.id} defaultChecked={v.categoryIds.includes(c.id)} /> {c.name}</label>
          ))}
        </div>
      </fieldset>
      <label className="chk-row"><input type="checkbox" name="isActive" defaultChecked={v.isActive} /> เปิดใช้งาน</label>
      <div className="act-row">
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกคูปอง"}</button>
      </div>
    </form>
  );
}
