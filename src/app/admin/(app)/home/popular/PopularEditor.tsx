"use client";
// ตัวแก้ไขหมวดยอดนิยม: การ์ดละ 1 หมวด · เลือกสีพื้นรูป (พาสเทล 8 สี หรือ "สีอื่น" จากตารางสี) · ลิงก์ย่อย (พิมพ์เอง หรือกดลิงก์แนะนำ) · ขึ้น/ลง/ลบ · ตัวอย่างสด
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { POPULAR_BG, POPULAR_BG_KEYS, POPULAR_MAX_ITEMS, POPULAR_MAX_LINKS, popularBgColor, type PopularBg, type PopularConfig } from "@/lib/popular-cats";
import { ColorPopover } from "../../../_components/ColorPalette";

export type CatOpt = { slug: string; th: string; img: string | null; count: number; visible: boolean; sug: { label: string; href: string }[] };
type Item = { key: number; cat: string; bg: PopularBg; links: { label: string; href: string }[] };
let K = 1;

export function PopularEditor({ initial, cats, custom, action }: {
  initial: PopularConfig; cats: CatOpt[]; custom: boolean; action: (f: FormData) => Promise<{ ok?: string; error?: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [items, setItems] = useState<Item[]>(() => initial.items.filter((i) => cats.some((c) => c.slug === i.cat)).map((i) => ({ ...i, key: K++ })));
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const [addCat, setAddCat] = useState("");
  const [colorFor, setColorFor] = useState<number | null>(null);
  const uid = useId();
  const catOf = (slug: string) => cats.find((c) => c.slug === slug);
  const unused = cats.filter((c) => !items.some((i) => i.cat === c.slug));
  const set = (key: number, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setItems((xs) => {
    const n = [...xs];
    const j = i + d;
    if (j < 0 || j >= n.length) return xs;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  const submit = (intent: "save" | "reset") => {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("data", JSON.stringify({ title, items: items.map(({ cat, bg, links }) => ({ cat, bg, links: links.filter((l) => l.label.trim() || l.href.trim()) })) }));
    start(async () => {
      const r = await action(fd);
      setMsg(r);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="pce">
      {msg.error && <div className="login-err" role="alert">{msg.error}</div>}
      {msg.ok && <div className="ok-box" role="status">{msg.ok}</div>}

      <section className="box">
        <h3>ตัวอย่าง</h3>
        <div className="pce-preview" aria-label="ตัวอย่างการ์ดบนหน้าแรก">
          <b className="pce-pv-title">{title || "หมวดหมู่ยอดนิยม"}</b>
          <ul>
            {items.map((it) => {
              const c = catOf(it.cat);
              return (
                <li key={it.key} className="pce-pv-card">
                  <span className="pce-pv-img" style={{ background: popularBgColor(it.bg) }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c?.img ? <img src={c.img} alt="" /> : <span>{c?.th.slice(0, 1)}</span>}
                  </span>
                  <span className="pce-pv-body">
                    <b>{c?.th ?? "—"}</b>
                    {it.links.filter((l) => l.label.trim()).map((l, i) => <span key={i}>{l.label}</span>)}
                    {it.links.filter((l) => l.label.trim()).length < POPULAR_MAX_LINKS && <span className="all">ดูทั้งหมด ({c?.count ?? 0})</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="box">
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor={`${uid}t`}>หัวข้อส่วนนี้</label>
          <input id={`${uid}t`} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="หมวดหมู่ยอดนิยม" />
        </div>
      </section>

      <ol className="pce-list" aria-label="การ์ดหมวด">
        {items.map((it, i) => {
          const c = catOf(it.cat);
          const full = it.links.length >= POPULAR_MAX_LINKS;
          return (
            <li key={it.key} className="box pce-item" data-cat={it.cat}>
              <div className="pce-item-head">
                <span className="pce-n">{i + 1}</span>
                <span className="pce-thumb" style={{ background: popularBgColor(it.bg) }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c?.img ? <img src={c.img} alt="" /> : null}
                </span>
                <label className="sr-only" htmlFor={`${uid}c${it.key}`}>หมวดของการ์ดที่ {i + 1}</label>
                <select id={`${uid}c${it.key}`} value={it.cat} onChange={(e) => set(it.key, { cat: e.target.value, links: [] })}>
                  {[c, ...unused].filter((x): x is CatOpt => !!x).map((x) => (
                    <option key={x.slug} value={x.slug}>{x.th} ({x.count}){x.visible ? "" : " · ซ่อนจากเมนูหน้าแรก"}</option>
                  ))}
                </select>
                <span className="pce-acts">
                  <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`เลื่อน ${c?.th} ขึ้น`}>↑</button>
                  <button type="button" className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`เลื่อน ${c?.th} ลง`}>↓</button>
                  <button type="button" className="icon-btn sm x" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} aria-label={`เอา ${c?.th} ออก`}>✕</button>
                </span>
              </div>

              <div className="pce-bg" role="radiogroup" aria-label={`สีพื้นรูป ${c?.th}`}>
                <span className="lbl">สีพื้นรูป</span>
                {POPULAR_BG_KEYS.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={it.bg === k} aria-label={POPULAR_BG[k].label} title={POPULAR_BG[k].label}
                    style={{ background: POPULAR_BG[k].color }} onClick={() => set(it.key, { bg: k })} />
                ))}
                <span className="pce-more">
                  <button type="button" className={`pce-other${it.bg.startsWith("#") ? " on" : ""}`} aria-haspopup="dialog" aria-expanded={colorFor === it.key}
                    aria-label={it.bg.startsWith("#") ? `สีอื่น (ใช้อยู่ ${it.bg})` : "สีอื่น"} onClick={() => setColorFor(colorFor === it.key ? null : it.key)}>
                    <span className="pce-other-sw" style={it.bg.startsWith("#") ? { background: it.bg } : undefined} aria-hidden="true" />
                    สีอื่น{it.bg.startsWith("#") ? ` ${it.bg}` : ""} ▾
                  </button>
                  <ColorPopover open={colorFor === it.key} onClose={() => setColorFor(null)} label={`สีพื้นรูป ${c?.th ?? ""}`}
                    value={popularBgColor(it.bg)}
                    presets={{ title: "พาสเทลแนะนำ (เข้ากับธีม)", colors: POPULAR_BG_KEYS.map((k) => ({ hex: POPULAR_BG[k].color, name: POPULAR_BG[k].label })) }}
                    onPick={(h) => {
                      const k = POPULAR_BG_KEYS.find((x) => POPULAR_BG[x].color.toUpperCase() === h?.toUpperCase());
                      set(it.key, { bg: k ?? ((h ?? "cream") as PopularBg) });
                      setColorFor(null);
                    }} />
                </span>
              </div>

              <div className="pce-links">
                <span className="lbl">ลิงก์ย่อย ({it.links.length}/{POPULAR_MAX_LINKS}) — ถ้าไม่ครบ 5 จะมี “ดูทั้งหมด” ต่อท้ายให้เอง</span>
                {it.links.map((l, j) => (
                  <div key={j} className="pce-link">
                    <label className="sr-only" htmlFor={`${uid}l${it.key}-${j}`}>ข้อความลิงก์ที่ {j + 1}</label>
                    <input id={`${uid}l${it.key}-${j}`} value={l.label} maxLength={40} placeholder="ข้อความ เช่น แสงขาว"
                      onChange={(e) => set(it.key, { links: it.links.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })} />
                    <label className="sr-only" htmlFor={`${uid}h${it.key}-${j}`}>ลิงก์ที่ {j + 1}</label>
                    <input id={`${uid}h${it.key}-${j}`} value={l.href} maxLength={300} placeholder="/category/... หรือ https://"
                      className={l.href && !/^(\/(?!\/)|https?:\/\/)\S*$/i.test(l.href) ? "bad" : ""}
                      onChange={(e) => set(it.key, { links: it.links.map((x, k) => (k === j ? { ...x, href: e.target.value } : x)) })} />
                    <button type="button" className="icon-btn sm" onClick={() => j > 0 && set(it.key, { links: it.links.map((x, k, a) => (k === j - 1 ? a[j] : k === j ? a[j - 1] : x)) })} disabled={j === 0} aria-label={`เลื่อนลิงก์ ${l.label} ขึ้น`}>↑</button>
                    <button type="button" className="icon-btn sm x" onClick={() => set(it.key, { links: it.links.filter((_, k) => k !== j) })} aria-label={`ลบลิงก์ ${l.label || j + 1}`}>✕</button>
                  </div>
                ))}
                <div className="pce-sug">
                  {(c?.sug ?? []).filter((s) => !it.links.some((l) => l.href === s.href)).map((s) => (
                    <button key={s.href} type="button" className="chip" disabled={full} onClick={() => set(it.key, { links: [...it.links, s] })} title={s.href}>+ {s.label}</button>
                  ))}
                  <button type="button" className="chip" disabled={full} onClick={() => set(it.key, { links: [...it.links, { label: "", href: `/category/${it.cat}` }] })}>+ พิมพ์ลิงก์เอง</button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="box pce-add">
        {items.length < POPULAR_MAX_ITEMS && unused.length > 0 ? (
          <>
            <label htmlFor={`${uid}add`}>เพิ่มหมวด</label>
            <select id={`${uid}add`} value={addCat} onChange={(e) => setAddCat(e.target.value)}>
              <option value="">— เลือกหมวด —</option>
              {unused.map((x) => <option key={x.slug} value={x.slug}>{x.th} ({x.count})</option>)}
            </select>
            <button type="button" className="btn btn-outline" disabled={!addCat} onClick={() => {
              setItems((xs) => [...xs, { key: K++, cat: addCat, bg: POPULAR_BG_KEYS[xs.length % POPULAR_BG_KEYS.length], links: [] }]);
              setAddCat("");
            }}>+ เพิ่มการ์ด</button>
          </>
        ) : (
          <span className="sub">{items.length >= POPULAR_MAX_ITEMS ? `ครบ ${POPULAR_MAX_ITEMS} การ์ดแล้ว` : "ใช้ครบทุกหมวดแล้ว"}</span>
        )}
      </section>

      <div className="pce-bar">
        {custom && (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => { if (confirm("ล้างที่ตั้งไว้ แล้วให้ระบบเลือกหมวดอัตโนมัติ?")) submit("reset"); }}>
            ให้ระบบเลือกอัตโนมัติ
          </button>
        )}
        <span className="sub">{items.length} การ์ด · การ์ดแรกๆ เห็นก่อนบนจอ (คอม 4 ใบ · มือถือ 1 ใบ)</span>
        <button type="button" className="btn btn-primary" disabled={pending || !items.length} onClick={() => submit("save")}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>
    </div>
  );
}
