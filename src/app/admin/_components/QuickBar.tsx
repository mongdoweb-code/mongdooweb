"use client";
// แถบเมนูด่วนด้านบนหลังบ้าน (ซ้ายของช่องค้นหา): ไอคอน + ข้อความ · ไฮไลต์หน้าปัจจุบัน · ปุ่ม ⚙ ตั้งค่าว่าจะแสดงเมนูไหน/เรียงลำดับ (แต่ละคนตั้งเอง)
// จอเล็ก: เหลือไอคอน เลื่อนซ้ายขวาได้ · รายการ/สิทธิ์อยู่ใน src/lib/quick-menu.ts · บันทึกด้วย saveQuickMenu (ตรวจซ้ำที่เซิร์ฟเวอร์)
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type Dispatch, type RefObject, type SetStateAction } from "react";
import { QUICK_DEFAULT, QUICK_MAX, type QuickItem } from "@/lib/quick-menu";
import { saveQuickMenu } from "../quick-menu-actions";
import { Ico, type IconKey } from "./admin-icons";
import "./quickbar.css";
import { notifySave } from "./save-notify";

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
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const dlg = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  /** กำลังลากอยู่: Esc ยกเลิกการลากแทนการปิดหน้าต่าง */
  const dragRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    dlg.current?.querySelector<HTMLElement>("input,button")?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dragRef.current) dragRef.current();
      else closeRef.current();
    };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, []);
  const byKey = new Map(available.map((i) => [i.key, i]));
  const groups = [...new Set(available.map((i) => i.group))];
  const full = sel.length >= QUICK_MAX;
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= QUICK_MAX ? s : [...s, k]));
  const save = (keys: string[] | null) =>
    start(async () => {
      const r = await saveQuickMenu(keys);
      setMsg(r);
      notifySave(r.error ? { ok: false, message: r.error } : { ok: true, message: r.ok || "บันทึกเมนูด่วนแล้ว" });
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
          <section aria-labelledby="qbPick" className="qb-pick">
            <div className="qb-pick-head">
              <h3 id="qbPick">เมนูทั้งหมด <span className="qb-total">{available.length}</span></h3>
              <label className="qb-q">
                <span className="sr-only">ค้นหาเมนู</span>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเมนู เช่น สต็อก, ใบเสร็จ" />
              </label>
            </div>
            <p className="qb-hint">ทุกเมนูด้านซ้ายเลือกได้ที่นี่ — เมนูใหม่จะเพิ่มเข้ามาให้เลือกเอง</p>
            {groups.map((g) => {
              const ql = q.trim().toLowerCase();
              const opts = available.filter((i) => i.group === g && (!ql || i.label.toLowerCase().includes(ql) || g.toLowerCase().includes(ql)));
              if (!opts.length) return null;
              return (
              <fieldset key={g} className="qb-grp">
                <legend>{g} <small>{opts.filter((i) => sel.includes(i.key)).length ? `เลือก ${opts.filter((i) => sel.includes(i.key)).length}` : ""}</small></legend>
                {opts.map((it) => {
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
              );
            })}
            {q.trim() && !available.some((i) => (i.label + i.group).toLowerCase().includes(q.trim().toLowerCase())) && <p className="qb-none">ไม่พบเมนู “{q.trim()}”</p>}
          </section>
          <section aria-labelledby="qbOrder" className="qb-order">
            <OrderList sel={sel} setSel={setSel} byKey={byKey} available={available} toggle={toggle} dragRef={dragRef} />
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

/** ย้ายรายการจากตำแหน่ง from ไป to (ตัวอื่นเลื่อนตาม) */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const t = Math.max(0, Math.min(list.length - 1, to));
  if (from === t || from < 0 || from >= list.length) return list;
  const n = [...list];
  const [x] = n.splice(from, 1);
  n.splice(t, 0, x);
  return n;
}

/**
 * แผง "แสดงบนแถบ": เลขลำดับ (พิมพ์แล้ว Enter = ย้าย) · ลากวางด้วยเมาส์/นิ้ว (pointer events — แถวอื่นเลื่อนหลบ, ป้าย "วางที่ลำดับ n", Esc ยกเลิก)
 * · ปุ่มจับ ⠿ ใช้คีย์บอร์ด ↑ ↓ Home End · ปุ่ม ↑ ↓ ✕ เดิม · เรียงด่วนตามหมวดเมนู / ก–ฮ
 */
function OrderList({ sel, setSel, byKey, available, toggle, dragRef }: {
  sel: string[]; setSel: Dispatch<SetStateAction<string[]>>; byKey: Map<string, QuickItem>; available: QuickItem[]; toggle: (k: string) => void;
  dragRef: RefObject<null | (() => void)>;
}) {
  const [drag, setDrag] = useState<{ from: number; over: number; dy: number; step: number } | null>(null);
  const [edit, setEdit] = useState<{ key: string; text: string } | null>(null);
  /** Esc ในช่องเลข = ไม่ย้าย (blur ทำงานก่อน state ใหม่จะมา) */
  const skipEdit = useRef(false);
  /** หลังย้ายด้วยคีย์บอร์ด/ปุ่ม ให้โฟกัสตามรายการที่ย้าย */
  const focusKey = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const moveTo = (from: number, to: number, refocus = true) => { setSel((s) => moveItem(s, from, to)); focusKey.current = refocus ? (sel[from] ?? null) : null; };
  useLayoutEffect(() => {
    if (!focusKey.current) return;
    listRef.current?.querySelector<HTMLElement>(`[data-qb-key="${focusKey.current}"] .qb-grip`)?.focus();
    focusKey.current = null;
  }, [sel]);

  const startDrag = (e: React.PointerEvent<HTMLLIElement>, i: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button:not(.qb-grip),input")) return;
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(":scope > li[data-qb-key]") ?? [])];
    if (rows.length < 2) return;
    e.preventDefault();
    // pointerdown ไม่กันการลากคลุมข้อความ → ล้าง selection ที่เกิดแล้ว (ไม่งั้นแถวอื่นถูกไฮไลต์ระหว่างลาก)
    getSelection()?.removeAllRanges();
    const li = e.currentTarget;
    li.setPointerCapture(e.pointerId);
    const mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
    const step = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top;
    const y0 = e.clientY;
    let cur = { from: i, over: i, dy: 0, step };
    setDrag(cur);
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      const y = mids[i] + dy;
      let over = mids.findIndex((m) => y < m);
      if (over === -1) over = mids.length - 1;
      else if (over > i) over -= 1;
      cur = { ...cur, dy, over };
      setDrag(cur);
    };
    const end = (commit: boolean) => {
      li.removeEventListener("pointermove", onMove);
      li.removeEventListener("pointerup", up);
      li.removeEventListener("pointercancel", cancel);
      dragRef.current = null;
      setDrag(null);
      if (commit && cur.over !== cur.from) moveTo(cur.from, cur.over, false);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    li.addEventListener("pointermove", onMove);
    li.addEventListener("pointerup", up);
    li.addEventListener("pointercancel", cancel);
    dragRef.current = cancel;
  };

  /** แถวอื่นเลื่อนหลบระหว่างลาก */
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -drag.step;
    if (drag.from > drag.over && i >= drag.over && i < drag.from) return drag.step;
    return 0;
  };
  /** ยืนยันเลขที่พิมพ์ (ครั้งเดียวตอนออกจากช่อง — Enter แค่ blur) · หาตำแหน่งจาก key ไม่ใช่ index เดิม */
  const commitEdit = () => {
    if (!edit) return;
    if (skipEdit.current) { skipEdit.current = false; setEdit(null); return; }
    const n = parseInt(edit.text, 10);
    const from = sel.indexOf(edit.key);
    setEdit(null);
    if (from >= 0 && Number.isFinite(n) && n >= 1 && n - 1 !== from) moveTo(from, n - 1, false);
  };
  const order = new Map(available.map((it, k) => [it.key, k]));
  /** เลขที่แสดงระหว่างลาก = ลำดับใหม่หลังวาง */
  const preview = drag ? moveItem(sel, drag.from, drag.over) : sel;
  const free = QUICK_MAX - sel.length;

  return (
    <>
      <div className="qb-oh">
        <h3 id="qbOrder">แสดงบนแถบ <span className={free <= 0 ? "qb-n full" : "qb-n"}>{sel.length}/{QUICK_MAX}</span></h3>
        {sel.length > 1 && <span className="qb-oh-hint">ลาก ⠿ หรือพิมพ์เลขเพื่อย้าย</span>}
      </div>
      <p className="qb-hint">เลขด้านหน้า = ลำดับบนแถบจากซ้ายไปขวา</p>
      {sel.length ? (
        <ol ref={listRef} className={drag ? "qb-dragging" : undefined}>
          {sel.map((k, i) => {
            const it = byKey.get(k)!;
            const lifted = drag?.from === i;
            const editing = edit?.key === k;
            return (
              <li key={k} data-qb-key={k} className={lifted ? "lift" : undefined} onPointerDown={(e) => startDrag(e, i)}
                onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("input")) e.preventDefault(); }}
                style={lifted ? { transform: `translateY(${drag!.dy}px)` } : shift(i) ? { transform: `translateY(${shift(i)}px)` } : undefined}>
                {lifted && <span className="qb-drop-tip" role="status">วางที่ลำดับ {drag!.over + 1}</span>}
                <button type="button" className="qb-grip" aria-label={`ลากเพื่อจัดลำดับ: ${it.label} (หรือกดลูกศรขึ้น/ลง)`} title="ลากเพื่อจัดลำดับ"
                  onKeyDown={(e) => {
                    const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? sel.length - 1 : null;
                    if (to === null) return;
                    e.preventDefault();
                    moveTo(i, to);
                  }}>⠿</button>
                <input className="qb-num" inputMode="numeric" aria-label={`ลำดับของ ${it.label}`} value={editing ? edit!.text : String(preview.indexOf(k) + 1)}
                  onFocus={(e) => { setEdit({ key: k, text: String(i + 1) }); e.currentTarget.select(); }}
                  onChange={(e) => setEdit({ key: k, text: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); skipEdit.current = true; e.currentTarget.blur(); } }} />
                <Icon it={it} />
                <span className="qb-ol-t">{it.label}</span>
                <span className="qb-ol-acts">
                  <button type="button" aria-label={`เลื่อนขึ้น: ${it.label}`} disabled={i === 0} onClick={() => moveTo(i, i - 1)}>↑</button>
                  <button type="button" aria-label={`เลื่อนลง: ${it.label}`} disabled={i === sel.length - 1} onClick={() => moveTo(i, i + 1)}>↓</button>
                  <button type="button" className="qb-x" aria-label={`เอาออก: ${it.label}`} onClick={() => toggle(k)}>✕</button>
                </span>
              </li>
            );
          })}
          {free > 0 && <li className="qb-free" aria-hidden="true">ช่องว่าง {free} ช่อง — ติ๊กเมนูทางซ้ายเพื่อเพิ่ม</li>}
        </ol>
      ) : (
        <p className="qb-none">ยังไม่ได้เลือกเมนู — แถบจะเหลือแค่ปุ่มตั้งค่า</p>
      )}
      {sel.length > 1 && (
        <div className="qb-sort" role="group" aria-label="เรียงด่วน">
          <span>เรียงด่วน:</span>
          <button type="button" onClick={() => setSel((s) => [...s].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)))}>ตามหมวดเมนู</button>
          <button type="button" onClick={() => setSel((s) => [...s].sort((a, b) => (byKey.get(a)?.label ?? "").localeCompare(byKey.get(b)?.label ?? "", "th")))}>ก–ฮ</button>
        </div>
      )}
    </>
  );
}
