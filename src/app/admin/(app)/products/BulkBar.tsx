"use client";
// แก้สินค้าหลายรายการพร้อมกัน (A12): ติ๊กแถวในตาราง (checkbox form="bulkForm") แล้วเลือกการแก้ — บันทึกใน transaction เดียว
import { useEffect, useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { bulkEditProducts, type Lot9State } from "./lot9-actions";

const OPS = [
  ["category", "ย้ายหมวด"],
  ["price", "ปรับราคา"],
  ["active", "เปิดขาย"],
  ["inactive", "ปิดขาย"],
  ["sale", "ตั้งลดราคาตามเวลา"],
  ["clearSale", "ยกเลิกราคาลด"],
] as const;

export function BulkBar({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, onSubmit, pending] = useFormAction<Lot9State>(bulkEditProducts, {});
  const [n, setN] = useState(0);
  const [op, setOp] = useState<string>("price");
  const [mode, setMode] = useState("pct");

  useEffect(() => {
    const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[name="ids"][form="bulkForm"]')];
    const count = () => setN(boxes().filter((b) => b.checked).length);
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.id === "bulkAll") boxes().forEach((b) => (b.checked = t.checked));
      if (t.id === "bulkAll" || (t.name === "ids" && t.form?.id === "bulkForm")) count();
    };
    document.addEventListener("change", onChange);
    count();
    return () => document.removeEventListener("change", onChange);
  }, []);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});

  return (
    <form id="bulkForm" className="bulkbar" onSubmit={onSubmit} aria-label="แก้หลายรายการ">
      <b>
        เลือกแล้ว <span id="bulkCount">{n}</span> รายการ
      </b>
      <label className="sr-only" htmlFor="bulkOp">
        สิ่งที่ต้องการแก้
      </label>
      <select id="bulkOp" name="op" className="sel" value={op} onChange={(e) => setOp(e.target.value)}>
        {OPS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {op === "category" && (
        <select name="categoryId" className="sel" aria-label="หมวดใหม่" {...bad("categoryId")}>
          <option value="">— เลือกหมวด —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {op === "price" && (
        <>
          <select name="priceMode" className="sel" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="วิธีปรับราคา">
            <option value="pct">ปรับ ± %</option>
            <option value="set">ตั้งราคาเท่ากัน (บาท)</option>
          </select>
          <input name="priceValue" className="sel" style={{ width: 120 }} inputMode="decimal" placeholder={mode === "pct" ? "เช่น 10 หรือ -5" : "ราคา (บาท)"} aria-label={mode === "pct" ? "เปอร์เซ็นต์" : "ราคา"} {...bad("priceValue")} />
        </>
      )}
      {op === "sale" && (
        <>
          <input name="salePct" className="sel" style={{ width: 90 }} inputMode="numeric" placeholder="ลด %" aria-label="ส่วนลด %" {...bad("salePct")} />
          <label className="sub">
            เริ่ม <input name="saleStartsAt" type="datetime-local" className="sel" />
          </label>
          <label className="sub">
            ถึง <input name="saleEndsAt" type="datetime-local" className="sel" {...bad("saleEndsAt")} />
          </label>
        </>
      )}
      <button className="btn btn-primary btn-sm" type="submit" disabled={pending || n === 0}>
        {pending ? "กำลังบันทึก…" : "ใช้กับที่เลือก"}
      </button>
      {state.error && (
        <span className="login-err" role="alert" style={{ flexBasis: "100%" }}>
          {state.error}
        </span>
      )}
      {state.ok && (
        <span className="login-info" role="status" style={{ flexBasis: "100%" }}>
          {state.ok}
        </span>
      )}
    </form>
  );
}
