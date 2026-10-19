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
export function ConfirmSubmit({ title, body, confirmLabel, className, children }: {
  title: string; body: string | null; confirmLabel: string; className: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="submit"
        className={className}
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
