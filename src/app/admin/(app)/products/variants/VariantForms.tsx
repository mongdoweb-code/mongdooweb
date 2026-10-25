"use client";
// ฟอร์มกลุ่มตัวเลือกสินค้า (A1): ชื่อกลุ่ม ชื่อตัวเลือก ค่าตัวเลือกของแต่ละสินค้า ตัวหลัก (canonical) เพิ่ม/เอาออก
// + แก้ราคาหลายตัวเลือกพร้อมกัน + สร้างกลุ่มจากคำแนะนำ
import { useState } from "react";
import { parseOptionNames } from "@/lib/variants";
import { useFormAction } from "../../../_components/useFormAction";
import { createSuggestedGroups, createVariantGroup, groupPrice, updateVariantGroup, type Lot9State } from "../lot9-actions";

export type MemberRow = { id: string; sku: string; name: string; price: string; isActive: boolean; options: Record<string, string> };
export type GroupValues = { id: string; name: string; optionNames: string[]; primaryId: string; members: MemberRow[] };

function Msg({ s }: { s: Lot9State }) {
  return (
    <>
      {s.error && <div className="login-err" role="alert">{s.error}</div>}
      {s.ok && <div className="login-info" role="status">{s.ok}</div>}
    </>
  );
}

export function GroupForm({ g, initial }: { g: GroupValues | null; initial?: Lot9State }) {
  const [state, onSubmit, pending] = useFormAction<Lot9State>(g ? updateVariantGroup : createVariantGroup, initial ?? {});
  const [names, setNames] = useState((g?.optionNames ?? []).join(", "));
  const [members, setMembers] = useState<MemberRow[]>(g?.members ?? []);
  const opts = parseOptionNames(names);
  const bad = (k: string) => (state.fields?.includes(k) ? { style: { borderColor: "var(--c-err)" } } : {});
  return (
    <form className="box" onSubmit={onSubmit} id="groupForm">
      {g && <input type="hidden" name="groupId" value={g.id} />}
      <h3>{g ? "ข้อมูลกลุ่ม" : "สร้างกลุ่มใหม่"}</h3>
      <Msg s={state} />
      <div className="two">
        <div className="field">
          <label htmlFor="gName">ชื่อกลุ่ม (ชื่อกลางของสินค้า)</label>
          <input id="gName" name="name" defaultValue={g?.name ?? ""} maxLength={120} required {...bad("name")} />
        </div>
        <div className="field">
          <label htmlFor="gOpts">ชื่อตัวเลือก (คั่นด้วย , ไม่เกิน 3)</label>
          <input id="gOpts" name="optionNames" value={names} onChange={(e) => setNames(e.target.value)} placeholder="เช่น สี, วัตต์" {...bad("optionNames")} />
          <small>ลูกค้าเห็นเป็นปุ่มเลือกบนหน้าสินค้า ตามลำดับนี้</small>
        </div>
      </div>
      {members.length > 0 && (
        <table className="tbl" id="memberTable">
          <thead>
            <tr>
              <th>สินค้า</th>
              {opts.map((n) => (
                <th key={n}>{n}</th>
              ))}
              <th>ตัวหลัก</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className={m.isActive ? "" : "row-off"} data-member={m.sku}>
                <td>
                  <input type="hidden" name="member" value={m.id} />
                  <a className="row-link" href={`/admin/products/${m.id}`}>
                    <b>{m.name}</b>
                    <span className="sub">
                      {m.sku} · {m.price}
                      {m.isActive ? "" : " · ปิดขาย"}
                    </span>
                  </a>
                </td>
                {opts.map((n, i) => (
                  <td key={n}>
                    <input
                      className="sel"
                      style={{ width: 120 }}
                      name={`opt_${m.id}_${i}`}
                      aria-label={`${n} ของ ${m.sku}`}
                      value={m.options[n] ?? ""}
                      maxLength={60}
                      onChange={(e) => setMembers(members.map((x) => (x.id === m.id ? { ...x, options: { ...x.options, [n]: e.target.value } } : x)))}
                    />
                  </td>
                ))}
                <td>
                  <input type="radio" name="primaryId" value={m.id} defaultChecked={g?.primaryId === m.id} aria-label={`ตั้ง ${m.sku} เป็นตัวหลัก`} />
                </td>
                <td className="r">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMembers(members.filter((x) => x.id !== m.id))}>
                    เอาออก
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="field">
        <label htmlFor="gAdd">เพิ่มสินค้าด้วยรหัส (SKU คั่นด้วย ,)</label>
        <input id="gAdd" name="addSkus" placeholder="เช่น UN3W-WW, UN6W-WW" {...bad("addSkus")} />
        <small>เพิ่มแล้วกดบันทึก จากนั้นใส่ค่าตัวเลือกของสินค้าที่เพิ่ม · ตัวหลัก = หน้าที่ Google ใช้เป็นหน้าหลัก (canonical)</small>
      </div>
      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก…" : g ? "บันทึกกลุ่ม" : "สร้างกลุ่ม"}
        </button>
      </div>
    </form>
  );
}

export function GroupPriceForm({ groupId, members }: { groupId: string; members: { id: string; label: string }[] }) {
  const [state, onSubmit, pending] = useFormAction<Lot9State>(groupPrice, {});
  return (
    <form className="box" onSubmit={onSubmit} id="groupPriceForm">
      <input type="hidden" name="groupId" value={groupId} />
      <h3>แก้ราคาหลายตัวเลือกพร้อมกัน</h3>
      <Msg s={state} />
      <div className="chk-wrap">
        {members.map((m) => (
          <label key={m.id} className="chk-row">
            <input type="checkbox" name="pick" value={m.id} /> {m.label}
          </label>
        ))}
      </div>
      <small className="sub">ไม่ติ๊กเลย = ทุกตัวในกลุ่ม</small>
      <div className="two">
        <div className="field">
          <label htmlFor="gpMode">วิธี</label>
          <select id="gpMode" name="priceMode" defaultValue="set">
            <option value="set">ตั้งราคาเท่ากัน (บาท)</option>
            <option value="pct">ปรับ ± %</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="gpVal">ค่า</label>
          <input id="gpVal" name="priceValue" inputMode="decimal" placeholder="เช่น 590 หรือ -10" required />
        </div>
      </div>
      <div>
        <button className="btn btn-outline" type="submit" disabled={pending}>
          ใช้ราคานี้
        </button>
      </div>
    </form>
  );
}

export type SuggestRow = {
  key: string;
  name: string;
  categoryName: string;
  optionNames: string[];
  members: { sku: string; name: string; options: Record<string, string>; price: string; isActive: boolean }[];
  skipped: { sku: string; reason: string }[];
};

export function SuggestForm({ list }: { list: SuggestRow[] }) {
  const [state, onSubmit, pending] = useFormAction<Lot9State>(createSuggestedGroups, {});
  return (
    <form onSubmit={onSubmit} id="suggestForm">
      <Msg s={state} />
      <div className="sugg-list" style={{ display: "grid", gap: 12 }}>
        {list.map((s, i) => (
          <fieldset key={s.key} className="box" data-suggest={i}>
            <legend className="sr-only">กลุ่มแนะนำ {i + 1}</legend>
            <label className="chk-row">
              <input type="checkbox" name="key" value={s.key} /> <b>สร้างกลุ่มนี้</b>
              <span className="sub">
                {" "}
                · {s.categoryName} · ตัวเลือก: {s.optionNames.join(", ")} · {s.members.length} รายการ
              </span>
            </label>
            <div className="field">
              <label htmlFor={`sn${i}`}>ชื่อกลุ่ม</label>
              <input id={`sn${i}`} name={`name_${s.key}`} defaultValue={s.name} maxLength={120} />
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  {s.optionNames.map((n) => (
                    <th key={n}>{n}</th>
                  ))}
                  <th className="r">ราคา</th>
                </tr>
              </thead>
              <tbody>
                {s.members.map((m) => (
                  <tr key={m.sku} className={m.isActive ? "" : "row-off"}>
                    <td>
                      <b>{m.name}</b>
                      <span className="sub"> {m.sku}</span>
                    </td>
                    {s.optionNames.map((n) => (
                      <td key={n}>{m.options[n]}</td>
                    ))}
                    <td className="r num">{m.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.skipped.length > 0 && (
              <p className="sub">ไม่รวม: {s.skipped.map((x) => `${x.sku} (${x.reason})`).join(", ")}</p>
            )}
          </fieldset>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "กำลังสร้าง…" : "สร้างกลุ่มที่เลือก"}
        </button>
      </div>
    </form>
  );
}
