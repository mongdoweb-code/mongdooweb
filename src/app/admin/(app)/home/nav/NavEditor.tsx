"use client";
// ตัวแก้ไขเมนูหลักหน้าร้าน: เปิด/ปิดแต่ละเมนู · ลาก/↑↓ เรียงลำดับ · เปลี่ยนชื่อ · ลิงก์เพิ่มเอง (≤5) · ไอคอนด้านขวา · ตัวอย่างแถบเมนูสด
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NAV_BUILTINS, NAV_CUSTOM_MAX, NAV_ICONS, NAV_LABEL_MAX, NAV_VISIBLE_MAX, type NavIconKey, type NavItem, type NavMenu } from "@/lib/nav-menu";
import { notifySave } from "../../../_components/save-notify";

const NOTE = new Map(NAV_BUILTINS.map((b) => [b.key, b]));
type Res = { ok?: string; error?: string; field?: string };

export function NavEditor({ initial, custom, action }: { initial: NavMenu; custom: boolean; action: (f: FormData) => Promise<Res> }) {
  const router = useRouter();
  const [items, setItems] = useState<NavItem[]>(initial.items);
  const [icons, setIcons] = useState(initial.icons);
  const [res, setRes] = useState<Res>({});
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState<number | null>(null);
  const shown = items.filter((i) => i.show).length;
  const customs = items.filter((i) => i.custom).length;

  const upd = (k: string, p: Partial<NavItem>) => setItems((xs) => xs.map((x) => (x.key === k ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => setItems((xs) => {
    const j = i + d;
    if (j < 0 || j >= xs.length) return xs;
    const n = [...xs];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const dropAt = (to: number) => {
    if (drag === null || drag === to) return setDrag(null);
    setItems((xs) => { const n = [...xs]; const [m] = n.splice(drag, 1); n.splice(to, 0, m); return n; });
    setDrag(null);
  };
  const addCustom = () => {
    const used = new Set(items.map((i) => i.key));
    let n = 1;
    while (used.has(`c${n}`)) n++;
    setItems((xs) => [...xs, { key: `c${n}`, label: "", href: "", show: true, custom: true, newTab: false }]);
  };
  const submit = (intent?: "reset") => {
    const fd = new FormData();
    if (intent) fd.set("intent", intent);
    fd.set("data", JSON.stringify({ items: items.map(({ key, label, href, show, newTab, custom }) => (custom ? { key, label, href, show, newTab } : { key, label, show })), icons }));
    start(async () => {
      const r = await action(fd);
      setRes(r);
      notifySave(r.error ? { ok: false, message: r.error, fields: r.field ? [r.field] : undefined } : { ok: true, message: r.ok });
      if (!r.error) router.refresh();
    });
  };
  const bad = (f: string) => (res.field === f ? " bad" : "");

  return (
    <div className="nav-ed">
      {res.error && <div className="login-err" role="alert">{res.error}</div>}
      <section className="box">
        <h3>ตัวอย่างแถบเมนู</h3>
        <div className="nav-pv" aria-label="ตัวอย่างแถบเมนูหน้าร้าน">
          <span className="nav-pv-logo">มองดูเว็บ</span>
          <span className="nav-pv-items">
            {items.filter((i) => i.show).map((i) => <span key={i.key}>{i.label || <em>ไม่มีชื่อ</em>}{i.key === "cats" ? " ▾" : ""}</span>)}
          </span>
          <span className="nav-pv-icons" aria-hidden="true">{icons.theme && "☀"} {icons.search && "🔍"} {icons.track && "👤"} {icons.wishlist && "♡"} 🛒</span>
        </div>
        <p className="sub">แสดงอยู่ {shown}/{NAV_VISIBLE_MAX} เมนู · ถ้าเมนูยาวเกินความกว้างจอ หน้าร้านจะเปลี่ยนเป็นเมนู ☰ ให้อัตโนมัติ · บนมือถือเมนูเดียวกันอยู่ในเมนูข้าง</p>
      </section>

      <section className="box">
        <div className="nav-ed-head"><h3>เมนูหลัก</h3><small className="sub">ลาก ⋮⋮ หรือกด ↑ ↓ เพื่อเรียง · สวิตช์ = แสดง/ซ่อน · พิมพ์ชื่อใหม่ได้</small></div>
        <ol className="nav-list" id="navList">
          {items.map((it, i) => {
            const b = NOTE.get(it.key);
            return (
              <li key={it.key} data-key={it.key} className={`${it.show ? "" : "off"}${drag === i ? " dragging" : ""}`} draggable
                onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropAt(i)} onDragEnd={() => setDrag(null)}>
                <span className="nav-grip" aria-hidden="true">⋮⋮</span>
                <button type="button" role="switch" aria-checked={it.show} className={`sw${it.show ? " on" : ""}`} aria-label={`แสดงเมนู ${it.label || it.key}`} onClick={() => upd(it.key, { show: !it.show })}><span className="sw-knob" aria-hidden="true" /></button>
                <div className="nav-fields">
                  <input aria-label={`ชื่อเมนู ${b?.label ?? it.key}`} className={`nav-label${bad(`label-${it.key}`)}`} value={it.label} maxLength={NAV_LABEL_MAX} placeholder={b?.label ?? "ชื่อเมนู"} onChange={(e) => upd(it.key, { label: e.target.value })} />
                  {it.custom ? (
                    <>
                      <input aria-label={`ลิงก์ของ ${it.label || "เมนูที่เพิ่มเอง"}`} className={`nav-href${bad(`href-${it.key}`)}`} value={it.href} maxLength={300} placeholder="/blog หรือ https://…" onChange={(e) => upd(it.key, { href: e.target.value, newTab: /^https:/i.test(e.target.value) ? it.newTab : false })} />
                      {/^https:/i.test(it.href) && <label className="chk-row nav-newtab"><input type="checkbox" checked={it.newTab} onChange={(e) => upd(it.key, { newTab: e.target.checked })} /> เปิดแท็บใหม่</label>}
                    </>
                  ) : (
                    <small className="sub nav-meta">{b?.href || "—"}{b?.note ? ` · ${b.note}` : ""}{b && it.label !== b.label && it.label ? <> · <button type="button" className="link" onClick={() => upd(it.key, { label: b.label })}>ใช้ชื่อเดิม</button></> : null}</small>
                  )}
                </div>
                <div className="nav-acts">
                  <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`เลื่อน ${it.label} ขึ้น`}>↑</button>
                  <button type="button" className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`เลื่อน ${it.label} ลง`}>↓</button>
                  {it.custom && <button type="button" className="icon-btn sm del" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} aria-label={`ลบเมนู ${it.label || "ที่เพิ่มเอง"}`}>✕</button>}
                </div>
              </li>
            );
          })}
        </ol>
        {customs < NAV_CUSTOM_MAX && <button type="button" className="btn btn-outline" onClick={addCustom}>+ เพิ่มลิงก์เอง ({customs}/{NAV_CUSTOM_MAX})</button>}
      </section>

      <section className="box">
        <h3>ไอคอนด้านขวาของแถบเมนู</h3>
        <div className="nav-icons">
          {(Object.keys(NAV_ICONS) as NavIconKey[]).map((k) => (
            <label key={k} className="chk-row"><input type="checkbox" checked={icons[k]} onChange={(e) => setIcons({ ...icons, [k]: e.target.checked })} /> {NAV_ICONS[k]}</label>
          ))}
          <label className="chk-row off"><input type="checkbox" checked disabled /> ตะกร้าสินค้า (แสดงเสมอ)</label>
        </div>
      </section>

      <div className="act-row nav-save">
        {custom && <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => submit("reset")}>คืนค่าเมนูเดิม</button>}
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => submit()}>{pending ? "กำลังบันทึก…" : "บันทึกเมนู"}</button>
      </div>
    </div>
  );
}
