"use client";
// ตัวแก้ไข Data Sheet ในฟอร์มสินค้า: กลุ่ม (ไทย/EN) → แถว (หัวข้อไทย · ค่า · EN · ★ ไฮไลต์) · เลื่อนขึ้น/ลง · หมายเหตุท้ายตาราง · รูปแบบ (ตามร้าน/A/B)
// ตัวช่วยกรอก: แม่แบบของหมวด (ใช้/บันทึก) · คัดลอกจากสินค้าอื่น · วางจาก Excel/ตาราง · ดึงจากสเปกเดิม — ส่ง JSON ทั้งก้อนใน <input name="datasheet">
import { useState, useTransition } from "react";
import { DS_LIMITS, DS_STYLES, applyTemplate, fromSpecs, parsePaste, type Datasheet, type DsGroup, type DsRow } from "@/lib/datasheet";
import { notifySave } from "../../_components/save-notify";
import { loadDatasheet, saveCategoryTemplate } from "./datasheet-actions";
import "./datasheet.css";

type Row = DsRow & { k: number };
type Group = { title: string; en: string; rows: Row[]; k: number };
let K = 1;
const toState = (gs: DsGroup[]): Group[] => gs.map((g) => ({ title: g.title, en: g.en, k: K++, rows: g.rows.map((r) => ({ ...r, k: K++ })) }));
const blankRow = (): Row => ({ label: "", en: "", value: "", hl: false, k: K++ });
const plain = (gs: Group[]): DsGroup[] => gs.map((g) => ({ title: g.title, en: g.en, rows: g.rows.map(({ k: _k, ...r }) => { void _k; return r; }) }));

export function DatasheetEditor({ init, categoryId, shopStyle, templates, products, specs }: {
  init: Datasheet;
  categoryId: string;
  shopStyle: string;
  /** แม่แบบของแต่ละหมวด (categoryId → กลุ่ม) */
  templates: Record<string, DsGroup[]>;
  /** สินค้าที่มี Data Sheet (ใช้คัดลอก) */
  products: { id: string; label: string }[];
  /** สเปกเดิม (หัวข้อ/ค่า) ในฟอร์ม */
  specs: { label: string; value: string }[];
}) {
  const [groups, setGroups] = useState<Group[]>(() => toState(init.groups));
  const [note, setNote] = useState(init.note);
  const [style, setStyle] = useState(init.style);
  const [tpls, setTpls] = useState(templates);
  const [tool, setTool] = useState<"" | "paste" | "copy">("");
  const [paste, setPaste] = useState("");
  const [copyText, setCopyText] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const rowsAll = groups.flatMap((g) => g.rows);
  const filled = rowsAll.filter((r) => r.value.trim()).length;
  const hls = rowsAll.filter((r) => r.hl).length;
  const tpl = tpls[categoryId] ?? [];
  const say = (t: string) => setMsg(t);

  const upd = (gk: number, f: (g: Group) => Group) => setGroups((gs) => gs.map((g) => (g.k === gk ? f(g) : g)));
  const updRow = (gk: number, rk: number, patch: Partial<DsRow>) => upd(gk, (g) => ({ ...g, rows: g.rows.map((r) => (r.k === rk ? { ...r, ...patch } : r)) }));
  const moveIn = <T,>(xs: T[], i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= xs.length) return xs;
    const n = [...xs];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  };
  const addGroups = (gs: DsGroup[], mode: "append" | "replace") => {
    if (!gs.length) return say("ไม่พบข้อมูลที่แปลงได้ — ตรวจว่าแต่ละบรรทัดมี หัวข้อ และ ค่า คั่นด้วย Tab, | หรือ :");
    setGroups((cur) => (mode === "replace" ? toState(gs) : [...cur.filter((g) => g.rows.some((r) => r.label || r.value)), ...toState(gs)]));
    say(`เพิ่ม ${gs.reduce((n, g) => n + g.rows.length, 0)} แถวแล้ว — ตรวจและติ๊ก ★ ค่าที่อยากโชว์เด่น`);
  };

  const useTemplate = () => {
    if (!tpl.length) return;
    setGroups((cur) => toState(applyTemplate(tpl, plain(cur))));
    say("ใช้แม่แบบหมวดแล้ว — ค่าเดิมที่หัวข้อตรงกันยังอยู่");
  };
  const saveTemplate = () =>
    start(async () => {
      const r = await saveCategoryTemplate(categoryId, plain(groups));
      notifySave(r.error ? { ok: false, message: r.error } : { ok: true, title: "บันทึกแม่แบบแล้ว", message: r.ok });
      if (r.template) setTpls((t) => ({ ...t, [categoryId]: r.template! }));
    });
  const doCopy = () => {
    const p = products.find((x) => x.label === copyText.trim());
    if (!p) return say("เลือกสินค้าจากรายการที่ขึ้นมา");
    start(async () => {
      const r = await loadDatasheet(p.id);
      if (r.error || !r.groups) return say(r.error ?? "คัดลอกไม่สำเร็จ");
      setGroups(toState(r.groups));
      if (r.note && !note) setNote(r.note);
      setTool("");
      say(`คัดลอก Data Sheet จาก “${r.name}” แล้ว — แก้ค่าที่ต่างกันได้เลย`);
    });
  };

  const payload = JSON.stringify({ groups: plain(groups), note, style });
  return (
    <div className="box ds-ed" id="sec-datasheet">
      <input type="hidden" name="datasheet" value={payload} />
      <div className="ds-ed-head">
        <h3>Data Sheet <small>(ตารางข้อมูลทางเทคนิค ใต้รายละเอียดสินค้า)</small></h3>
        <span className="sub">{filled}/{DS_LIMITS.rows} แถว · ไฮไลต์ {hls}/{DS_LIMITS.highlights}</span>
      </div>
      <div className="ds-tools" role="toolbar" aria-label="ตัวช่วยกรอก Data Sheet">
        <button type="button" className="ds-pill" disabled={!tpl.length} onClick={useTemplate} title={tpl.length ? "ใช้หัวข้อมาตรฐานของหมวดนี้" : "หมวดนี้ยังไม่มีแม่แบบ — กรอกแล้วกด “บันทึกเป็นแม่แบบหมวด”"}>ใช้แม่แบบหมวด{tpl.length ? ` (${tpl.reduce((n, g) => n + g.rows.length, 0)})` : ""}</button>
        <button type="button" className="ds-pill" disabled={pending || !rowsAll.some((r) => r.label || r.en)} onClick={saveTemplate}>บันทึกเป็นแม่แบบหมวด</button>
        <button type="button" className={`ds-pill${tool === "copy" ? " on" : ""}`} aria-expanded={tool === "copy"} onClick={() => setTool(tool === "copy" ? "" : "copy")}>คัดลอกจากสินค้าอื่น</button>
        <button type="button" className={`ds-pill${tool === "paste" ? " on" : ""}`} aria-expanded={tool === "paste"} onClick={() => setTool(tool === "paste" ? "" : "paste")}>วางจาก Excel / ตาราง</button>
        <button type="button" className="ds-pill" disabled={!specs.some((s) => s.value.trim())} onClick={() => addGroups(fromSpecs(specs.filter((s) => s.value.trim())), "append")}>ดึงจากสเปกสินค้า</button>
        {groups.length > 0 && <button type="button" className="ds-pill ghost" onClick={() => { if (confirm("ล้าง Data Sheet ทั้งหมด?")) { setGroups([]); say(""); } }}>ล้างทั้งหมด</button>}
      </div>

      {tool === "paste" && (
        <div className="ds-paste">
          <label htmlFor="dsPaste">คัดลอก 2 คอลัมน์ (หัวข้อ | ค่า) หรือ 3 คอลัมน์ (ไทย | EN | ค่า) จาก Excel / Google Sheets / ตารางใน PDF แล้ววางที่นี่ · บรรทัดที่มีแค่ข้อความเดียว = ชื่อกลุ่ม</label>
          <textarea id="dsPaste" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"ระบบไฟฟ้า\nPower\t10W\nInput Voltage\tAC 220V\nแสง\nBeam Angle\t15° / 25° / 35°"} />
          <div className="ds-paste-acts">
            <button type="button" className="btn btn-primary btn-sm" disabled={!paste.trim()} onClick={() => { addGroups(parsePaste(paste), "append"); setPaste(""); setTool(""); }}>แปลงเป็นตาราง (ต่อท้าย)</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!paste.trim()} onClick={() => { addGroups(parsePaste(paste), "replace"); setPaste(""); setTool(""); }}>แทนที่ทั้งหมด</button>
          </div>
        </div>
      )}
      {tool === "copy" && (
        <div className="ds-paste">
          <label htmlFor="dsCopy">เลือกสินค้าที่มี Data Sheet แล้ว ({products.length} รายการ) — ข้อมูลเดิมในฟอร์มนี้จะถูกแทนที่</label>
          <div className="ds-copy">
            <input id="dsCopy" list="dsCopyList" value={copyText} onChange={(e) => setCopyText(e.target.value)} placeholder="พิมพ์ชื่อหรือรหัสสินค้า" />
            <datalist id="dsCopyList">{products.map((p) => <option key={p.id} value={p.label} />)}</datalist>
            <button type="button" className="btn btn-primary btn-sm" disabled={pending || !copyText.trim()} onClick={doCopy}>คัดลอก</button>
          </div>
        </div>
      )}
      {msg && <p className="ds-msg" role="status">{msg}</p>}

      {groups.map((g, gi) => (
        <div className="ds-grp" key={g.k}>
          <div className="ds-gh">
            <input aria-label={`ชื่อกลุ่มที่ ${gi + 1}`} value={g.title} maxLength={DS_LIMITS.title} placeholder="ชื่อกลุ่ม เช่น ระบบไฟฟ้า (เว้นว่างได้)" onChange={(e) => upd(g.k, (x) => ({ ...x, title: e.target.value }))} />
            <input aria-label={`ชื่อกลุ่มภาษาอังกฤษที่ ${gi + 1}`} className="en" value={g.en} maxLength={DS_LIMITS.title} placeholder="EN เช่น Electrical" onChange={(e) => upd(g.k, (x) => ({ ...x, en: e.target.value }))} />
            <span className="ds-acts">
              <button type="button" className="ds-ib" disabled={gi === 0} onClick={() => setGroups((gs) => moveIn(gs, gi, -1))} aria-label={`เลื่อนกลุ่ม ${g.title || gi + 1} ขึ้น`}>↑</button>
              <button type="button" className="ds-ib" disabled={gi === groups.length - 1} onClick={() => setGroups((gs) => moveIn(gs, gi, 1))} aria-label={`เลื่อนกลุ่ม ${g.title || gi + 1} ลง`}>↓</button>
              <button type="button" className="ds-ib del" onClick={() => setGroups((gs) => gs.filter((x) => x.k !== g.k))} aria-label={`ลบกลุ่ม ${g.title || gi + 1}`}>✕</button>
            </span>
          </div>
          {g.rows.map((r, ri) => (
            <div className="ds-row" key={r.k}>
              <input aria-label="หัวข้อ" value={r.label} maxLength={DS_LIMITS.label} placeholder="หัวข้อ เช่น กำลังไฟ" onChange={(e) => updRow(g.k, r.k, { label: e.target.value })} />
              <input aria-label="ค่า" className="val" value={r.value} maxLength={DS_LIMITS.value} placeholder="ค่า เช่น 10W · หลายค่าคั่นด้วย /" onChange={(e) => updRow(g.k, r.k, { value: e.target.value })} />
              <input aria-label="หัวข้อภาษาอังกฤษ" className="en" value={r.en} maxLength={DS_LIMITS.en} placeholder="EN (ไม่บังคับ)" onChange={(e) => updRow(g.k, r.k, { en: e.target.value })} />
              <span className="ds-acts">
                <button type="button" className={`ds-ib star${r.hl ? " on" : ""}`} aria-pressed={r.hl} disabled={!r.hl && hls >= DS_LIMITS.highlights}
                  title={r.hl ? "เลิกไฮไลต์" : hls >= DS_LIMITS.highlights ? `ไฮไลต์ได้สูงสุด ${DS_LIMITS.highlights} ค่า` : "ไฮไลต์ (แสดงเด่นด้านบน แบบ B)"}
                  aria-label={`ไฮไลต์ ${r.label || "แถวนี้"}`} onClick={() => updRow(g.k, r.k, { hl: !r.hl })}>★</button>
                <button type="button" className="ds-ib" disabled={ri === 0} onClick={() => upd(g.k, (x) => ({ ...x, rows: moveIn(x.rows, ri, -1) }))} aria-label={`เลื่อน ${r.label || "แถว"} ขึ้น`}>↑</button>
                <button type="button" className="ds-ib" disabled={ri === g.rows.length - 1} onClick={() => upd(g.k, (x) => ({ ...x, rows: moveIn(x.rows, ri, 1) }))} aria-label={`เลื่อน ${r.label || "แถว"} ลง`}>↓</button>
                <button type="button" className="ds-ib del" onClick={() => upd(g.k, (x) => ({ ...x, rows: x.rows.filter((y) => y.k !== r.k) }))} aria-label={`ลบ ${r.label || "แถว"}`}>✕</button>
              </span>
            </div>
          ))}
          <button type="button" className="ds-add" onClick={() => upd(g.k, (x) => ({ ...x, rows: [...x.rows, blankRow()] }))}>+ เพิ่มแถว</button>
        </div>
      ))}
      <div className="ds-foot">
        <button type="button" className="btn btn-outline btn-sm" disabled={groups.length >= DS_LIMITS.groups} onClick={() => setGroups((gs) => [...gs, { title: "", en: "", rows: [blankRow(), blankRow(), blankRow()], k: K++ }])}>+ เพิ่มกลุ่ม</button>
        {!groups.length && <span className="sub">ยังไม่มี Data Sheet — เริ่มจาก “วางจาก Excel” หรือ “ดึงจากสเปกสินค้า” ได้เลย</span>}
      </div>
      <div className="ds-meta">
        <div className="field">
          <label htmlFor="dsNote">หมายเหตุท้ายตาราง</label>
          <input id="dsNote" value={note} maxLength={DS_LIMITS.note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น * ขนาดอาจคลาดเคลื่อนเล็กน้อยตามล็อตการผลิต" />
        </div>
        <div className="field">
          <label htmlFor="dsStyle">รูปแบบการแสดง</label>
          <select id="dsStyle" value={style} onChange={(e) => setStyle(e.target.value as Datasheet["style"])}>
            <option value="">ตามค่าร้าน ({shopStyle === "A" ? "A ตารางเรียบ" : "B มืออาชีพ"})</option>
            {(Object.keys(DS_STYLES) as (keyof typeof DS_STYLES)[]).map((k) => <option key={k} value={k}>{k} · {DS_STYLES[k]}</option>)}
          </select>
        </div>
      </div>
      <p className="sub ds-hint">แบบ C (ตารางเทียบทุกรุ่น) แสดงเองเมื่อสินค้าอยู่ในกลุ่มตัวเลือกและมี Data Sheet ตั้งแต่ 2 รุ่นขึ้นไป · ใช้หัวข้อเดียวกันทุกรุ่นเพื่อให้เทียบกันได้ (ใช้แม่แบบหมวดช่วยได้)</p>
    </div>
  );
}
