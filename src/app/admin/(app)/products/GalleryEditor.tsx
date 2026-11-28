"use client";
// รูปภาพประกอบใต้ Data Sheet (หน้าแก้ไขสินค้า): ลากวาง/เลือก/วาง (Ctrl+V) ได้ครั้งละหลายรูป — อัปโหลดทันทีพร้อมแถบความคืบหน้า
// · ลากเรียงลำดับ / ‹ › · คำบรรยายต่อรูป · รูปแบบการจัดวาง 18 แบบ · แถบเลื่อน ระยะห่าง/ระยะขอบ/รัศมีมุม · ตัวอย่างสดใช้คอมโพเนนต์เดียวกับหน้าร้าน
// ส่งไปกับฟอร์มเป็น JSON ใน <input name="gallery"> (server ตรวจซ้ำด้วย parseGallery) · กำลังอัปโหลด = ส่ง mediaBusy กันกดบันทึกก่อนเสร็จ
import { useRef, useState } from "react";
import {
  CAPTION_MAX, CAPTION_MODES, FITS, GALLERY_LAYOUTS, GALLERY_MAX, GALLERY_RATIOS, GAP_MAX, LAYOUT_GROUPS, LAYOUT_ICON, PAD_MAX, RADIUS_MAX, RATIO_LAYOUTS, TITLE_MAX,
  type GalleryFit,
  type CaptionMode, type Gallery, type GalleryLayout,
} from "@/lib/product-gallery";
import { ProductGallery, type WmPreview } from "@/app/(shop)/product/[slug]/ProductGallery";
import { upload } from "./ProductMedia";
import "./gallery-editor.css";

type Item = { key: string; cap: string; url: string; seq?: number };
type Pending = { id: string; name: string; pct: number; error?: string; preview: string };
let seq = 0;

export function GalleryEditor({ init, urls, productName, watermark }: { init: Gallery; urls: Record<string, string>; productName: string; watermark: WmPreview | null }) {
  const [g, setG] = useState({ ...init, items: undefined as never });
  const [items, setItems] = useState<Item[]>(init.items.map((it) => ({ ...it, url: urls[it.key] ?? "" })));
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState("");
  const [pv, setPv] = useState(true);
  const drag = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Gallery>(k: K, v: Gallery[K]) => setG((x) => ({ ...x, [k]: v }));

  const addFiles = (list: FileList | File[]) => {
    const files = [...list].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return setMsg("เลือกได้เฉพาะไฟล์รูปภาพ (JPG / PNG / WebP)");
    const room = GALLERY_MAX - items.length - pending.filter((p) => !p.error).length;
    if (room <= 0) return setMsg(`ใส่รูปได้สูงสุด ${GALLERY_MAX} รูป — ลบรูปเดิมก่อน`);
    setMsg(files.length > room ? `เพิ่มได้อีก ${room} รูป (สูงสุด ${GALLERY_MAX}) — ข้ามรูปที่เกิน` : "");
    for (const file of files.slice(0, room)) {
      // ลำดับตามที่เลือก (ไม่ใช่ตามที่อัปโหลดเสร็จก่อน)
      const order = seq++;
      const id = `g${Date.now().toString(36)}${order}`;
      setPending((p) => [...p, { id, name: file.name, pct: 0, preview: URL.createObjectURL(file) }]);
      upload("image", file, file.name, (pct) => setPending((p) => p.map((x) => (x.id === id ? { ...x, pct } : x))))
        .then((r) => {
          setItems((xs) => {
            if (xs.length >= GALLERY_MAX || xs.some((x) => x.key === r.key)) return xs;
            const at = xs.findIndex((x) => x.seq != null && x.seq > order);
            const it = { key: r.key, cap: "", url: r.url, seq: order };
            return at < 0 ? [...xs, it] : [...xs.slice(0, at), it, ...xs.slice(at)];
          });
          setPending((p) => p.filter((x) => x.id !== id));
        })
        .catch((e: Error) => setPending((p) => p.map((x) => (x.id === id ? { ...x, error: e.message } : x))));
    }
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const n = [...items];
    const [x] = n.splice(from, 1);
    n.splice(to, 0, x);
    setItems(n);
  };
  const busy = pending.some((p) => !p.error);
  const payload = JSON.stringify({ title: g.title, layout: g.layout, gap: g.gap, pad: g.pad, radius: g.radius, caption: g.caption, ratio: g.ratio, fit: g.fit, wm: g.wm, items: items.map(({ key, cap }) => ({ key, cap })) });
  const groups = Object.keys(LAYOUT_GROUPS) as GalleryLayout["group"][];

  return (
    <div className="box gle" id="sec-gallery"
      onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); addFiles(fs); } }}>
      <input type="hidden" name="gallery" value={payload} />
      {busy && <input type="hidden" name="mediaBusy" value="1" />}
      <h3>รูปภาพประกอบ (ใต้ Data Sheet)</h3>
      <p className="gle-hint">เช่น รูปงานติดตั้งจริง แผนผังขนาด ตัวอย่างสีแสง · สูงสุด {GALLERY_MAX} รูป รูปละไม่เกิน 10 MB (JPG/PNG/WebP — ย่อและแปลงเป็น WebP ให้อัตโนมัติ) · ไม่มีรูป = ไม่แสดงส่วนนี้</p>

      <div className={`gle-drop${over ? " over" : ""}`} role="button" tabIndex={0} aria-label="เพิ่มรูปภาพประกอบ (เลือกได้หลายรูป)"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
        <b>ลากรูปมาวางที่นี่ (เลือกได้หลายรูปพร้อมกัน)</b>
        <span>หรือวางรูปจากคลิปบอร์ด (Ctrl+V)</span>
        <span className="gle-pick">เลือกไฟล์…</span>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-gallery-file onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {msg && <small className="gle-msg" role="status">{msg}</small>}

      {(items.length > 0 || pending.length > 0) && (
        <ol className="gle-list">
          {items.map((it, i) => (
            <li key={it.key} className="gle-it" draggable data-gallery-item={it.key}
              onDragStart={(e) => { drag.current = i; e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { if (drag.current != null) e.preventDefault(); }}
              onDrop={(e) => { if (drag.current == null) return; e.preventDefault(); move(drag.current, i); drag.current = null; }}>
              <div className="gle-th" style={{ backgroundImage: `url("${it.url}")` }}>
                <span className="gle-n">{i + 1}</span>
                <button type="button" className="gle-x" aria-label={`ลบรูปที่ ${i + 1}`} onClick={() => setItems(items.filter((_, k) => k !== i))}>✕</button>
                <span className="gle-mv">
                  <button type="button" aria-label={`เลื่อนรูปที่ ${i + 1} ไปก่อน`} disabled={i === 0} onClick={() => move(i, i - 1)}>‹</button>
                  <button type="button" aria-label={`เลื่อนรูปที่ ${i + 1} ไปหลัง`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>›</button>
                </span>
              </div>
              <input className="gle-cap" value={it.cap} maxLength={CAPTION_MAX} placeholder="คำบรรยาย (ไม่บังคับ)" aria-label={`คำบรรยายรูปที่ ${i + 1}`}
                onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, cap: e.target.value } : x)))} />
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.id} className={`gle-it gle-up${p.error ? " err" : ""}`} aria-live="polite">
              <div className="gle-th" style={{ backgroundImage: `url("${p.preview}")` }}>
                {p.error ? (
                  <button type="button" className="gle-x" aria-label={`ปิด ${p.name}`} onClick={() => setPending((xs) => xs.filter((x) => x.id !== p.id))}>✕</button>
                ) : <i className="gle-bar"><i style={{ width: `${p.pct}%` }} /></i>}
              </div>
              <small className="gle-st">{p.error ? p.error : `กำลังอัปโหลด ${p.pct}%`}</small>
            </li>
          ))}
        </ol>
      )}

      <div className="gle-grid">
        <div className="field">
          <label htmlFor="glTitle">หัวข้อส่วน</label>
          <input id="glTitle" value={g.title} maxLength={TITLE_MAX} placeholder="เช่น ภาพตัวอย่างงานติดตั้ง (ว่าง = ไม่มีหัวข้อ)" onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">คำบรรยาย</span>
          <span className="gle-seg" role="radiogroup" aria-label="ตำแหน่งคำบรรยาย">
            {(Object.keys(CAPTION_MODES) as CaptionMode[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={g.caption === k} className={g.caption === k ? "on" : undefined} onClick={() => set("caption", k)}>{CAPTION_MODES[k]}</button>
            ))}
          </span>
        </div>
      </div>

      <div className="gle-lays">
        <div className="gle-lays-h"><b>รูปแบบการจัดวาง</b><small>รูปเกินแบบ = ต่อด้วยแบบเดิมซ้ำ · เหลือไม่ครบ = เรียง 2 / เรียง 1</small></div>
        {groups.map((gr) => (
          <div key={gr}>
            <div className="gle-grp">{LAYOUT_GROUPS[gr]}</div>
            <div className="gle-lay-row" role="radiogroup" aria-label={LAYOUT_GROUPS[gr]}>
              {GALLERY_LAYOUTS.filter((l) => l.group === gr).map((l) => (
                <button key={l.key} type="button" role="radio" aria-checked={g.layout === l.key} className={`gle-lay${g.layout === l.key ? " on" : ""}`} onClick={() => set("layout", l.key)} data-layout={l.key}
                  title={l.slots ? `${l.label} (${l.slots} รูปต่อชุด)` : l.label}>
                  <svg viewBox="0 0 40 40" aria-hidden="true"><path d={LAYOUT_ICON[l.key]} /></svg>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {RATIO_LAYOUTS.has(g.layout) && (
        <div className="gle-ratio">
          <div className="gle-lays-h"><b>อัตราส่วนภาพ</b><small>กว้าง : สูง · ใช้กับแบบเรียง 1 / 2 / 3 และสไลด์</small></div>
          <div className="gle-ratio-row" role="radiogroup" aria-label="อัตราส่วนภาพ">
            {GALLERY_RATIOS.map((r) => {
              const [w, h] = r.key && r.key !== "auto" ? r.key.split(":").map(Number) : [0, 0];
              const k = w ? Math.min(30 / w, 30 / h) : 0;
              return (
                <button key={r.key || "def"} type="button" role="radio" aria-checked={g.ratio === r.key} className={`gle-rt${g.ratio === r.key ? " on" : ""}`} onClick={() => set("ratio", r.key)} title={r.hint} data-ratio={r.key || "default"}>
                  <span className="gle-rt-box" aria-hidden="true">{w ? <i style={{ width: w * k, height: h * k }} /> : <i className={r.key === "auto" ? "auto" : "def"} />}</span>
                  <b>{r.label}</b><small>{r.hint}</small>
                </button>
              );
            })}
          </div>
          <div className="gle-fit">
            <span className="lbl">การแสดงภาพ</span>
            <span className="gle-seg" role="radiogroup" aria-label="การแสดงภาพ">
              {(Object.keys(FITS) as GalleryFit[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={g.fit === k} className={g.fit === k ? "on" : undefined} onClick={() => set("fit", k)}>{FITS[k]}</button>
              ))}
            </span>
          </div>
        </div>
      )}

      <div className="gle-wmrow">
        <label className="chk-row">
          <input type="checkbox" checked={g.wm} onChange={(e) => set("wm", e.target.checked)} disabled={!watermark} data-gallery-wm />
          ใส่ลายน้ำบนรูปชุดนี้
        </label>
        <small>{watermark ? "ใช้ลายน้ำจาก ตั้งค่าร้าน → ลายน้ำรูปภาพ (ใส่ลงในไฟล์ที่ลูกค้าเห็น รูปต้นฉบับไม่เปลี่ยน)" : <>ยังไม่ได้ตั้งลายน้ำ — <a className="link" href="/admin/settings#watermark" target="_blank" rel="noopener">ตั้งค่าร้าน → ลายน้ำรูปภาพ</a></>}</small>
      </div>

      <div className="gle-sliders">
        <Slider id="glGap" label="ระยะห่าง" value={g.gap} max={GAP_MAX} onChange={(v) => set("gap", v)} />
        <Slider id="glPad" label="ระยะขอบ" value={g.pad} max={PAD_MAX} onChange={(v) => set("pad", v)} />
        <Slider id="glRadius" label="รัศมีมุม" value={g.radius} max={RADIUS_MAX} onChange={(v) => set("radius", v)} />
      </div>

      <div className="gle-pv-h">
        <b>ตัวอย่างบนหน้าสินค้า</b>
        <button type="button" className="link" onClick={() => setPv((x) => !x)} aria-expanded={pv}>{pv ? "ซ่อนตัวอย่าง" : "แสดงตัวอย่าง"}</button>
      </div>
      {pv && (items.length ? (
        <div className="gle-pv" data-gallery-preview>
          <ProductGallery preview wmPreview={watermark} name={productName || "สินค้า"} g={{ ...g, items: items.map((it) => ({ key: it.key, cap: it.cap.trim(), full: it.url, sm: it.url })) }} />
        </div>
      ) : <p className="gle-empty">ยังไม่มีรูป — เพิ่มรูปด้านบนเพื่อดูตัวอย่าง</p>)}
    </div>
  );
}

function Slider({ id, label, value, max, onChange }: { id: string; label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="gle-sl">
      <div className="gle-sl-h"><label htmlFor={id}>{label}</label><output htmlFor={id}>{value}</output></div>
      <input id={id} type="range" min={0} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ "--p": `${(value / max) * 100}%` } as React.CSSProperties} />
    </div>
  );
}
