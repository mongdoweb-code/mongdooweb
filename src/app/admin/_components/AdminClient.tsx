"use client";
// ส่วนที่ต้องทำงานในเบราว์เซอร์ของหลังบ้าน (พฤติกรรมเดียวกับต้นแบบ)
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "../actions";

/* ---------- ออกจากระบบอัตโนมัติ: ไม่มีการใช้งาน 30 นาที → นับถอยหลัง 60 วินาที ---------- */
const IDLE_MS = 30 * 60e3;
const COUNT = 60;

export function IdleGuard() {
  const [left, setLeft] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let last = 0;
    const reset = () => {
      const now = Date.now();
      if (now - last < 400) return; // ไม่ต้องตั้งเวลาใหม่ทุก mousemove
      last = now;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setLeft(COUNT), IDLE_MS);
    };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "mousemove", "input"];
    evs.forEach((e) => addEventListener(e, reset, { passive: true, capture: true }));
    reset();
    return () => {
      clearTimeout(timer.current);
      evs.forEach((e) => removeEventListener(e, reset, { capture: true }));
    };
  }, []);

  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      formRef.current?.requestSubmit();
      return;
    }
    if (left === COUNT) stayRef.current?.focus();
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  return (
    <>
      <form ref={formRef} action={logoutAction} hidden>
        <input type="hidden" name="reason" value="idle" />
      </form>
      <div className="dlg" hidden={left === null}>
        <div className="dlg-bg" />
        <div className="dlg-card" role="alertdialog" aria-modal="true" aria-labelledby="idleTitle" aria-describedby="idleBody">
          <h2 id="idleTitle">ยังอยู่ไหม?</h2>
          <div className="dlg-body" id="idleBody">
            ไม่มีการใช้งานมาระยะหนึ่ง ระบบจะออกจากระบบอัตโนมัติเพื่อความปลอดภัยใน <b className="num">{left}</b> วินาที
          </div>
          <div className="idle-count" aria-hidden="true">
            {left}
          </div>
          <div className="dlg-acts">
            <button className="btn btn-outline" type="button" onClick={() => formRef.current?.requestSubmit()}>
              ออกจากระบบ
            </button>
            <button className="btn btn-primary" type="button" ref={stayRef} onClick={() => setLeft(null)}>
              ใช้งานต่อ
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- ดึงคำสั่งซื้อใหม่ทุก 30 วินาที + เสียงแจ้งเตือนเมื่อมีสลิปรอตรวจเพิ่ม ---------- */
export function AutoRefresh({ pending }: { pending: number }) {
  const router = useRouter();
  const prev = useRef(pending);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    // เบราว์เซอร์อนุญาตเล่นเสียงหลังผู้ใช้กดอะไรสักอย่างก่อน
    const unlock = () => {
      audio.current ??= new AudioContext();
      removeEventListener("pointerdown", unlock);
    };
    addEventListener("pointerdown", unlock);
    const t = setInterval(() => {
      const busy = document.activeElement?.matches("input, textarea, select");
      if (document.visibilityState === "visible" && !busy) router.refresh();
    }, 30e3);
    return () => {
      clearInterval(t);
      removeEventListener("pointerdown", unlock);
    };
  }, [router]);

  useEffect(() => {
    if (pending > prev.current && audio.current) {
      const ctx = audio.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    }
    prev.current = pending;
    document.title = (pending ? `(${pending}) ` : "") + "หลังร้าน — มองดูเว็บ";
  }, [pending]);

  return null;
}

/* ---------- เมนูด้านข้างบนมือถือ ---------- */
export function SideToggle() {
  return (
    <button
      className="icon-btn"
      id="sideBtn"
      type="button"
      aria-label="เปิดเมนู"
      onClick={() => document.getElementById("side")?.classList.toggle("open")}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  );
}

/* ---------- คีย์ลัดในหน้ารายละเอียด: Esc ปิด, ←/→ คำสั่งซื้อก่อน/ถัดไป ---------- */
export function DrawerKeys({ close, prev, next }: { close: string; prev: string | null; next: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input, textarea, select")) return;
      if (document.querySelector(".dlg:not([hidden]), .lightbox:not([hidden])")) return;
      if (e.key === "Escape") router.push(close, { scroll: false });
      if (e.key === "ArrowLeft" && prev) router.push(prev, { scroll: false });
      if (e.key === "ArrowRight" && next) router.push(next, { scroll: false });
    };
    addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [router, close, prev, next]);
  return null;
}

/* ---------- ปุ่มคัดลอก ---------- */
export function CopyButton({ text, label, done, className = "btn btn-outline btn-sm", children }: {
  text: string; label?: string; done: string; className?: string; children: React.ReactNode;
}) {
  const [msg, setMsg] = useState("");
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={label}
        title={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setMsg(done);
          } catch {
            setMsg("คัดลอกไม่สำเร็จ — กรุณาคัดลอกด้วยตนเอง");
          }
          setTimeout(() => setMsg(""), 2500);
        }}
      >
        {children}
      </button>
      <div className={`toast${msg ? " show" : ""}`} role="status">
        {msg}
      </div>
    </>
  );
}

/* ---------- ปุ่มส่งฟอร์มที่ต้องยืนยันก่อน (แทน confirm ของเบราว์เซอร์) ---------- */
export function ConfirmSubmit({ title, body, confirmLabel, className, children, tip, ariaLabel }: {
  title: string; body: string | null; confirmLabel: string; className: string; children: React.ReactNode;
  /** ป้ายชื่อเมื่อชี้ (ปุ่มไอคอน) */ tip?: string; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="submit"
        className={className}
        data-tip={tip}
        aria-label={ariaLabel}
        onClick={(e) => {
          if (body && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open && (
        <div className="dlg">
          <div className="dlg-bg" onClick={() => setOpen(false)} />
          <div className="dlg-card" role="alertdialog" aria-modal="true" aria-label={title}>
            <h2>{title}</h2>
            <div className="dlg-body">{body}</div>
            <div className="dlg-acts">
              <button className="btn btn-outline" type="button" autoFocus onClick={() => setOpen(false)}>
                ยกเลิก
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  const form = ref.current?.form;
                  setOpen(false);
                  form?.requestSubmit();
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const clampZ = (v: number) => Math.min(6, Math.max(0.5, Math.round(v * 100) / 100));

/* ---------- ตัวดูสลิป: ซูม (ปุ่ม/ล้อเมาส์/สองนิ้ว) หมุน ลากเลื่อน เปิดแท็บใหม่ + เทียบยอดชัดเจน ---------- */
export function SlipViewer({ src, alt, orderSatang, slipSatang }: { src: string; alt: string; orderSatang: number; slipSatang: number }) {
  const [open, setOpen] = useState(false);
  const [z, setZ] = useState(1);
  const [rot, setRot] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(false);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const diff = slipSatang - orderSatang;
  const fmt = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const reset = () => { setZ(1); setRot(0); setPos({ x: 0, y: 0 }); };
  const zoom = (d: number) => setZ((v) => clampZ(v + d));

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "+" || e.key === "=") setZ((v) => clampZ(v + 0.25));
      else if (e.key === "-") setZ((v) => clampZ(v - 0.25));
      else if (e.key.toLowerCase() === "r") setRot((r) => (r + 90) % 360);
      else if (e.key === "0") { setZ(1); setRot(0); setPos({ x: 0, y: 0 }); }
      else return;
      e.stopPropagation();
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, [open]);

  const amounts = (
    <div className="sv-amt">
      <span>ยอดสั่งซื้อ<b>{fmt(orderSatang)}</b></span>
      <span className={diff ? "bad" : "ok"}>ยอดในสลิป (ลูกค้าแจ้ง)<b>{fmt(slipSatang)}</b></span>
      <span className={diff ? "bad" : "ok"}>ผลต่าง<b>{diff ? `${diff > 0 ? "เกิน" : "ขาด"} ${fmt(Math.abs(diff))}` : "ตรงกัน ✓"}</b></span>
    </div>
  );

  return (
    <>
      <button type="button" className="slip-open" onClick={() => setOpen(true)} aria-label="ขยายดูสลิป" style={{ display: "block", width: "100%", padding: 0, background: "none", border: 0, cursor: "zoom-in" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- สลิปส่งผ่าน route ที่ตรวจสิทธิ์ ไม่ใช้ image optimizer */}
        <img className="slip-img" src={src} alt={alt} />
      </button>
      <div className="slip-tools">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)} id="slipZoom">ขยาย / หมุน</button>
        <a className="btn btn-outline btn-sm" href={src} target="_blank" rel="noopener">เปิดในแท็บใหม่</a>
      </div>
      {open && (
        <div className="sv" role="dialog" aria-modal="true" aria-label="ตรวจสลิป" id="slipViewer">
          <div className="sv-top">
            {amounts}
            <button type="button" ref={closeRef} onClick={() => setOpen(false)} aria-label="ปิด (Esc)">✕</button>
          </div>
          <div
            className={`sv-stage${drag ? " drag" : ""}`}
            onWheel={(e) => zoom(e.deltaY < 0 ? 0.2 : -0.2)}
            onDoubleClick={() => (z === 1 ? setZ(2) : reset())}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pts.current.size === 2) {
                const [a, b] = [...pts.current.values()];
                pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z };
              } else {
                last.current = { x: e.clientX, y: e.clientY };
                setDrag(true);
              }
            }}
            onPointerMove={(e) => {
              if (!pts.current.has(e.pointerId)) return;
              pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pts.current.size === 2 && pinch.current) {
                const [a, b] = [...pts.current.values()];
                setZ(clampZ((pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d));
              } else if (last.current) {
                const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y;
                last.current = { x: e.clientX, y: e.clientY };
                setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
              }
            }}
            onPointerUp={(e) => {
              pts.current.delete(e.pointerId);
              if (pts.current.size < 2) pinch.current = null;
              if (!pts.current.size) { last.current = null; setDrag(false); }
            }}
            onPointerCancel={(e) => { pts.current.delete(e.pointerId); last.current = null; setDrag(false); }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} draggable={false} style={{ transform: `translate(${pos.x}px, ${pos.y}px) rotate(${rot}deg) scale(${z})` }} />
          </div>
          <div className="sv-bar">
            <button type="button" onClick={() => zoom(-0.25)} aria-label="ซูมออก">−</button>
            <button type="button" className="zoom" onClick={reset} aria-label="รีเซ็ตขนาด" id="svZoomLabel">{Math.round(z * 100)}%</button>
            <button type="button" onClick={() => zoom(0.25)} aria-label="ซูมเข้า" id="svZoomIn">+</button>
            <button type="button" onClick={() => setRot((r) => (r + 270) % 360)} aria-label="หมุนซ้าย">⟲</button>
            <button type="button" onClick={() => setRot((r) => (r + 90) % 360)} aria-label="หมุนขวา" id="svRotate">⟳ หมุน</button>
            <a href={src} target="_blank" rel="noopener">เปิดแท็บใหม่</a>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- ดูภาพสลิปเต็มจอ ---------- */
export function SlipImage({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(false);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- สลิปส่งผ่าน route ที่ตรวจสิทธิ์ ไม่ใช้ image optimizer */}
      <img className="slip-img" src={src} alt={alt} onClick={() => setZoom(true)} />
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(false)} onKeyDown={(e) => e.key === "Escape" && setZoom(false)} role="dialog" aria-label="ภาพสลิปขนาดเต็ม" tabIndex={-1}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} />
        </div>
      )}
    </>
  );
}
