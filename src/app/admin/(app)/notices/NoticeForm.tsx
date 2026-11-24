"use client";
// ฟอร์มข้อความแจ้งเตือน (หน้าคลัง): ข้อความ/สี/ไอคอน · ใช้กับสินค้าไหน (เลือกเอง + ติ๊กสินค้า / ทุกสินค้า / ตามหมวด) · ตัวอย่างสดแบบหน้าร้าน
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NoticeBox } from "@/components/notice/NoticeBox";
import { NOTICE_NAME_MAX, noticeNameFrom, type NoticeRow, type NoticeScope } from "@/lib/notices";
import { notifySave } from "../../_components/save-notify";
import { saveNotice } from "./actions";
import { NoticeFields, type NoticeDraft } from "./NoticeFields";

export type NoticeFormInit = Omit<NoticeRow, "id" | "sortOrder"> & { id?: string; productIds: string[] };
type Prod = { id: string; label: string; catId: string; acc: boolean };

const SCOPES: { k: NoticeScope; t: string; d: string }[] = [
  { k: "MANUAL", t: "เลือกสินค้าเอง", d: "ติ๊กสินค้าด้านล่าง หรือเลือกในหน้าแก้ไขสินค้า" },
  { k: "CATEGORIES", t: "ทุกสินค้าในหมวดที่เลือก", d: "สินค้าใหม่ในหมวดได้ข้อความนี้อัตโนมัติ" },
  { k: "ALL", t: "ทุกสินค้าในร้าน", d: "แสดงกับทุกสินค้าอัตโนมัติ" },
];

export function NoticeForm({ init, categories, products }: { init: NoticeFormInit; categories: { id: string; name: string }[]; products: Prod[] }) {
  const router = useRouter();
  const editing = !!init.id;
  const uid = "ntf-";
  const [d, setD] = useState<NoticeDraft>({ text: init.text, tone: init.tone, icon: init.icon });
  const [name, setName] = useState(init.name);
  const [scope, setScope] = useState<NoticeScope>(init.scope);
  const [cats, setCats] = useState<string[]>(init.categoryIds);
  const [skipAcc, setSkipAcc] = useState(init.skipAccessory);
  const [active, setActive] = useState(init.isActive);
  const [picked, setPicked] = useState<Set<string>>(new Set(init.productIds));
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string[]>([]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => (!catFilter || p.catId === catFilter) && (!t || p.label.toLowerCase().includes(t)));
  }, [products, q, catFilter]);
  const autoCount = useMemo(
    () => (scope === "MANUAL" ? 0 : products.filter((p) => !(skipAcc && p.acc) && (scope === "ALL" || cats.includes(p.catId))).length),
    [products, scope, cats, skipAcc],
  );
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickAll = (on: boolean) => setPicked((s) => { const n = new Set(s); for (const p of shown) if (on) n.add(p.id); else n.delete(p.id); return n; });
  const allShownPicked = shown.length > 0 && shown.every((p) => picked.has(p.id));

  async function save() {
    setBusy(true);
    const r = await saveNotice({ id: init.id, name, text: d.text, tone: d.tone, icon: d.icon, scope, categoryIds: cats, skipAccessory: skipAcc, isActive: active, productIds: [...picked] });
    setBusy(false);
    setBad(r.fields ?? []);
    notifySave(r.error ? { ok: false, message: r.error, fields: r.fields?.map((f) => `${uid}${f}`) } : { ok: true, message: r.ok });
    if (r.error) return;
    if (editing) router.refresh();
    else router.push("/admin/notices?saved=1");
  }

  return (
    <div className="ntc-form">
      <div className="ntc-main">
        <NoticeFields v={d} set={(p) => setD((x) => ({ ...x, ...p }))} uid={uid} invalid={bad} />
        <div className="field">
          <label htmlFor={`${uid}name`}>ชื่อเรียกในหลังบ้าน <span className="sub">(ไม่แสดงหน้าร้าน)</span></label>
          <input id={`${uid}name`} value={name} maxLength={NOTICE_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={noticeNameFrom(d.text) || "เว้นว่าง = ใช้ต้นข้อความ"} />
        </div>

        <fieldset className="ntf-set" id={`${uid}categories`}>
          <legend>ใช้กับสินค้าไหน</legend>
          <div className="ntc-scopes">
            {SCOPES.map((s) => (
              <label key={s.k} className={`ntc-scope${scope === s.k ? " is-on" : ""}`}>
                <input type="radio" name="scope" value={s.k} checked={scope === s.k} onChange={() => setScope(s.k)} />
                <span><b>{s.t}</b><small>{s.d}</small></span>
              </label>
            ))}
          </div>
          {scope === "CATEGORIES" && (
            <div className="ntc-cats" aria-invalid={bad.includes("categories") || undefined}>
              {categories.map((c) => (
                <label key={c.id} className={`ntc-chip${cats.includes(c.id) ? " is-on" : ""}`}>
                  <input type="checkbox" checked={cats.includes(c.id)} onChange={(e) => setCats(e.target.checked ? [...cats, c.id] : cats.filter((x) => x !== c.id))} />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          {scope !== "MANUAL" && (
            <>
              <label className="chk-row"><input type="checkbox" checked={skipAcc} onChange={(e) => setSkipAcc(e.target.checked)} /> ไม่แสดงกับสินค้าที่เป็นอุปกรณ์เสริม</label>
              <p className="ntc-hint">แสดงอัตโนมัติกับสินค้า <b>{autoCount.toLocaleString("th-TH")}</b> รายการ · ปิดเฉพาะบางตัวได้ในหน้าแก้ไขสินค้านั้น</p>
            </>
          )}
        </fieldset>

        <fieldset className="ntf-set">
          <legend>
            {scope === "MANUAL" ? "สินค้าที่ใช้ข้อความนี้" : "เพิ่มให้สินค้าอื่นด้วย (นอกเหนือจากอัตโนมัติ)"} <span className="ntc-n">{picked.size.toLocaleString("th-TH")} รายการ</span>
          </legend>
          <div className="ntc-pick-bar">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อสินค้า / รหัส" aria-label="ค้นหาสินค้า" />
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="กรองตามหมวด">
              <option value="">ทุกหมวด</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => pickAll(!allShownPicked)} disabled={!shown.length}>
              {allShownPicked ? "ไม่เลือกที่แสดงอยู่" : `เลือกที่แสดงอยู่ (${shown.length})`}
            </button>
          </div>
          <ul className="ntc-pick" aria-label="รายการสินค้า">
            {shown.map((p) => (
              <li key={p.id}>
                <label className={picked.has(p.id) ? "is-on" : undefined}>
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span>{p.label}</span>
                  {p.acc && <em>อุปกรณ์เสริม</em>}
                </label>
              </li>
            ))}
            {!shown.length && <li className="ntc-empty">ไม่พบสินค้า</li>}
          </ul>
        </fieldset>
      </div>

      <aside className="ntc-side">
        <div className="ntc-prev">
          <span className="ntc-prev-h">ตัวอย่างหน้าสินค้า</span>
          <div className="ntc-prev-buy" aria-hidden="true"><i /><i /></div>
          {d.text.replace(/\*\*/g, "").trim() ? <NoticeBox n={d} /> : <p className="ntc-prev-empty">พิมพ์ข้อความเพื่อดูตัวอย่าง</p>}
        </div>
        <label className="chk-row ntc-active"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> เปิดใช้งาน (แสดงหน้าร้าน)</label>
        <button type="button" className="btn btn-primary ntc-save" onClick={save} disabled={busy}>{busy ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มข้อความ"}</button>
      </aside>
    </div>
  );
}
