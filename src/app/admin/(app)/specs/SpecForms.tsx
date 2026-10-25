"use client";
// ฟอร์มสเปกต่อหมวด (A5): เพิ่ม/แก้ทีละรายการ + ปุ่มเพิ่มชุดมาตรฐานไฟ LED
import { useState } from "react";
import { ATTR_TYPES, type AttrType } from "@/lib/specs";
import { useFormAction } from "../../_components/useFormAction";
import { addPreset, saveSpec, type SpecState } from "./actions";

export type SpecRow = { id: string; code: string; label: string; unit: string; type: AttrType; options: string[]; filterable: boolean; sortOrder: number; used: number };

export function SpecForm({ categoryId, s }: { categoryId: string; s?: SpecRow }) {
  const [state, onSubmit, pending] = useFormAction<SpecState>(saveSpec, {});
  const [type, setType] = useState<AttrType>(s?.type ?? "ENUM");
  const p = s?.id ?? "new";
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  return (
    <form className="box spec-form" onSubmit={onSubmit} data-spec-form={s?.code ?? "new"}>
      <input type="hidden" name="categoryId" value={categoryId} />
      {s && <input type="hidden" name="id" value={s.id} />}
      <h3>
        {s ? s.label : "เพิ่มสเปก"}
        {s && <span className="sub"> · {s.code} · กรอกแล้ว {s.used} สินค้า</span>}
      </h3>
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="two">
        <div className="field">
          <label htmlFor={`label-${p}`}>ชื่อสเปก</label>
          <input id={`label-${p}`} name="label" defaultValue={s?.label ?? ""} maxLength={60} placeholder="เช่น ระดับกันน้ำ" required {...bad("label")} />
        </div>
        <div className="field">
          <label htmlFor={`code-${p}`}>รหัส (ใช้ใน URL ตัวกรอง)</label>
          <input id={`code-${p}`} name="code" defaultValue={s?.code ?? ""} maxLength={30} placeholder="เช่น ip, watt" required pattern="[a-z][a-z0-9_]*" {...bad("code")} />
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor={`type-${p}`}>ชนิด</label>
          <select id={`type-${p}`} name="type" value={type} onChange={(e) => setType(e.target.value as AttrType)}>
            {(Object.keys(ATTR_TYPES) as AttrType[]).map((t) => (
              <option key={t} value={t}>
                {ATTR_TYPES[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`unit-${p}`}>หน่วย (ไม่บังคับ)</label>
          <input id={`unit-${p}`} name="unit" defaultValue={s?.unit ?? ""} maxLength={12} placeholder="เช่น W, V, K, °" />
        </div>
      </div>
      {type === "ENUM" && (
        <div className="field">
          <label htmlFor={`opts-${p}`}>ค่าที่เลือกได้ (บรรทัดละค่า หรือคั่นด้วย ,)</label>
          <textarea id={`opts-${p}`} name="options" rows={3} defaultValue={(s?.options ?? []).join("\n")} placeholder={"IP65\nIP67\nIP68"} {...bad("options")} />
        </div>
      )}
      <div className="two">
        <label className="chk-row">
          <input type="checkbox" name="filterable" defaultChecked={s?.filterable ?? true} /> ใช้เป็นตัวกรองในหน้าหมวด
        </label>
        <div className="field">
          <label htmlFor={`sort-${p}`}>ลำดับ</label>
          <input id={`sort-${p}`} name="sortOrder" defaultValue={s?.sortOrder ?? 0} inputMode="numeric" />
        </div>
      </div>
      <div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {s ? "บันทึก" : "เพิ่มสเปก"}
        </button>
      </div>
    </form>
  );
}

export function PresetButton({ categoryId }: { categoryId: string }) {
  const [state, onSubmit, pending] = useFormAction<SpecState>(addPreset, {});
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="categoryId" value={categoryId} />
      <button className="btn btn-outline btn-sm" type="submit" disabled={pending} id="presetBtn">
        + เพิ่มชุดมาตรฐานไฟ LED (วัตต์ แรงดัน IP สีแสง มุมแสง วัสดุ)
      </button>
      {state.ok && <span className="login-info" role="status">{state.ok}</span>}
      {state.error && <span className="login-err" role="alert">{state.error}</span>}
    </form>
  );
}
