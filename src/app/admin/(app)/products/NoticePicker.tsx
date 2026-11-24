"use client";
// ข้อความแจ้งเตือนในหน้าแก้ไขสินค้า (#sec-notice): ติ๊กเลือกจากคลัง · ข้อความอัตโนมัติ (ทุกสินค้า/ตามหมวด) ปิดเฉพาะตัวนี้ได้ · สร้างข้อความใหม่แล้วใช้ทันที
// ส่งค่าเป็น JSON ใน <input name="notices"> → saveProduct (ตรวจ id กับคลังที่ server)
import { useState } from "react";
import { NoticeBox } from "@/components/notice/NoticeBox";
import { NOTICE_MAX_PER_PRODUCT, autoApplies, type NoticeRow } from "@/lib/notices";
import { notifySave } from "../../_components/save-notify";
import { saveNotice } from "../notices/actions";
import { NoticeFields, type NoticeDraft } from "../notices/NoticeFields";
import "../notices/notices.css";

const EMPTY: NoticeDraft = { text: "", tone: "WARNING", icon: "bolt" };

export function NoticePicker({ lib: lib0, init, categoryId, categoryName, isAccessory }: {
  lib: NoticeRow[]; init: { ids: string[]; off: string[] }; categoryId: string; categoryName: (id: string) => string | undefined; isAccessory: boolean;
}) {
  const [lib, setLib] = useState(lib0);
  const [ids, setIds] = useState<string[]>(init.ids);
  const [off, setOff] = useState<string[]>(init.off);
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState<NoticeDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string[]>([]);

  const p = { categoryId, isAccessory };
  const isAuto = (n: NoticeRow) => autoApplies(n, p);
  const isOn = (n: NoticeRow) => n.isActive && (ids.includes(n.id) || (isAuto(n) && !off.includes(n.id)));
  // แสดง: ข้อความที่เปิดใช้งานทั้งหมด + ตัวที่ปิดใช้งานแต่สินค้านี้เลือกไว้
  const rows = lib.filter((n) => n.isActive || ids.includes(n.id));
  const onCount = rows.filter(isOn).length;

  function toggle(n: NoticeRow, on: boolean) {
    if (isAuto(n)) {
      // อัตโนมัติ: ติ๊กออก = ปิดเฉพาะสินค้านี้
      setOff((o) => (on ? o.filter((x) => x !== n.id) : [...o, n.id]));
      if (!on) setIds((s) => s.filter((x) => x !== n.id));
    } else setIds((s) => (on ? [...s, n.id] : s.filter((x) => x !== n.id)));
  }

  async function create() {
    setBusy(true);
    const r = await saveNotice({ text: d.text, tone: d.tone, icon: d.icon, scope: "MANUAL" });
    setBusy(false);
    setBad(r.fields ?? []);
    notifySave(r.error ? { ok: false, message: r.error, fields: r.fields?.map((f) => `pn-${f}`) } : { ok: true, title: "สร้างข้อความแล้ว", message: "ติ๊กใช้กับสินค้านี้แล้ว — กด “บันทึกสินค้า” เพื่อแสดงหน้าร้าน" });
    if (!r.notice) return;
    setLib((l) => [...l, r.notice!]);
    setIds((s) => [...s, r.notice!.id]);
    setD(EMPTY);
    setAdding(false);
  }

  const scopeTag = (n: NoticeRow) =>
    n.scope === "ALL" ? "ทุกสินค้า" : n.scope === "CATEGORIES" ? (n.categoryIds.includes(categoryId) ? `หมวด ${categoryName(categoryId) ?? ""}` : "ตามหมวดอื่น") : null;

  return (
    <div className="box" id="sec-notice">
      <div className="pn-head">
        <h3>ข้อความแจ้งเตือน (ใต้ปุ่มสั่งซื้อ)</h3>
        <a className="link" href="/admin/notices" target="_blank" rel="noopener">จัดการคลังข้อความ ↗</a>
      </div>
      <p className="pn-sub">ติ๊กข้อความที่ต้องการแสดงในหน้าสินค้านี้ · ข้อความ “อัตโนมัติ” มาจากการตั้งค่าในคลัง ติ๊กออกเพื่อปิดเฉพาะสินค้านี้</p>
      <input type="hidden" name="notices" value={JSON.stringify({ ids, off })} />

      {rows.length > 0 && (
        <ul className="pn-list">
          {rows.map((n) => {
            const on = isOn(n), auto = isAuto(n), tag = scopeTag(n);
            const full = !on && onCount >= NOTICE_MAX_PER_PRODUCT;
            return (
              <li key={n.id}>
                <label className={`pn-item${on ? " is-on" : ""}`}>
                  <input type="checkbox" checked={on} disabled={full || !n.isActive} onChange={(e) => toggle(n, e.target.checked)} aria-label={`แสดง ${n.name}`} />
                  <span className="pn-body">
                    <span className="pn-meta">
                      <b>{n.name}</b>
                      {auto && <span className="pn-tag auto">อัตโนมัติ · {tag}</span>}
                      {auto && off.includes(n.id) && <span className="pn-tag off">ปิดเฉพาะสินค้านี้</span>}
                      {!auto && tag && <span className="pn-tag">{tag}</span>}
                      {!n.isActive && <span className="pn-tag off">ปิดใช้งานในคลัง</span>}
                    </span>
                    <NoticeBox n={n} />
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="pn-new">
          <NoticeFields v={d} set={(x) => setD((o) => ({ ...o, ...x }))} uid="pn-" invalid={bad} />
          {d.text.replace(/\*\*/g, "").trim() && (
            <div className="pn-new-prev"><span>ตัวอย่างหน้าร้าน</span><NoticeBox n={d} /></div>
          )}
          <div className="pn-new-acts">
            <button type="button" className="btn btn-primary btn-sm" onClick={create} disabled={busy}>{busy ? "กำลังสร้าง…" : "สร้างและใช้กับสินค้านี้"}</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAdding(false); setD(EMPTY); setBad([]); }}>ยกเลิก</button>
          </div>
        </div>
      ) : (
        <div className="pn-foot">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAdding(true)}>+ สร้างข้อความใหม่</button>
          <span className="pn-count">หน้าสินค้าจะแสดง <b>{onCount}</b> ข้อความ{onCount >= NOTICE_MAX_PER_PRODUCT ? ` (สูงสุด ${NOTICE_MAX_PER_PRODUCT})` : ""}</span>
        </div>
      )}
    </div>
  );
}
