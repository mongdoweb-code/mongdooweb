"use client";
// ตัวแก้ไขตัวอักษร: แท็บหลังบ้าน/หน้าร้าน · ชุดสำเร็จรูป · ค่ารวม (ฟอนต์ไทย/อังกฤษ ขนาด A−/A+ ความหนา ระยะบรรทัด/ตัวอักษร สี)
// · ปรับแยกแต่ละส่วน (ฟอนต์ ขนาด B I U Aa ความหนา สี ระยะตัวอักษร ⟲) · ตัวอย่างสดใช้ CSS ชุดเดียวกับหน้าจริง (typographyCss กับราก .ty-pv)
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AREAS, BASE_DEFAULT, FONT_GROUPS, LATIN_FONTS, LETTER_SPACINGS, LINE_HEIGHTS, PRESETS, THAI_FONTS, WEIGHTS, WEIGHT_LABEL,
  BASE_MAX, BASE_MIN, SIZE_MAX, SIZE_MIN, areaSize, areaSummary, contrast, emptyScope, familiesUrl, googleFontsUrl, isDefaultScope, typographyCss,
  type AreaDef, type AreaStyle, type FontGroup, type Kind, type Scope, type Typography,
} from "@/lib/typography";
import { useFormAction } from "../../../_components/useFormAction";
import { saveTypography, type TypoState } from "./actions";
import "./typography.css";

type State = Record<Kind, Scope>;
const fromInit = (t: Typography): State => ({ admin: t.admin ?? emptyScope("admin"), shop: t.shop ?? emptyScope("shop") });
const SWATCH: Record<"text" | "dark", string[]> = { text: ["#1C1C1C", "#333333", "#3B3934", "#1D4E96", "#C2410C"], dark: ["#FFFFFF", "#ECE8E0", "#D9D5CC", "#F28B5C"] };
const PV_ROOT = { root: ".ty-pv", body: ".ty-pv", light: ".ty-pv" };

/** โหลดสไตล์ Google Fonts ครั้งเดียวต่อ URL (ตัวอย่างสด + รายการเลือกฟอนต์) */
function useFontLink(url: string | null) {
  useEffect(() => {
    if (!url || document.querySelector(`link[data-ty-font="${CSS.escape(url)}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = url;
    l.dataset.tyFont = url;
    document.head.appendChild(l);
  }, [url]);
}

export function TypographyEditor({ init }: { init: Typography }) {
  const [saved, setSaved] = useState(() => fromInit(init));
  const [st, setSt] = useState<State>(() => fromInit(init));
  const [tab, setTab] = useState<Kind>("admin");
  const [open, setOpen] = useState<string | null>(null);
  const [state, onSubmit, pending] = useFormAction<TypoState>(saveTypography, {});
  const s = st[tab];
  const dirty = JSON.stringify(st) !== JSON.stringify(saved);
  // บันทึกสำเร็จ → ค่าปัจจุบันกลายเป็นค่าที่บันทึกแล้ว
  const okAt = state.ok ? state.at : undefined;
  const lastOk = useRef(okAt);
  if (okAt !== lastOk.current) { lastOk.current = okAt; if (okAt) setSaved(st); }

  const setScope = (fn: (x: Scope) => Scope) => setSt((x) => ({ ...x, [tab]: fn(x[tab]) }));
  const setBase = <K extends keyof Scope["base"]>(k: K, v: Scope["base"][K]) => setScope((x) => ({ ...x, base: { ...x.base, [k]: v } }));
  const setArea = (key: string, patch: Partial<AreaStyle> | null) =>
    setScope((x) => {
      const areas = { ...x.areas };
      const next = patch === null ? {} : { ...areas[key], ...patch };
      for (const k of Object.keys(next) as (keyof AreaStyle)[]) if (next[k] === undefined || next[k] === false || next[k] === "") delete next[k];
      if (Object.keys(next).length) areas[key] = next;
      else delete areas[key];
      return { ...x, areas };
    });

  const css = useMemo(() => typographyCss(s, tab, PV_ROOT), [s, tab]);
  useFontLink(googleFontsUrl([s]));
  const openDef = AREAS[tab].find((a) => a.key === open);
  const payload = JSON.stringify({ admin: isDefaultScope(st.admin, "admin") ? {} : st.admin, shop: isDefaultScope(st.shop, "shop") ? {} : st.shop });

  return (
    <form onSubmit={onSubmit} className="ty">
      <input type="hidden" name="typography" value={payload} />
      <div className="ty-tabs" role="tablist" aria-label="ส่วนของเว็บ">
        {(["admin", "shop"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : undefined} onClick={() => { setTab(k); setOpen(null); }}>
            {k === "admin" ? "หลังบ้าน" : "หน้าร้าน"}
            {!isDefaultScope(st[k], k) && <i className="ty-dot" aria-label="ปรับแล้ว" />}
          </button>
        ))}
      </div>
      <div className="ty-layout">
        <div className="ty-col">
          <section className="box ty-box" aria-labelledby="tyPreset">
            <h3 id="tyPreset">ชุดสำเร็จรูป</h3>
            <p className="ty-hint">กดเพื่อตั้งค่าทั้งหมดในครั้งเดียว แล้วปรับต่อได้ (ส่วนที่ปรับแยกไว้จะถูกล้าง)</p>
            <div className="ty-presets">
              {PRESETS.map((p) => {
                const v = p.apply(tab);
                const on = JSON.stringify(v) === JSON.stringify(s);
                return (
                  <button key={p.key} type="button" className={on ? "on" : undefined} aria-pressed={on} onClick={() => { setScope(() => v); setOpen(null); }} data-preset={p.key}>
                    {p.label}<b>{p.desc}</b>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="box ty-box" aria-labelledby="tyBase">
            <h3 id="tyBase">ค่ารวม</h3>
            <p className="ty-hint">ทุกส่วนใช้ค่านี้ ยกเว้นส่วนที่ปรับแยกไว้</p>
            <Row label="ฟอนต์ภาษาไทย" id="tyThai">
              <FontPicker id="tyThai" value={s.base.thai} onChange={(f) => setBase("thai", f || BASE_DEFAULT[tab].thai)} />
            </Row>
            <Row label="ฟอนต์อังกฤษ/ตัวเลข" id="tyLatin">
              <FontPicker id="tyLatin" latin value={s.base.latin} onChange={(f) => setBase("latin", f)} />
            </Row>
            <Row label="ขนาดพื้นฐาน">
              <SizeCtl value={s.base.size} min={BASE_MIN} max={BASE_MAX} onChange={(v) => setBase("size", v)} name="ขนาดพื้นฐาน" />
              <small className="ty-note">({BASE_MIN}–{BASE_MAX} · ทุกส่วนขยายตามสัดส่วน)</small>
            </Row>
            <Row label="ความหนาปกติ">
              <Seg name="ความหนาปกติ" options={WEIGHTS.map((w) => [w, `${WEIGHT_LABEL[w]} ${w}`])} value={s.base.weight} onChange={(v) => v !== undefined && setBase("weight", v)} />
            </Row>
            <Row label="ระยะบรรทัด">
              <Seg name="ระยะบรรทัด" options={LINE_HEIGHTS.map((v, i) => [v, `${["แน่น", "ปกติ", "โปร่ง"][i]} ${v}`])} value={s.base.lh} onChange={(v) => v !== undefined && setBase("lh", v)} />
            </Row>
            <Row label="ระยะตัวอักษร">
              <Seg name="ระยะตัวอักษร" options={LETTER_SPACINGS.map((v) => [v, v > 0 ? `+${v}` : String(v)])} value={s.base.ls} onChange={(v) => v !== undefined && setBase("ls", v)} />
            </Row>
            <Row label="สีตัวอักษร">
              <ColorCtl value={s.base.color} bg="#FFFFFF" swatches={SWATCH.text} onChange={(v) => setBase("color", v)} name="สีตัวอักษร" />
            </Row>
          </section>

          <section className="box ty-box" aria-labelledby="tyAreas">
            <h3 id="tyAreas">ปรับแยกแต่ละส่วน</h3>
            <p className="ty-hint">คลิกเพื่อแก้ · &quot;ตามค่ารวม&quot; = ยังไม่ได้ปรับ · ⟲ คืนค่าทีละส่วน</p>
            <div className="ty-areas">
              {AREAS[tab].map((d) => (
                <AreaCard key={`${tab}-${d.key}`} d={d} kind={tab} s={s} open={open === d.key} onToggle={() => setOpen((o) => (o === d.key ? null : d.key))} set={(p) => setArea(d.key, p)} />
              ))}
            </div>
          </section>

          <div className="ty-foot">
            <button className="btn btn-primary" type="submit" disabled={pending || !dirty}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
            <button className="btn btn-outline" type="button" disabled={!dirty} onClick={() => { setSt(saved); setOpen(null); }}>ยกเลิกการแก้ไข</button>
            <span className="spacer" />
            <button className="btn btn-outline" type="button" onClick={() => { setScope(() => emptyScope(tab)); setOpen(null); }} disabled={isDefaultScope(s, tab)}>
              คืนค่าเริ่มต้น ({tab === "admin" ? "หลังบ้าน" : "หน้าร้าน"})
            </button>
          </div>
          {state.error && <div className="login-err" role="alert">{state.error}</div>}
        </div>

        <aside className="ty-pv-col" aria-label="ตัวอย่างสด">
          <div className="ty-pv-h"><b>ตัวอย่างสด</b>{dirty && <span className="ty-unsaved">ยังไม่ได้บันทึก</span>}</div>
          <style>{css}</style>
          {openDef && openDef.sel !== "body" && <style>{openDef.sel.split(",").map((x) => `.ty-pv ${x.trim()}`).join(",") + "{outline:2px dashed #F26B38;outline-offset:2px}"}</style>}
          {tab === "admin" ? <AdminPreview /> : <ShopPreview />}
          <p className="ty-note">กรอบประสีส้ม = ส่วนที่กำลังแก้ · สีที่ตั้งใช้กับธีมสว่าง (ธีมมืดใช้สีของธีมเพื่อให้อ่านง่าย) · ฟอนต์โหลดจาก Google Fonts เฉพาะที่เลือก</p>
        </aside>
      </div>
    </form>
  );
}

function Row({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="ty-row">
      {id ? <label htmlFor={id}>{label}</label> : <span className="ty-lbl">{label}</span>}
      <div className="ty-ctl">{children}</div>
    </div>
  );
}

function SizeCtl({ value, min, max, onChange, name, placeholder }: { value: number; min: number; max: number; onChange: (v: number) => void; name: string; placeholder?: boolean }) {
  return (
    <span className="ty-size" role="group" aria-label={name}>
      <button type="button" className="ty-b" aria-label={`ลด${name}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>A−</button>
      <output className={`ty-val${placeholder ? " ph" : ""}`} aria-live="polite">{value} px</output>
      <button type="button" className="ty-b" aria-label={`เพิ่ม${name}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>A+</button>
    </span>
  );
}

function Seg<T extends number>({ name, options, value, onChange, follow }: { name: string; options: [T, string][]; value: T | undefined; onChange: (v: T | undefined) => void; follow?: boolean }) {
  return (
    <span className="ty-seg" role="radiogroup" aria-label={name}>
      {follow && <button type="button" role="radio" aria-checked={value === undefined} className={value === undefined ? "on" : undefined} onClick={() => onChange(undefined)}>ตามค่ารวม</button>}
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : undefined} onClick={() => onChange(v)}>{l}</button>
      ))}
    </span>
  );
}

function ColorCtl({ value, bg, swatches, onChange, name }: { value: string; bg: string; swatches: string[]; onChange: (v: string) => void; name: string }) {
  const ratio = value ? contrast(value, bg) : 21;
  return (
    <span className="ty-colors" role="group" aria-label={name}>
      <button type="button" className={`ty-sw ty-sw-none${value ? "" : " on"}`} aria-pressed={!value} onClick={() => onChange("")} title="ตามธีม">ตามธีม</button>
      {swatches.map((c) => (
        <button key={c} type="button" className={`ty-sw${value === c ? " on" : ""}`} style={{ background: c }} aria-label={`สี ${c}`} aria-pressed={value === c} onClick={() => onChange(c)} />
      ))}
      <label className="ty-pick">
        <span className="sr-only">เลือกสีเอง ({name})</span>
        <input type="color" value={value || "#1C1C1C"} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        🎨 เลือกสี
      </label>
      {value && ratio < 4.5 && <small className="ty-warn" role="status">อ่านยาก (ความคมชัด {ratio.toFixed(1)}:1 — ควร ≥ 4.5)</small>}
    </span>
  );
}

/** เลือกฟอนต์: ค้นหา · แบ่งกลุ่ม · ชื่อแต่ละฟอนต์แสดงด้วยฟอนต์นั้น (โหลดเฉพาะตัวอักษรของชื่อ ไฟล์เล็กมาก) */
function FontPicker({ id, value, onChange, latin, follow }: { id: string; value: string; onChange: (f: string) => void; latin?: boolean; follow?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const list = latin ? LATIN_FONTS.map((x) => ({ f: x.f, g: "latin" as const, note: x.note })) : THAI_FONTS.map((x) => ({ f: x.f, g: x.g, note: x.note }));
  const names = list.map((x) => x.f).filter(Boolean);
  useFontLink(open ? familiesUrl(names, [...new Set(`${names.join("")}กขคงภาษาไทย ABC123`)].join("")) : null);
  useFontLink(value ? familiesUrl([value]) : null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    addEventListener("mousedown", out);
    addEventListener("keydown", esc, true);
    return () => { removeEventListener("mousedown", out); removeEventListener("keydown", esc, true); };
  }, [open]);
  const ql = q.trim().toLowerCase();
  const shown = list.filter((x) => !ql || x.f.toLowerCase().includes(ql) || (x.note ?? "").includes(ql));
  const groups: [string, typeof shown][] = latin
    ? [["ฟอนต์อังกฤษ/ตัวเลข", shown]]
    : (Object.keys(FONT_GROUPS) as FontGroup[]).map((g) => [FONT_GROUPS[g], shown.filter((x) => x.g === g)]);
  const label = value || (follow ? "ตามค่ารวม" : latin ? "ใช้ฟอนต์ไทยเดียวกัน" : "—");
  const pick = (f: string) => { onChange(f); setOpen(false); setQ(""); };
  return (
    <div className="ty-fp" ref={box}>
      <button type="button" id={id} className="ty-fp-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-font-value={value}>
        <span style={value ? { fontFamily: `'${value}', var(--font)` } : undefined}>{label}</span>
        <small>{value ? (latin ? "Google Fonts" : `Google Fonts · ${FONT_GROUPS[(THAI_FONTS.find((x) => x.f === value)?.g ?? "loopless") as FontGroup].split(" ")[0]}`) : ""} ▾</small>
      </button>
      {open && (
        <div className="ty-fp-pop">
          <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={latin ? "ค้นหาฟอนต์อังกฤษ" : `ค้นหาฟอนต์ (${THAI_FONTS.length} ฟอนต์ไทยจาก Google Fonts)`} aria-label="ค้นหาฟอนต์" />
          <div className="ty-fp-list" role="listbox" aria-label="ฟอนต์">
            {follow && <button type="button" role="option" aria-selected={!value} className={`ty-fp-it${!value ? " on" : ""}`} onClick={() => pick("")}>ตามค่ารวม</button>}
            {groups.map(([g, items]) => items.length ? (
              <div key={g}>
                <div className="ty-fp-g">{g}</div>
                {items.map((x) => (
                  <button key={x.f || "same"} type="button" role="option" aria-selected={value === x.f} className={`ty-fp-it${value === x.f ? " on" : ""}`} onClick={() => pick(x.f)} data-font={x.f}>
                    <span style={x.f ? { fontFamily: `'${x.f}', var(--font)` } : undefined}>{x.f || "ใช้ฟอนต์ไทยเดียวกัน"}{value === x.f ? " ✓" : ""}</span>
                    {x.note && <small>{x.note}</small>}
                  </button>
                ))}
              </div>
            ) : null)}
            {!shown.length && <p className="ty-note" style={{ padding: "8px 12px" }}>ไม่พบฟอนต์ “{q}”</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function AreaCard({ d, kind, s, open, onToggle, set }: { d: AreaDef; kind: Kind; s: Scope; open: boolean; onToggle: () => void; set: (p: Partial<AreaStyle> | null) => void }) {
  const a = s.areas[d.key] ?? {};
  const changed = Object.keys(a).length > 0;
  const size = areaSize(s, kind, d);
  const dark = d.bg === "#161616";
  return (
    <div className={`ty-area${open ? " open" : ""}`} data-area={d.key}>
      <div className="ty-area-h">
        <button type="button" className="ty-area-t" aria-expanded={open} onClick={onToggle}>
          <span><b>{d.label}</b><small>{d.hint}</small></span>
          <span className="ty-sum">{areaSummary(s, kind, d)}</span>
          <span className={`ty-pill${changed ? " c" : ""}`}>{changed ? "ปรับแล้ว" : "ตามค่ารวม"}</span>
        </button>
        {changed && <button type="button" className="ty-b ty-reset" onClick={() => set(null)} aria-label={`คืนค่า ${d.label}`} title="คืนค่าส่วนนี้">⟲</button>}
      </div>
      {open && (
        <div className="ty-edit">
          <Row label="ฟอนต์" id={`tyA-${d.key}`}>
            <FontPicker id={`tyA-${d.key}`} follow value={a.font ?? ""} onChange={(f) => set({ font: f || undefined })} />
          </Row>
          <Row label="ขนาด">
            <SizeCtl value={size} min={SIZE_MIN} max={SIZE_MAX} onChange={(v) => set({ size: v })} name={`ขนาด${d.label}`} placeholder={a.size == null} />
            {a.size != null && <button type="button" className="link" onClick={() => set({ size: undefined })}>ตามค่ารวม</button>}
          </Row>
          <Row label="รูปแบบ">
            <span className="ty-fmt" role="group" aria-label={`รูปแบบ${d.label}`}>
              <button type="button" className={`ty-b${a.weight === 700 ? " on" : ""}`} aria-pressed={a.weight === 700} title="ตัวหนา" onClick={() => set({ weight: a.weight === 700 ? undefined : 700 })}><b>B</b></button>
              <button type="button" className={`ty-b${a.italic ? " on" : ""}`} aria-pressed={!!a.italic} title="ตัวเอียง" onClick={() => set({ italic: !a.italic })}><i>I</i></button>
              <button type="button" className={`ty-b${a.underline ? " on" : ""}`} aria-pressed={!!a.underline} title="ขีดเส้นใต้" onClick={() => set({ underline: !a.underline })}><u>U</u></button>
              <button type="button" className={`ty-b${a.upper ? " on" : ""}`} aria-pressed={!!a.upper} title="ตัวพิมพ์ใหญ่ (อังกฤษ)" onClick={() => set({ upper: !a.upper })}>Aa</button>
            </span>
          </Row>
          <Row label="ความหนา">
            <Seg name={`ความหนา${d.label}`} follow options={WEIGHTS.map((w) => [w, String(w)])} value={a.weight as (typeof WEIGHTS)[number] | undefined} onChange={(v) => set({ weight: v })} />
          </Row>
          <Row label="สี">
            <ColorCtl value={a.color ?? ""} bg={d.bg} swatches={dark ? SWATCH.dark : SWATCH.text} onChange={(v) => set({ color: v || undefined })} name={`สี${d.label}`} />
          </Row>
          <Row label="ระยะตัวอักษร">
            <Seg name={`ระยะตัวอักษร${d.label}`} follow options={LETTER_SPACINGS.filter((v) => v !== 0).map((v) => [v, v > 0 ? `+${v}` : String(v)])} value={a.ls as (typeof LETTER_SPACINGS)[number] | undefined} onChange={(v) => set({ ls: v })} />
          </Row>
        </div>
      )}
    </div>
  );
}

/** ตัวอย่างหลังบ้าน: ใช้คลาสเดียวกับหน้าจริง (.side .nav-i · .qb-a · .page-head h1 · .main .btn) */
function AdminPreview() {
  return (
    <div className="ty-pv ty-adm" data-ty-preview="admin">
      <div className="side">
        <div className="ty-pv-sec">งานประจำวัน</div>
        <span className="nav-i">ภาพรวม</span>
        <span className="nav-i on">คำสั่งซื้อ</span>
        <span className="nav-i">คำขอจากลูกค้า</span>
        <span className="nav-i">สินค้า</span>
        <span className="nav-i">สต็อก</span>
      </div>
      <div className="main">
        <div className="ty-pv-qb"><span className="qb-a">ตั้งค่าร้าน</span><span className="qb-a on">คำสั่งซื้อ</span><span className="qb-a">สินค้า</span></div>
        <div className="page-head"><div><h1>คำสั่งซื้อ</h1><p>วันพฤหัสบดีที่ 26 พฤศจิกายน 2569</p></div></div>
        <div className="ty-pv-btns"><span className="btn btn-outline">+ สร้างคำสั่งซื้อ</span><span className="btn btn-primary">ตรวจสลิป →</span></div>
        <table className="ty-pv-tbl"><tbody>
          <tr><td>MDW-261126-0001 · คุณสมชาย</td><td className="r">฿3,050.00</td></tr>
          <tr><td>MDW-261125-0004 · ร้านไฟงาม</td><td className="r">฿12,480.00</td></tr>
        </tbody></table>
      </div>
    </div>
  );
}

/** ตัวอย่างหน้าร้าน: คลาสเดียวกับหน้าจริง (.nav > a · .sec-title · .prod-name · .prod-price · .btn · .footer) */
function ShopPreview() {
  return (
    <div className="ty-pv ty-shop" data-ty-preview="shop">
      <div className="ty-sh-head"><b className="ty-sh-logo">มองดูเว็บ</b><nav className="nav"><a>หน้าแรก</a><a>สินค้าทั้งหมด</a><a>ติดต่อเรา</a></nav></div>
      <div className="ty-sh-body">
        <h2 className="sec-title">ไฟใต้น้ำ สระว่ายน้ำ</h2>
        <p>ไฟ LED กันน้ำ IP68 สแตนเลส 316 รับประกัน 1 ปี จัดส่งทั่วประเทศ</p>
        <div className="ty-sh-card">
          <div className="ty-sh-img" />
          <div>
            <h3 className="prod-name">โคมไฟใต้น้ำ 12W RGB สแตนเลส</h3>
            <div className="prod-price">฿2,500 <s>฿2,900</s></div>
            <span className="btn">ใส่ตะกร้า</span>
          </div>
        </div>
      </div>
      <div className="footer"><b>มองดูเว็บ</b> · โทร 080-884-9597 · LINE @mongdoweb</div>
    </div>
  );
}
