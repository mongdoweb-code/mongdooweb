"use client";
// ฟิลด์ล็อต 9 ในฟอร์มสินค้า: ราคาลดตามช่วงเวลา (A3), ราคาขายส่งตามจำนวน (A6), สเปกแบบมีโครงสร้างของหมวด (A5)
// ค่าทั้งหมดส่งไปพร้อมฟอร์มหลัก (saveProduct) และตรวจซ้ำที่ server
import Link from "next/link";
import { useState } from "react";
import { ATTR_TYPES, defsFor, type SpecDef } from "@/lib/specs";

export type ExtrasValues = {
  salePrice: string;
  saleStartsAt: string;
  saleEndsAt: string;
  tiers: { minQty: string; price: string }[];
  attrs: Record<string, string>;
  group: { id: string; name: string; options: string } | null;
};

const bad = (fields: string[] | undefined, k: string) => (fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});

export function SaleTierFields({ v, fields }: { v: ExtrasValues; fields?: string[] }) {
  const [sale, setSale] = useState(v.salePrice);
  const [pct, setPct] = useState("");
  const [tiers, setTiers] = useState(v.tiers.length ? v.tiers : [{ minQty: "", price: "" }]);
  const price = () => Number(((document.getElementById("price") as HTMLInputElement | null)?.value ?? "").replace(/[,\s฿]/g, "")) || 0;
  return (
    <>
      <div className="box" id="saleBox">
        <h3>ลดราคาตามช่วงเวลา <span className="sub">หมดเวลาแล้วกลับเป็นราคาปกติเอง</span></h3>
        <div className="two">
          <div className="field">
            <label htmlFor="salePrice">ราคาลด (บาท)</label>
            <input id="salePrice" name="salePrice" value={sale} onChange={(e) => setSale(e.target.value)} inputMode="decimal" {...bad(fields, "salePrice")} />
            <small>เว้นว่าง = ไม่ลดราคา</small>
          </div>
          <div className="field">
            <label htmlFor="salePct">หรือคิดจาก % ส่วนลด</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input id="salePct" value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric" placeholder="เช่น 15" style={{ minWidth: 0 }} />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  const p = price();
                  const n = Number(pct);
                  if (p > 0 && n > 0 && n < 100) setSale(String(Math.max(1, Math.round((p * (100 - n)) / 100))));
                }}
              >
                คำนวณ
              </button>
            </div>
            <small>ปัดเป็นบาทเต็ม</small>
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="saleStartsAt">เริ่ม (เวลาไทย)</label>
            <input id="saleStartsAt" name="saleStartsAt" type="datetime-local" defaultValue={v.saleStartsAt} {...bad(fields, "saleStartsAt")} />
            <small>เว้นว่าง = เริ่มทันที</small>
          </div>
          <div className="field">
            <label htmlFor="saleEndsAt">สิ้นสุด (เวลาไทย)</label>
            <input id="saleEndsAt" name="saleEndsAt" type="datetime-local" defaultValue={v.saleEndsAt} {...bad(fields, "saleEndsAt")} />
            <small>เหลือไม่ถึง 7 วัน หน้าสินค้าแสดงนับถอยหลัง</small>
          </div>
        </div>
      </div>

      <div className="box" id="tierBox">
        <h3>ราคาขายส่งตามจำนวน <span className="sub">คิดจากจำนวนรวมของสินค้านี้ในตะกร้า</span></h3>
        <input type="hidden" name="tierPrices" value={JSON.stringify(tiers)} />
        {tiers.map((t, i) => (
          <div className="spec-row" key={i} {...bad(fields, "tierPrices")}>
            <input aria-label={`ขั้นที่ ${i + 1}: จำนวนขั้นต่ำ`} placeholder="ซื้อตั้งแต่ (ชิ้น) เช่น 10" inputMode="numeric" value={t.minQty} onChange={(e) => setTiers(tiers.map((x, k) => (k === i ? { ...x, minQty: e.target.value } : x)))} />
            <input aria-label={`ขั้นที่ ${i + 1}: ราคาต่อชิ้น (บาท)`} placeholder="ราคาต่อชิ้น (บาท)" inputMode="decimal" value={t.price} onChange={(e) => setTiers(tiers.map((x, k) => (k === i ? { ...x, price: e.target.value } : x)))} />
            <button type="button" className="link" onClick={() => setTiers(tiers.length > 1 ? tiers.filter((_, k) => k !== i) : [{ minQty: "", price: "" }])}>
              ลบ
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="btn btn-outline btn-sm" disabled={tiers.length >= 10} onClick={() => setTiers([...tiers, { minQty: "", price: "" }])}>
            + เพิ่มขั้นราคา
          </button>
        </div>
        <small className="sub">ตัวอย่าง: 10 ชิ้นขึ้นไป ฿90/ชิ้น, 50 ชิ้นขึ้นไป ฿80/ชิ้น · ขั้นที่ซื้อมากกว่าต้องถูกกว่า</small>
      </div>
    </>
  );
}

export function SpecFields({ v, defs, categoryId, fields }: { v: ExtrasValues; defs: SpecDef[]; categoryId: string; fields?: string[] }) {
  const [attrs, setAttrs] = useState<Record<string, string>>(v.attrs);
  const list = defsFor(defs, categoryId);
  const set = (code: string, val: string) => setAttrs({ ...attrs, [code]: val });
  return (
    <div className="box" id="specBox">
      <h3>
        สเปกตามหมวด <span className="sub">ใช้กรองในหน้าหมวด เปรียบเทียบสินค้า และตารางสเปก</span>
      </h3>
      {/* ส่งเฉพาะสเปกของหมวดที่เลือกอยู่ (เปลี่ยนหมวด = สเปกเดิมที่ไม่มีในหมวดใหม่ถูกตัด) */}
      <input type="hidden" name="attrs" value={JSON.stringify(Object.fromEntries(list.map((d) => [d.code, attrs[d.code] ?? ""])))} />
      {!list.length && (
        <p className="sub">
          หมวดนี้ยังไม่ได้กำหนดสเปก — <Link className="link" href="/admin/specs">กำหนดสเปกต่อหมวด</Link>
        </p>
      )}
      <div className="two" style={{ flexWrap: "wrap" }}>
        {list.map((d) => (
          <div className="field" key={d.id}>
            <label htmlFor={`attr_${d.code}`}>
              {d.label}
              {d.unit ? ` (${d.unit})` : ""}
            </label>
            {d.type === "ENUM" ? (
              <select id={`attr_${d.code}`} value={attrs[d.code] ?? ""} onChange={(e) => set(d.code, e.target.value)} {...bad(fields, `attr_${d.code}`)}>
                <option value="">— ไม่ระบุ —</option>
                {d.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                {attrs[d.code] && !d.options.includes(attrs[d.code]) && <option value={attrs[d.code]}>{attrs[d.code]} (ไม่อยู่ในตัวเลือกแล้ว)</option>}
              </select>
            ) : (
              <input
                id={`attr_${d.code}`}
                value={attrs[d.code] ?? ""}
                onChange={(e) => set(d.code, e.target.value)}
                inputMode={d.type === "NUMBER" ? "decimal" : undefined}
                maxLength={100}
                title={ATTR_TYPES[d.type]}
                {...bad(fields, `attr_${d.code}`)}
              />
            )}
          </div>
        ))}
      </div>
      {list.length > 0 && (
        <small className="sub">
          <Link className="link" href="/admin/specs">แก้รายการสเปกของหมวด</Link>
        </small>
      )}
    </div>
  );
}
