"use client";
// สถานะงานภายในร้านของเอกสาร (แบบป้ายในแชต LINE OA) — ต้องดำเนินการ / เสร็จสิ้น
// WorkTag  = ป้ายในแถวรายการ: กดแล้วเปิดเมนูเลือก/ล้าง + หมายเหตุสั้นๆ (เมนูลอยแบบ fixed ไม่ถูกตารางตัด)
// WorkPanel = กล่องในหน้าเอกสาร: ปุ่มคู่ "ต้องดำเนินการ" · "เสร็จสิ้น" + หมายเหตุ + ผู้ตั้ง/เวลา
// บันทึกด้วย setDocWork (ตรวจซ้ำที่เซิร์ฟเวอร์ + ประวัติเอกสาร) แล้วหน้ารีเฟรชเอง
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { WORK_META, WORK_NOTE_MAX, type WorkState } from "@/lib/doc-work";
import { setDocWork } from "./actions";
import { notifySave } from "../../_components/save-notify";

/** ต้องดำเนินการ = นาฬิกา · เสร็จสิ้น = เครื่องหมายถูก (เส้น ใช้สีตัวอักษร) */
const TodoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
const DoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const WorkIcon = ({ state }: { state: WorkState }) => (state === "TODO" ? <TodoIcon /> : <DoneIcon />);

type Props = { id: string; state: WorkState | null; note: string | null; by?: string | null; at?: string | null; label: string };

function useSave(id: string) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const save = (state: WorkState | null, note: string, done?: () => void) =>
    start(async () => {
      const f = new FormData();
      f.set("id", id);
      f.set("state", state ?? "NONE");
      f.set("note", note);
      const r = await setDocWork(f);
      notifySave(r.error ? { ok: false, message: r.error } : { ok: true, message: state === "DONE" ? "ตั้งสถานะงาน “เสร็จสิ้น” แล้ว" : state === "TODO" ? "ตั้งสถานะงาน “ต้องดำเนินการ” แล้ว" : "เอาสถานะงานออกแล้ว" });
      if (r.error) setErr(r.error);
      else { setErr(""); done?.(); }
    });
  return { pending, err, save };
}

/** ป้ายในตาราง + เมนูเปลี่ยนสถานะ */
export function WorkTag({ id, state, note, by, at, label }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [text, setText] = useState(note ?? "");
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const { pending, err, save } = useSave(id);

  // วางเมนูใต้ป้าย (ชิดขวาถ้าล้นจอ) — ปิดเมื่อเลื่อนหน้า/ย่อจอ/คลิกนอก/Esc
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = 280;
    setPos({ top: Math.min(r.bottom + 6, innerHeight - 250), left: Math.max(8, Math.min(r.left, innerWidth - w - 8)) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const out = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); btn.current?.focus(); } };
    addEventListener("mousedown", out);
    addEventListener("keydown", esc);
    addEventListener("resize", close);
    addEventListener("scroll", close, true);
    pop.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      removeEventListener("mousedown", out);
      removeEventListener("keydown", esc);
      removeEventListener("resize", close);
      removeEventListener("scroll", close, true);
    };
  }, [open]);

  const tip = state ? [WORK_META[state].label, note, by && `โดย ${by}`, at].filter(Boolean).join(" · ") : "ตั้งสถานะงาน";
  return (
    <>
      <button ref={btn} type="button" className={`wtag ${state ? `wt-${WORK_META[state].tone}` : "wt-empty"}`} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`สถานะงาน${state ? ` ${WORK_META[state].label}` : " (ยังไม่ระบุ)"}: ${label}`} title={tip} onClick={() => { setText(note ?? ""); setOpen((o) => !o); }}>
        {state ? <WorkIcon state={state} /> : <span aria-hidden="true">+</span>}
        <span>{state ? WORK_META[state].label : "สถานะงาน"}</span>
        {state && note && <i className="wt-dot" aria-hidden="true" />}
      </button>
      {open && pos && (
        <div ref={pop} className="wt-pop" role="dialog" aria-label={`ตั้งสถานะงาน: ${label}`} style={{ top: pos.top, left: pos.left }}>
          <div className="wt-opts">
            {(["TODO", "DONE"] as const).map((s) => (
              <button key={s} type="button" className={`wt-opt wt-${WORK_META[s].tone}${state === s ? " on" : ""}`} aria-pressed={state === s} disabled={pending}
                onClick={() => save(s, text, () => setOpen(false))}>
                <WorkIcon state={s} />{WORK_META[s].label}
              </button>
            ))}
          </div>
          <label className="wt-lbl">
            หมายเหตุ (ไม่บังคับ)
            <input value={text} maxLength={WORK_NOTE_MAX} placeholder="เช่น รอลูกค้ายืนยันขนาด" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(state ?? "TODO", text, () => setOpen(false)); } }} />
          </label>
          {err && <div className="wt-err" role="alert">{err}</div>}
          <div className="wt-foot">
            {state ? <button type="button" className="link" disabled={pending} onClick={() => save(null, "", () => setOpen(false))}>ล้างสถานะ</button> : <span />}
            {by && at && <small>{by} · {at}</small>}
          </div>
        </div>
      )}
    </>
  );
}

/** กล่องในหน้าเอกสาร: ปุ่มคู่แบบ LINE OA + หมายเหตุ */
export function WorkPanel({ id, state, note, by, at }: Omit<Props, "label">) {
  const [text, setText] = useState(note ?? "");
  const [seen, setSeen] = useState(note);
  if (note !== seen) { setSeen(note); setText(note ?? ""); }
  const { pending, err, save } = useSave(id);
  const changed = (note ?? "") !== text.trim();
  return (
    <section className="dv-sec wpanel" id="docWork" aria-labelledby="docWorkH">
      <h3 id="docWorkH">สถานะงาน <small>ภายในร้าน · ไม่แสดงบนเอกสาร</small></h3>
      <div className="wp-btns" role="group" aria-label="สถานะงาน">
        {(["TODO", "DONE"] as const).map((s) => (
          <button key={s} type="button" className={`wp-btn wt-${WORK_META[s].tone}${state === s ? " on" : ""}`} aria-pressed={state === s} disabled={pending}
            onClick={() => save(state === s ? null : s, state === s ? "" : text)}>
            <WorkIcon state={s} />{WORK_META[s].label}
          </button>
        ))}
      </div>
      <label className="wp-lbl" htmlFor="workNote">หมายเหตุ / สิ่งที่ต้องทำ</label>
      <div className="wp-note">
        <input id="workNote" value={text} maxLength={WORK_NOTE_MAX} placeholder="เช่น รอลูกค้าโอนมัดจำ · ส่งของแล้วรอใบเสร็จตัวจริง" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && changed) { e.preventDefault(); save(state ?? "TODO", text); } }} />
        <button type="button" className="btn btn-outline btn-sm" disabled={pending || !changed} onClick={() => save(state ?? "TODO", text)}>บันทึก</button>
      </div>
      {err && <div className="login-err" role="alert">{err}</div>}
      <small className="sub">
        {state ? <>ตั้งเป็น <b>{WORK_META[state].label}</b>{by ? ` โดย ${by}` : ""}{at ? ` · ${at}` : ""} · กดปุ่มเดิมอีกครั้งเพื่อล้าง</> : "ยังไม่ระบุ — เลือกเพื่อให้ทีมรู้ว่าเอกสารนี้ต้องทำอะไรต่อ หรือจบงานแล้ว"}
      </small>
    </section>
  );
}
