"use client";
// ตัวแก้ไขส่วน "ทำไมต้องมองดูเว็บ": ข้อความ · จุดเด่น (เพิ่ม/ลบ/เลื่อน 1–6 ข้อ) · รูป 3 แบบ (อัปโหลด/ผลงาน/ไม่ใช้รูป) · คำบรรยาย · ลิงก์ · ตัวอย่างสด
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { WHY_DEFAULT, WHY_IMAGE_MODES, WHY_LIMITS, WHY_MAX_ITEMS, WHY_MIN_ITEMS, type WhyImageMode, type WhyUs } from "@/lib/why-us";

type Item = { key: number; title: string; text: string };
type Project = { title: string; sub: string; img: string } | null;
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMG_MAX = 10 * 1024 * 1024;
let K = 1;
const toItems = (xs: WhyUs["items"]): Item[] => xs.map((x) => ({ ...x, key: K++ }));
const okHref = (h: string) => !h.trim() || /^(\/(?!\/)|https?:\/\/)[^\s"'<>]*$/i.test(h.trim());

function Count({ v, max }: { v: string; max: number }) {
  return <small className={`wy-count${v.length > max * 0.9 ? " near" : ""}`} aria-hidden="true">{v.length}/{max}</small>;
}

export function WhyEditor({ initial, imageUrl, project, custom, action }: {
  initial: WhyUs; imageUrl: string | null; project: Project; custom: boolean;
  action: (f: FormData) => Promise<{ ok?: string; error?: string; field?: string }>;
}) {
  const router = useRouter();
  const uid = useId();
  const [eyebrow, setEyebrow] = useState(initial.eyebrow);
  const [title, setTitle] = useState(initial.title);
  const [items, setItems] = useState<Item[]>(() => toItems(initial.items));
  const [mode, setMode] = useState<WhyImageMode>(initial.imageMode);
  const [imageKey, setImageKey] = useState<string | null>(initial.imageKey);
  const [imgPrev, setImgPrev] = useState<string | null>(imageUrl);
  const [capTitle, setCapTitle] = useState(initial.capTitle);
  const [capSub, setCapSub] = useState(initial.capSub);
  const [href, setHref] = useState(initial.href ?? "");
  const [busy, setBusy] = useState(false);
  const [imgErr, setImgErr] = useState("");
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string; field?: string }>({});
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const setItem = (key: number, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setItems((xs) => {
    const n = [...xs];
    const j = i + d;
    if (j < 0 || j >= n.length) return xs;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const bad = !IMG_TYPES.includes(file.type) ? "รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP" : file.size > IMG_MAX ? "ไฟล์รูปใหญ่เกิน 10 MB" : "";
    setImgErr(bad);
    if (bad) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch("/admin/home/why/upload", { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
      if (!r.ok || !j.key) throw new Error(j.error || "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
      setImageKey(j.key);
      setImgPrev(j.url ?? null);
      setMode("upload");
    } catch (e) {
      setImgErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const loadDefault = () => {
    setEyebrow(WHY_DEFAULT.eyebrow);
    setTitle(WHY_DEFAULT.title);
    setItems(toItems(WHY_DEFAULT.items));
    setCapTitle(WHY_DEFAULT.capTitle);
    setCapSub(WHY_DEFAULT.capSub);
    setHref("");
    setMode(WHY_DEFAULT.imageMode);
  };

  const submit = (intent: "save" | "reset") => {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("data", JSON.stringify({
      eyebrow, title, imageMode: mode, imageKey, capTitle, capSub, href,
      items: items.filter((x) => x.title.trim() || x.text.trim()).map(({ title: t, text }) => ({ title: t, text })),
    }));
    start(async () => {
      const r = await action(fd);
      setMsg(r);
      if (r.ok) {
        if (intent === "reset") loadDefault();
        router.refresh();
      } else if (r.field) {
        document.getElementById(`${uid}${r.field}`)?.focus();
      }
    });
  };

  // ตัวอย่างสด: กล่องรูปตามโหมดที่เลือก (เหมือนหน้าร้าน)
  const pv = mode === "upload" && imgPrev
    ? { img: imgPrev, t: capTitle, s: capSub, link: href.trim() }
    : mode === "project" && project
      ? { img: project.img, t: project.title, s: `${project.sub} — ดูผลงานติดตั้งทั้งหมด`, link: "/projects" }
      : { img: null, t: capTitle, s: capSub, link: href.trim() };
  const usesCaption = !(mode === "project" && project);
  const bad = (f: string) => (msg.field === f ? { "aria-invalid": true as const } : {});

  return (
    <div className="wy">
      {msg.error && <div className="login-err" role="alert">{msg.error}</div>}
      {msg.ok && <div className="ok-box" role="status">{msg.ok}</div>}

      <section className="box wy-preview-box" aria-label="ตัวอย่างบนหน้าแรก">
        <h3>ตัวอย่างบนหน้าแรก</h3>
        <div className="wy-pv">
          <div className={`wy-pv-visual${pv.img ? " has-img" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {pv.img && <img src={pv.img} alt="" />}
            {(pv.t || pv.s) && <div className="wy-pv-cap">{pv.t && <b>{pv.t}</b>}{pv.s && <span>{pv.s}</span>}</div>}
            {pv.link && <span className="wy-pv-link" title={pv.link}>ลิงก์ ↗</span>}
          </div>
          <div className="wy-pv-text">
            {eyebrow && <div className="wy-pv-eyebrow">{eyebrow}</div>}
            <h2>{title.split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}</h2>
            <div className="wy-pv-list">
              {items.filter((x) => x.title.trim()).map((x, i) => (
                <div key={x.key}><b className="wy-pv-num">{String(i + 1).padStart(2, "0")}</b><h4>{x.title}</h4>{x.text && <p>{x.text}</p>}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="wy-grid">
        <section className="box wy-sec" aria-labelledby={`${uid}h1`}>
          <h3 id={`${uid}h1`}>ข้อความ</h3>
          <div className="field">
            <label htmlFor={`${uid}eyebrow`}>หัวข้อเล็ก (สีส้ม ด้านบน) <Count v={eyebrow} max={WHY_LIMITS.eyebrow} /></label>
            <input id={`${uid}eyebrow`} value={eyebrow} maxLength={WHY_LIMITS.eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="เช่น ทำไมต้องมองดูเว็บ (เว้นว่างได้)" />
          </div>
          <div className="field">
            <label htmlFor={`${uid}title`}>หัวข้อหลัก — กด Enter เพื่อขึ้นบรรทัดใหม่ (สูงสุด 3 บรรทัด) <Count v={title} max={WHY_LIMITS.title} /></label>
            <textarea id={`${uid}title`} rows={3} value={title} maxLength={WHY_LIMITS.title} onChange={(e) => setTitle(e.target.value)} required {...bad("title")} />
          </div>

          <div className="wy-items-head">
            <h3 id={`${uid}items`} tabIndex={-1}>จุดเด่น ({items.length}/{WHY_MAX_ITEMS})</h3>
            <span className="sub">เลขลำดับ 01, 02 … ใส่ให้อัตโนมัติ · บนคอมแสดง 2 คอลัมน์</span>
          </div>
          <ol className="wy-items" aria-label="จุดเด่น">
            {items.map((it, i) => (
              <li key={it.key} className="wy-item">
                <span className="wy-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <div className="wy-item-fields">
                  <label className="sr-only" htmlFor={`${uid}item-${i}`}>หัวข้อจุดเด่นข้อที่ {i + 1}</label>
                  <input id={`${uid}item-${i}`} value={it.title} maxLength={WHY_LIMITS.itemTitle} placeholder="หัวข้อ เช่น สเปกชัดเจนทุกชิ้น"
                    onChange={(e) => setItem(it.key, { title: e.target.value })} {...bad(`item-${i}`)} />
                  <label className="sr-only" htmlFor={`${uid}itext-${i}`}>รายละเอียดข้อที่ {i + 1}</label>
                  <textarea id={`${uid}itext-${i}`} rows={2} value={it.text} maxLength={WHY_LIMITS.itemText} placeholder="รายละเอียดสั้นๆ 1–2 บรรทัด"
                    onChange={(e) => setItem(it.key, { text: e.target.value })} />
                  <Count v={it.text} max={WHY_LIMITS.itemText} />
                </div>
                <span className="wy-acts">
                  <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`เลื่อนข้อที่ ${i + 1} ขึ้น`}>↑</button>
                  <button type="button" className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`เลื่อนข้อที่ ${i + 1} ลง`}>↓</button>
                  <button type="button" className="icon-btn sm x" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} disabled={items.length <= WHY_MIN_ITEMS} aria-label={`ลบข้อที่ ${i + 1}`}>✕</button>
                </span>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-outline btn-sm" disabled={items.length >= WHY_MAX_ITEMS}
            onClick={() => setItems((xs) => [...xs, { key: K++, title: "", text: "" }])}>
            + เพิ่มจุดเด่น{items.length >= WHY_MAX_ITEMS ? ` (ครบ ${WHY_MAX_ITEMS} ข้อแล้ว)` : ""}
          </button>
        </section>

        <section className="box wy-sec" aria-labelledby={`${uid}h2`}>
          <h3 id={`${uid}h2`}>รูปกล่องซ้าย</h3>
          <div className="wy-modes" role="radiogroup" aria-label="แหล่งรูป" id={`${uid}image`} tabIndex={-1}>
            {(Object.keys(WHY_IMAGE_MODES) as WhyImageMode[]).map((m) => (
              <label key={m} className={`wy-mode${mode === m ? " on" : ""}`}>
                <input type="radio" name={`${uid}mode`} value={m} checked={mode === m} onChange={() => setMode(m)} />
                <span>{WHY_IMAGE_MODES[m]}</span>
                {m === "project" && <small>{project ? `ตอนนี้: ${project.title}` : "ยังไม่มีผลงานที่มีรูป — จะแสดงพื้นไล่สีแทน"}</small>}
              </label>
            ))}
          </div>

          {mode === "upload" && (
            <div className="wy-up">
              <button type="button" className={`wy-drop${drag ? " over" : ""}${busy ? " busy" : ""}`} disabled={busy}
                aria-label={imgPrev ? "เปลี่ยนรูป" : "อัปโหลดรูป"} onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files?.[0]); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {imgPrev ? <img src={imgPrev} alt="" /> : <span className="wy-drop-ph">+<small>คลิกหรือลากรูปมาวาง</small></span>}
                {busy && <span className="wy-spin" aria-hidden="true" />}
              </button>
              <div className="wy-up-info">
                <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {busy ? "กำลังอัปโหลด…" : imgPrev ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                </button>
                <small className="sub">JPG, PNG, WEBP ไม่เกิน 10 MB · แนะนำแนวตั้ง 4:5 (เช่น 1200×1500) ภาพงานติดตั้งจริงตอนกลางคืน · ระบบย่อและแปลงเป็น WebP ให้</small>
                {imgErr && <span className="wy-err" role="alert">{imgErr}</span>}
              </div>
              <input ref={fileRef} type="file" accept={IMG_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-label="ไฟล์รูปส่วนทำไมต้องมองดูเว็บ"
                data-why-file onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          )}

          <fieldset className="wy-cap" disabled={!usesCaption}>
            <legend>คำบรรยายบนรูป{usesCaption ? "" : " (โหมดผลงานใช้ชื่อผลงานให้อัตโนมัติ)"}</legend>
            <div className="field">
              <label htmlFor={`${uid}capTitle`}>ข้อความหลัก <Count v={capTitle} max={WHY_LIMITS.capTitle} /></label>
              <input id={`${uid}capTitle`} value={capTitle} maxLength={WHY_LIMITS.capTitle} onChange={(e) => setCapTitle(e.target.value)} placeholder="เว้นว่าง = ไม่แสดง" />
            </div>
            <div className="field">
              <label htmlFor={`${uid}capSub`}>ข้อความรอง <Count v={capSub} max={WHY_LIMITS.capSub} /></label>
              <input id={`${uid}capSub`} value={capSub} maxLength={WHY_LIMITS.capSub} onChange={(e) => setCapSub(e.target.value)} placeholder="เว้นว่าง = ไม่แสดง" />
            </div>
            <div className="field">
              <label htmlFor={`${uid}href`}>ลิงก์เมื่อกดรูป (ไม่บังคับ)</label>
              <input id={`${uid}href`} value={href} maxLength={WHY_LIMITS.href} onChange={(e) => setHref(e.target.value)} placeholder="เช่น /projects หรือ https://…"
                className={okHref(href) ? "" : "bad"} {...bad("href")} />
              {!okHref(href) && <small className="wy-err">ลิงก์ต้องขึ้นต้นด้วย / หรือ https://</small>}
            </div>
          </fieldset>
        </section>
      </div>

      <div className="pce-bar wy-bar">
        <button type="button" className="btn btn-ghost" disabled={pending || !custom} title={custom ? "" : "ใช้ข้อความเดิมอยู่แล้ว"}
          onClick={() => { if (confirm("คืนค่าข้อความและรูปเดิมของร้าน?")) submit("reset"); }}>คืนค่าเดิม</button>
        <span className="sub">{custom ? "ใช้ค่าที่ตั้งเอง" : "ใช้ข้อความเดิมของร้าน"} · บันทึกแล้วหน้าแรกเปลี่ยนทันที</span>
        <button type="button" className="btn btn-primary" disabled={pending || busy || !okHref(href)} onClick={() => submit("save")}>
          {pending ? "กำลังบันทึก…" : busy ? "รออัปโหลดรูป…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}
