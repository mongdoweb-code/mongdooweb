"use client";
// ตัวแก้เนื้อหาหน้าแบบง่าย (หัวข้อ/ย่อหน้า/รายการ/ลิงก์/ตัวหนา) + ตัวอย่างสด และตัวแก้คำถามที่พบบ่อย (เพิ่ม/ลบ/เรียง)
import { useEffect, useRef, useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { previewBody, saveFaq, savePage, type PageState } from "./actions";

function Msg({ s }: { s: PageState }) {
  if (s.error) return <div className="err-box" role="alert">{s.error}</div>;
  if (s.ok) return <div className="ok-box" role="status">{s.ok}</div>;
  return null;
}

const TOOLS: { label: string; title: string; apply: (sel: string) => { text: string; line?: boolean } }[] = [
  { label: "H2", title: "หัวข้อใหญ่", apply: (s) => ({ text: `## ${s || "หัวข้อ"}`, line: true }) },
  { label: "H3", title: "หัวข้อย่อย", apply: (s) => ({ text: `### ${s || "หัวข้อย่อย"}`, line: true }) },
  { label: "B", title: "ตัวหนา", apply: (s) => ({ text: `**${s || "ข้อความ"}**` }) },
  { label: "• รายการ", title: "รายการแบบจุด", apply: (s) => ({ text: (s || "รายการ").split("\n").map((l) => `- ${l}`).join("\n"), line: true }) },
  { label: "1. ลำดับ", title: "รายการเรียงเลข", apply: (s) => ({ text: (s || "ขั้นตอน").split("\n").map((l, i) => `${i + 1}. ${l}`).join("\n"), line: true }) },
  { label: "ลิงก์", title: "ลิงก์ (/หน้าในเว็บ, https://, tel:, mailto:)", apply: (s) => ({ text: `[${s || "ข้อความลิงก์"}](https://)` }) },
];

export function PageEditor({ slug, title, body, isDefault, vars }: { slug: string; title: string; body: string; isDefault: boolean; vars: [string, string][] }) {
  const [state, onSubmit, pending] = useFormAction<PageState>(savePage, {});
  const [text, setText] = useState(body);
  const [html, setHtml] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  // ตัวอย่างสด (หน่วง 300 ms) — ใช้ตัวแปลงเดียวกับหน้าร้านที่ server
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => previewBody(text).then((h) => live && setHtml(h)), 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text]);


  const insert = (fn: (typeof TOOLS)[number]["apply"]) => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const r = fn(value.slice(a, b));
    const before = value.slice(0, a);
    const pre = r.line && before && !before.endsWith("\n") ? "\n" : "";
    const next = before + pre + r.text + value.slice(b);
    setText(next);
    setDirty(true);
    requestAnimationFrame(() => {
      el.focus();
      const pos = (before + pre + r.text).length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <form className="pg-edit" onSubmit={onSubmit}>
      <input type="hidden" name="slug" value={slug} />
      <Msg s={state} />
      {isDefault && !dirty && <div className="info-box">หน้านี้ยังใช้เนื้อหาเริ่มต้นของระบบ — แก้แล้วกด &quot;เผยแพร่&quot; เพื่อใช้ข้อความของร้านเอง</div>}
      <div className={`field${state.fields?.includes("title") ? " has-err" : ""}`}>
        <label htmlFor="pgTitle">ชื่อหน้า</label>
        <input id="pgTitle" name="title" defaultValue={title} maxLength={120} required onChange={() => setDirty(true)} />
      </div>
      <div className="pg-cols">
        <div className={`field${state.fields?.includes("body") ? " has-err" : ""}`}>
          <div className="lbl-row">
            <label htmlFor="pgBody">เนื้อหา</label>
            <span className="cnt">{text.length.toLocaleString()} ตัวอักษร</span>
          </div>
          <div className="pg-tools" role="toolbar" aria-label="จัดรูปแบบ">
            {TOOLS.map((t) => (
              <button key={t.label} type="button" className="btn btn-outline btn-sm" title={t.title} onClick={() => insert(t.apply)}>{t.label}</button>
            ))}
          </div>
          <textarea
            id="pgBody" name="body" ref={ta} value={text} rows={22} spellCheck={false}
            onChange={(e) => { setText(e.target.value); setDirty(true); }}
          />
          <details className="pg-help">
            <summary>วิธีเขียน</summary>
            <ul>
              <li><code>## หัวข้อ</code> · <code>### หัวข้อย่อย</code> — ขึ้นบรรทัดใหม่</li>
              <li>บรรทัดว่าง = ย่อหน้าใหม่ · <code>- รายการ</code> · <code>1. ขั้นตอน</code></li>
              <li><code>**ตัวหนา**</code> · <code>[ข้อความ](https://...)</code> ลิงก์ได้เฉพาะ /, https://, tel:, mailto:</li>
              <li>ตัวแปรจากตั้งค่าร้าน: {vars.map(([k, l]) => <span key={k}><code>{`{{${k}}}`}</code> {l} </span>)}</li>
            </ul>
          </details>
        </div>
        <div className="pg-pv">
          <span className="lbl">ตัวอย่าง (หน้าตาบนหน้าร้าน)</span>
          {/* renderBody escape ข้อความทั้งหมดก่อนสร้าง HTML ที่อนุญาต */}
          <article className="pg-doc" id="pgPreview" dangerouslySetInnerHTML={{ __html: html ?? "" }} />
        </div>
      </div>
      <div className="pubbar pg-bar">
        <div className="pb-txt">
          {dirty ? <b>มีการแก้ไขที่ยังไม่เผยแพร่</b> : <span>เนื้อหาตรงกับที่เผยแพร่อยู่</span>}
          <small>เผยแพร่แล้วหน้าร้านเปลี่ยนทันที · ย้อนกลับได้จากประวัติเวอร์ชัน</small>
        </div>
        <div className="pb-acts">
          <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังเผยแพร่…" : "เผยแพร่"}</button>
        </div>
      </div>
    </form>
  );
}

type Faq = { q: string; a: string; k: number };

export function FaqEditor({ items }: { items: { q: string; a: string }[] }) {
  const [state, onSubmit, pending] = useFormAction<PageState>(saveFaq, {});
  const seq = useRef(items.length);
  const [list, setList] = useState<Faq[]>(() => items.map((x, i) => ({ ...x, k: i })));
  const set = (i: number, patch: Partial<Faq>) => setList(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const n = [...list];
    [n[i], n[j]] = [n[j], n[i]];
    setList(n);
  };
  return (
    <form className="faq-edit" onSubmit={onSubmit}>
      <input type="hidden" name="faq" value={JSON.stringify(list.map(({ q, a }) => ({ q, a })))} />
      <Msg s={state} />
      <ol className="faq-list">
        {list.map((x, i) => (
          <li key={x.k} className={`faq-item${state.fields?.includes(`faq-${i}`) ? " has-err" : ""}`}>
            <div className="faq-no">{i + 1}</div>
            <div className="faq-body">
              <div className="field">
                <label htmlFor={`fq-${x.k}`}>คำถาม</label>
                <input id={`fq-${x.k}`} value={x.q} maxLength={300} onChange={(e) => set(i, { q: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`fa-${x.k}`}>คำตอบ</label>
                <textarea id={`fa-${x.k}`} value={x.a} rows={3} maxLength={3000} onChange={(e) => set(i, { a: e.target.value })} />
              </div>
            </div>
            <div className="row-acts faq-acts">
              <button type="button" className="icon-btn" aria-label={`เลื่อนข้อ ${i + 1} ขึ้น`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="icon-btn" aria-label={`เลื่อนข้อ ${i + 1} ลง`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="icon-btn del" aria-label={`ลบข้อ ${i + 1}`} onClick={() => setList(list.filter((_, j) => j !== i))}>✕</button>
            </div>
          </li>
        ))}
      </ol>
      {!list.length && <div className="empty"><b>ยังไม่มีคำถาม</b>กด &quot;เพิ่มคำถาม&quot; เพื่อเริ่ม</div>}
      <div className="mini-acts">
        <button type="button" className="btn btn-outline" id="faqAdd" onClick={() => setList([...list, { q: "", a: "", k: ++seq.current }])}>+ เพิ่มคำถาม</button>
      </div>
      <div className="pubbar pg-bar">
        <div className="pb-txt"><span>{list.length} ข้อ · แสดงที่หน้า /faq ตามลำดับนี้</span></div>
        <div className="pb-acts"><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกคำถามที่พบบ่อย"}</button></div>
      </div>
    </form>
  );
}
