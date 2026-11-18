"use client";
// ตัวแก้ไขหมวดยอดนิยม: การ์ดละ 1 หมวด · รูปการ์ด (อัปโหลดเอง/ลากวาง หรือใช้รูปหมวด) · เลือกสีพื้นรูป (พาสเทล 8 สี หรือ "สีอื่น" จากตารางสี) · ลิงก์ย่อย (พิมพ์เอง หรือกดลิงก์แนะนำ) · ขึ้น/ลง/ลบ · ตัวอย่างสด
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { POPULAR_BG, POPULAR_BG_KEYS, POPULAR_MAX_ITEMS, POPULAR_MAX_LINKS, popularBgColor, popularImgUrl, type PopularBg, type PopularConfig } from "@/lib/popular-cats";
import { ColorPopover } from "../../../_components/ColorPalette";
import { notifySave } from "../../../_components/save-notify";

export type CatOpt = { slug: string; th: string; img: string | null; count: number; visible: boolean; sug: { label: string; href: string }[] };
type Item = { key: number; cat: string; bg: PopularBg; img?: string; links: { label: string; href: string }[] };
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const IMG_MAX = 10 * 1024 * 1024;
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
  // อัปโหลดรูปการ์ด: key การ์ด → กำลังอัปโหลด / ข้อผิดพลาด / ลากไฟล์อยู่เหนือช่อง
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [imgErr, setImgErr] = useState<Record<number, string>>({});
  const [dragOn, setDragOn] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const uploading = Object.values(busy).some(Boolean);
  /** รูปที่การ์ดใช้: อัปโหลดเอง → รูปหมวด/รูปสินค้าตัวแรก */
  const imgOf = (it: Item) => (it.img ? popularImgUrl(it.img) : catOf(it.cat)?.img ?? null);
  const upload = async (key: number, file: File | undefined) => {
    if (!file) return;
    const bad = !IMG_TYPES.includes(file.type) ? "รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ GIF" : file.size > IMG_MAX ? "ไฟล์รูปใหญ่เกิน 10 MB" : "";
    setImgErr((e) => ({ ...e, [key]: bad }));
    if (bad) return;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch("/admin/home/popular/upload", { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { key?: string; error?: string };
      if (!r.ok || !j.key) throw new Error(j.error || "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
      set(key, { img: j.key });
    } catch (e) {
      setImgErr((x) => ({ ...x, [key]: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };
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
    fd.set("data", JSON.stringify({ title, items: items.map(({ cat, bg, img, links }) => ({ cat, bg, ...(img ? { img } : {}), links: links.filter((l) => l.label.trim() || l.href.trim()) })) }));
    start(async () => {
      const r = await action(fd);
      setMsg(r);
      notifySave(r.error ? { ok: false, message: r.error } : { ok: true, title: intent === "reset" ? "คืนค่าสำเร็จ" : "บันทึกสำเร็จ", message: r.ok });
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
                    {imgOf(it) ? <img src={imgOf(it)!} alt="" className={it.img ? "own" : undefined} /> : <span>{c?.th.slice(0, 1)}</span>}
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

              {/* รูปการ์ด: อัปโหลดเอง (คลิก/ลากวาง) หรือใช้รูปหมวดอัตโนมัติ */}
              <div className="pce-img">
                <span className="lbl">รูปการ์ด</span>
                <div className="pce-img-row">
                  <button type="button" className={`pce-drop${dragOn === it.key ? " over" : ""}${busy[it.key] ? " busy" : ""}`}
                    style={{ background: popularBgColor(it.bg) }} aria-label={`${it.img ? "เปลี่ยนรูป" : "อัปโหลดรูป"}การ์ด ${c?.th ?? ""}`}
                    disabled={busy[it.key]} onClick={() => fileRefs.current[it.key]?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOn(it.key); }} onDragLeave={() => setDragOn(null)}
                    onDrop={(e) => { e.preventDefault(); setDragOn(null); void upload(it.key, e.dataTransfer.files?.[0]); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {imgOf(it) ? <img src={imgOf(it)!} alt="" className={it.img ? "own" : undefined} /> : <span className="pce-drop-ph">{c?.th.slice(0, 1)}</span>}
                    {busy[it.key] && <span className="pce-drop-spin" aria-hidden="true" />}
                  </button>
                  <div className="pce-img-info">
                    <span className={`pce-img-src${it.img ? " own" : ""}`}>{it.img ? "รูปที่อัปโหลดเอง" : "รูปหมวด (อัตโนมัติ)"}</span>
                    <div className="pce-img-btns">
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy[it.key]} onClick={() => fileRefs.current[it.key]?.click()}>
                        {busy[it.key] ? "กำลังอัปโหลด…" : it.img ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                      </button>
                      {it.img && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy[it.key]} onClick={() => set(it.key, { img: undefined })}>ใช้รูปหมวดแทน</button>
                      )}
                    </div>
                    <small className="sub">JPG, PNG, WEBP ไม่เกิน 10 MB · แนะนำรูปสี่เหลี่ยมจัตุรัส พื้นโปร่งใสหรือพื้นขาว (จะวางบนสีพื้นด้านล่าง) · ลากไฟล์มาวางที่ช่องรูปได้</small>
                    {imgErr[it.key] && <span className="pce-img-err" role="alert">{imgErr[it.key]}</span>}
                  </div>
                  <input ref={(el) => { fileRefs.current[it.key] = el; }} type="file" accept={IMG_TYPES.join(",")} className="sr-only" tabIndex={-1}
                    aria-label={`ไฟล์รูปการ์ด ${c?.th ?? ""}`} data-pce-file={it.cat}
                    onChange={(e) => { void upload(it.key, e.target.files?.[0]); e.target.value = ""; }} />
                </div>
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
        <button type="button" className="btn btn-primary" disabled={pending || uploading || !items.length} onClick={() => submit("save")}>{pending ? "กำลังบันทึก…" : uploading ? "รออัปโหลดรูป…" : "บันทึก"}</button>
      </div>
    </div>
  );
}
