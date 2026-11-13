"use client";
// แถบเมนูด่วนด้านบนหลังบ้าน (ซ้ายของช่องค้นหา): ไอคอน + ข้อความ · ไฮไลต์หน้าปัจจุบัน · ปุ่ม ⚙ ตั้งค่าว่าจะแสดงเมนูไหน/เรียงลำดับ (แต่ละคนตั้งเอง)
// จอเล็ก: เหลือไอคอน เลื่อนซ้ายขวาได้ · รายการ/สิทธิ์อยู่ใน src/lib/quick-menu.ts · บันทึกด้วย saveQuickMenu (ตรวจซ้ำที่เซิร์ฟเวอร์)
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { QUICK_DEFAULT, QUICK_MAX, type QuickItem } from "@/lib/quick-menu";
import { saveQuickMenu } from "../quick-menu-actions";
import { Ico, type IconKey } from "./admin-icons";
import "./quickbar.css";

const Icon = ({ it }: { it: QuickItem }) => (
  <span className="qb-ic">
    <Ico k={it.icon as IconKey} />
    {it.create && <i className="qb-plus" aria-hidden="true" />}
  </span>
);

/** หน้าปัจจุบันตรงกับเมนูไหน: href ที่ยาวที่สุดที่ตรง (/admin = คำสั่งซื้อ ต้องตรงเป๊ะ) */
function activeKey(items: QuickItem[], path: string) {
  let best: QuickItem | null = null;
  for (const it of items) {
    if (it.external) continue;
    const hit = path === it.href || (it.href !== "/admin" && path.startsWith(it.href + "/"));
    if (hit && (!best || it.href.length > best.href.length)) best = it;
  }
  return best?.key ?? "";
}

export function QuickBar({ selected, available }: { selected: string[]; available: QuickItem[] }) {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const byKey = new Map(available.map((i) => [i.key, i]));
  const items = selected.flatMap((k) => (byKey.get(k) ? [byKey.get(k)!] : []));
  const act = activeKey(items, path);
  return (
    <nav className="qbar" aria-label="เมนูด่วน">
      <ul className="qb-list">
        {items.map((it) => (
          <li key={it.key}>
            <Link href={it.href} className={`qb-a${act === it.key ? " on" : ""}${it.create ? " qb-new" : ""}`} aria-current={act === it.key ? "page" : undefined}
              title={it.label} {...(it.external ? { target: "_blank", rel: "noopener" } : {})} prefetch={false}>
              <Icon it={it} />
              <span className="qb-t">{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" className={`qb-cfg${items.length ? "" : " empty"}`} onClick={() => setOpen(true)} aria-haspopup="dialog" title="ตั้งค่าเมนูด่วน" aria-label="ตั้งค่าเมนูด่วน">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
        {!items.length && <span>เมนูด่วน</span>}
      </button>
      {open && <QuickSettings key={selected.join(",")} selected={items.map((i) => i.key)} available={available} onClose={() => setOpen(false)} />}
    </nav>
  );
}

function QuickSettings({ selected, available, onClose }: { selected: string[]; available: QuickItem[]; onClose: () => void }) {
  const [sel, setSel] = useState(selected);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const dlg = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    dlg.current?.querySelector<HTMLElement>("input,button")?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, []);
  const byKey = new Map(available.map((i) => [i.key, i]));
  const groups = [...new Set(available.map((i) => i.group))];
  const full = sel.length >= QUICK_MAX;
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= QUICK_MAX ? s : [...s, k]));
  const move = (i: number, d: -1 | 1) =>
    setSel((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const save = (keys: string[] | null) =>
    start(async () => {
      const r = await saveQuickMenu(keys);
      setMsg(r);
      if (r.ok) closeRef.current();
    });
  return (
    <div className="qb-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qb-dlg" role="dialog" aria-modal="true" aria-labelledby="qbTitle" ref={dlg}>
        <div className="qb-head">
          <h2 id="qbTitle">ตั้งค่าเมนูด่วน</h2>
          <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose}>✕</button>
        </div>
        <p className="qb-sub">เลือกเมนูที่ใช้บ่อย (สูงสุด {QUICK_MAX} เมนู) และจัดลำดับ — ตั้งค่านี้ใช้กับบัญชีของคุณเท่านั้น</p>
        <div className="qb-cols">
          <section aria-labelledby="qbPick">
            <h3 id="qbPick">เมนูทั้งหมด</h3>
            {groups.map((g) => (
              <fieldset key={g} className="qb-grp">
                <legend>{g}</legend>
                {available.filter((i) => i.group === g).map((it) => {
                  const on = sel.includes(it.key);
                  return (
                    <label key={it.key} className={`qb-opt${on ? " on" : ""}${!on && full ? " off" : ""}`}>
                      <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(it.key)} />
                      <Icon it={it} />
                      <span>{it.label}</span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </section>
          <section aria-labelledby="qbOrder" className="qb-order">
            <h3 id="qbOrder">แสดงบนแถบ <span className={full ? "qb-n full" : "qb-n"}>{sel.length}/{QUICK_MAX}</span></h3>
            {sel.length ? (
              <ol>
                {sel.map((k, i) => {
                  const it = byKey.get(k)!;
                  return (
                    <li key={k}>
                      <Icon it={it} />
                      <span className="qb-ol-t">{it.label}</span>
                      <button type="button" aria-label={`เลื่อนขึ้น: ${it.label}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" aria-label={`เลื่อนลง: ${it.label}`} disabled={i === sel.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button type="button" aria-label={`เอาออก: ${it.label}`} onClick={() => toggle(k)}>✕</button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="qb-none">ยังไม่ได้เลือกเมนู — แถบจะเหลือแค่ปุ่มตั้งค่า</p>
            )}
          </section>
        </div>
        {msg.error && <div className="login-err" role="alert">{msg.error}</div>}
        <div className="qb-foot">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => { setSel(QUICK_DEFAULT.filter((k) => byKey.has(k))); save(null); }}>คืนค่าเริ่มต้น</button>
          <span className="spacer" />
          <button type="button" className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => save(sel)}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </div>
    </div>
  );
}
