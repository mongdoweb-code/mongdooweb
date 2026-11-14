"use client";
// ดูรูปสินค้าเต็มจอแบบมืออาชีพ (แนว Fancybox): แถบเครื่องมือ ขยาย/ย่อ · ขนาดจริง 1:1 · หมุนซ้าย/ขวา · พลิกแนวนอน/แนวตั้ง · รีเซ็ต
//   · เล่นสไลด์อัตโนมัติ · เต็มจอ · ปิด · ตัวนับ "x / n" มุมซ้ายบน · แถบรูปย่อด้านล่าง
// เมาส์: ล้อเลื่อน = ซูมตรงจุดที่ชี้ · ดับเบิลคลิก = ขยาย/คืน · ลากเมื่อขยาย = เลื่อนดู
// สัมผัส: ปัดซ้าย/ขวา = เปลี่ยนรูป · ปัดลง = ปิด · สองนิ้ว = ซูม · แตะสองครั้ง = ขยาย/คืน
// คีย์บอร์ด: ← → เปลี่ยนรูป · + − ซูม · 0 รีเซ็ต · R / Shift+R หมุน · F เต็มจอ · P เล่นสไลด์ · Esc ปิด
import { useEffect, useRef, useState } from "react";

type Img = { full: string; sm: string };
type View = { s: number; x: number; y: number; r: number; fh: 1 | -1; fv: 1 | -1 };
const BASE: View = { s: 1, x: 0, y: 0, r: 0, fh: 1, fv: 1 };
const MIN = 1;
const MAX = 6;
const STEP = 1.5;
const SLIDE_MS = 3500;
const FULL = 1600;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const I = {
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6" /></>,
  actual: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 10v5M7 10h1M16 10v5M15 10h1M12 11v.01M12 14v.01" /></>,
  rotL: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 3v5h5" /></>,
  rotR: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v5h-5" /></>,
  flipH: <><path d="M12 3v18" /><path d="M9 7 4 17h5zM15 7l5 10h-5z" /></>,
  flipV: <><path d="M3 12h18" /><path d="M7 9 17 4v5zM7 15l10 5v-5z" /></>,
  reset: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  play: <path d="M7 4.5v15l12-7.5z" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />,
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  exitFull: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  prev: <path d="m15 5-7 7 7 7" />,
  next: <path d="m9 5 7 7-7 7" />,
};
const Svg = ({ children, fill }: { children: React.ReactNode; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={fill ? "lb-fill" : undefined}>
    {children}
  </svg>
);

type ToolProps = { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean; fill?: boolean; kbd?: string };
function Tool({ label, icon, onClick, disabled, pressed, fill, kbd }: ToolProps) {
  const tip = kbd ? `${label} (${kbd})` : label;
  return (
    <button type="button" className="lb-tool" aria-label={label} data-tip={tip} title={tip} disabled={disabled} aria-pressed={pressed} onClick={onClick}>
      <Svg fill={fill}>{icon}</Svg>
    </button>
  );
}

export function Lightbox({ images, alt, start, onClose }: { images: Img[]; alt: string; start: number; onClose: (k: number) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const n = images.length;
  const [k, setK] = useState(start);
  const kRef = useRef(start);
  const [view, setView] = useState<View>(BASE);
  const [seenK, setSeenK] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** สเกลที่ทำให้เห็นพิกเซลจริง 1:1 (ไฟล์กว้าง ÷ กว้างที่แสดงพอดีจอ) — 0 = ยังไม่รู้ */
  const [actual, setActual] = useState(0);
  // เปลี่ยนรูป → มุมมองกลับค่าเริ่มต้น (ปรับ state ระหว่าง render แทน effect)
  if (seenK !== k) {
    setSeenK(k);
    setView(BASE);
    setActual(0);
  }
  useEffect(() => {
    kRef.current = k;
  }, [k]);

  const step = (d: number) => setK((x) => (x + d + n) % n);

  // เปิด <dialog> แบบ modal + ล็อกการเลื่อนหน้า
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const onCloseEv = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      onClose(kRef.current);
    };
    d.addEventListener("close", onCloseEv);
    const onFs = () => setIsFull(document.fullscreenElement === d);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      d.removeEventListener("close", onCloseEv);
      document.removeEventListener("fullscreenchange", onFs);
      html.style.overflow = prev;
    };
  }, [onClose]);

  // เล่นสไลด์อัตโนมัติ (หยุดเมื่อผู้ใช้ซูม/หมุน หรือมีรูปเดียว)
  useEffect(() => {
    if (!playing || n < 2) return;
    const t = window.setTimeout(() => setK((x) => (x + 1) % n), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [playing, k, n]);

  // รูปย่อที่เลือกอยู่ในจอเสมอ
  useEffect(() => {
    const el = thumbsRef.current?.querySelector<HTMLElement>(`[data-k="${k}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [k]);

  /** ขนาดรูปที่แสดงพอดีจอ (ก่อนซูม) — สลับกว้าง/สูงเมื่อหมุน 90° */
  const fitSize = (r = view.r) => {
    const im = imgRef.current;
    if (!im) return { w: 0, h: 0 };
    const w = im.offsetWidth, h = im.offsetHeight;
    return r % 180 ? { w: h, h: w } : { w, h };
  };
  /** จำกัดการเลื่อนไม่ให้รูปหลุดจอ */
  const bound = (v: View): View => {
    const st = stageRef.current;
    if (!st) return v;
    const { w, h } = fitSize(v.r);
    const bx = Math.max(0, (w * v.s - st.clientWidth) / 2);
    const by = Math.max(0, (h * v.s - st.clientHeight) / 2);
    return { ...v, x: clamp(v.x, -bx, bx), y: clamp(v.y, -by, by) };
  };
  /** ซูมไปที่ s โดยให้จุด (cx, cy) บนจอ (เทียบกลางเวที) อยู่ที่เดิม */
  const zoomTo = (s: number, cx = 0, cy = 0) =>
    setView((v) => {
      const ns = clamp(s, MIN, MAX);
      const f = ns / v.s;
      return bound({ ...v, s: ns, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f });
    });
  const stageCenter = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { cx: clientX - (r.left + r.width / 2), cy: clientY - (r.top + r.height / 2) };
  };

  /** ขนาดจริง 1:1 (พิกเซลของไฟล์) — กดอีกครั้งกลับพอดีจอ */
  const measure = () => {
    const im = imgRef.current;
    if (im?.complete && im.naturalWidth && im.offsetWidth) setActual(clamp(im.naturalWidth / im.offsetWidth, MIN, MAX));
  };
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const toggleActual = () => {
    const a = actual;
    if (a <= 1.01) return;
    if (Math.abs(view.s - a) < 0.01) setView((v) => ({ ...v, s: 1, x: 0, y: 0 }));
    else zoomTo(a);
  };

  const rotate = (d: 90 | -90) => setView((v) => bound({ ...v, r: v.r + d, x: 0, y: 0 }));
  const flipH = () => setView((v) => ({ ...v, fh: v.fh === 1 ? -1 : 1 }));
  const flipV = () => setView((v) => ({ ...v, fv: v.fv === 1 ? -1 : 1 }));
  const reset = () => setView(BASE);
  const toggleFull = () => {
    const d = ref.current;
    if (!d) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else d.requestFullscreen?.().catch(() => {});
  };
  const close = () => ref.current?.close();
  const changed = view.s !== 1 || view.r !== 0 || view.fh !== 1 || view.fv !== 1;
  const canActual = actual > 1.01;

  // ---------- ตัวชี้ (เมาส์/นิ้ว) ----------
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; vx: number; vy: number; id: number; type: string; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; s: number; cx: number; cy: number } | null>(null);
  const lastTap = useRef(0);
  /** เพิ่งลาก/ปัด → ไม่นับคลิกที่ตามมาเป็น "คลิกพื้นหลังเพื่อปิด" */
  const justDragged = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ตัวชี้จำลอง/ไม่รองรับ */
    }
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const c = stageCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, ...c };
      gesture.current = null;
      setDy(0);
      return;
    }
    gesture.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, id: e.pointerId, type: e.pointerType, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const ns = clamp((p.s * Math.hypot(a.x - b.x, a.y - b.y)) / p.d, MIN, MAX);
      setView((v) => {
        const f = ns / v.s;
        return bound({ ...v, s: ns, x: p.cx - (p.cx - v.x) * f, y: p.cy - (p.cy - v.y) * f });
      });
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, ddy = e.clientY - g.y;
    if (Math.abs(dx) + Math.abs(ddy) > 4) g.moved = true;
    if (view.s > 1) {
      setDragging(true);
      setView((v) => bound({ ...v, x: g.vx + dx, y: g.vy + ddy }));
    } else if (g.type !== "mouse") setDy(Math.max(0, ddy));
  };
  const endPointer = (e: React.PointerEvent, cancelled = false) => {
    ptrs.current.delete(e.pointerId);
    if (pinch.current) {
      if (ptrs.current.size < 2) pinch.current = null;
      if (view.s < 1.02) setView((v) => ({ ...v, s: 1, x: 0, y: 0 }));
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    setDy(0);
    setDragging(false);
    if (!g || g.id !== e.pointerId || cancelled) return;
    justDragged.current = g.moved;
    const dx = e.clientX - g.x, ddy = e.clientY - g.y;
    if (view.s > 1) return; // ขยายอยู่ = ลากดู ไม่เปลี่ยนรูป
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(ddy)) return step(dx < 0 ? 1 : -1);
    if (ddy > 90 && ddy > Math.abs(dx)) return close();
    // แตะสองครั้ง (นิ้ว) = ขยาย/คืน
    if (!g.moved && g.type !== "mouse") {
      const now = e.timeStamp;
      if (now - lastTap.current < 300) {
        const c = stageCenter(e.clientX, e.clientY);
        if (view.s > 1) reset();
        else zoomTo(2.5, c.cx, c.cy);
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  };

  // ล้อเมาส์ = ซูมตรงจุดที่ชี้ (ต้องเป็น non-passive เพื่อกันหน้าเลื่อน)
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = st.getBoundingClientRect();
      const cx = e.clientX - (r.left + r.width / 2), cy = e.clientY - (r.top + r.height / 2);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
      setView((v) => {
        const ns = clamp(v.s * f, MIN, MAX);
        const k2 = ns / v.s;
        const nv = { ...v, s: ns, x: cx - (cx - v.x) * k2, y: cy - (cy - v.y) * k2 };
        return ns === 1 ? { ...nv, x: 0, y: 0 } : nv;
      });
    };
    st.addEventListener("wheel", onWheel, { passive: false });
    return () => st.removeEventListener("wheel", onWheel);
  }, []);

  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const key = e.key;
    const act: Record<string, () => void> = {
      ArrowRight: () => step(1),
      ArrowLeft: () => step(-1),
      "+": () => zoomTo(view.s * STEP),
      "=": () => zoomTo(view.s * STEP),
      "-": () => zoomTo(view.s / STEP),
      "0": reset,
      r: () => rotate(90),
      R: () => rotate(-90),
      f: toggleFull,
      F: toggleFull,
      p: () => setPlaying((x) => !x),
      P: () => setPlaying((x) => !x),
    };
    const fn = act[key];
    if (!fn) return;
    // ปุ่มลูกศรบนปุ่มในแถบเครื่องมือก็ใช้เปลี่ยนรูปได้ตามเดิม
    e.preventDefault();
    fn();
  };
  // ฟังปุ่มที่ระดับเอกสาร — ใช้ได้แม้โฟกัสหลุดจากกล่อง (เช่น ปุ่มที่เพิ่งกดถูกปิดใช้งาน)
  const keyRef = useRef(onKey);
  useEffect(() => {
    keyRef.current = onKey;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const im = images[k];
  const transform = `translate(${view.x}px, ${view.y + dy}px) scale(${view.s}) rotate(${view.r}deg) scale(${view.fh}, ${view.fv})`;
  return (
    <dialog
      ref={ref}
      className={`lb${view.s > 1 ? " is-zoomed" : ""}${dragging ? " is-dragging" : ""}${n > 1 ? " has-thumbs" : ""}`}
      aria-label={`รูปสินค้า ${k + 1} จาก ${n}`}
      onClick={(e) => {
        // คลิกพื้นหลัง (นอกรูป/ปุ่ม) = ปิด — ไม่ปิดถ้าเพิ่งลากรูป
        const t = e.target as HTMLElement;
        if (justDragged.current) return void (justDragged.current = false);
        if (!(t === e.currentTarget || t.classList.contains("lb-stage")) || view.s !== 1) return;
        // pointer capture ทำให้คลิกบนรูปมาที่เวที → ตรวจตำแหน่งจริงว่าอยู่นอกรูป
        const r = imgRef.current?.getBoundingClientRect();
        if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
        close();
      }}
    >
      {playing && n > 1 && <span key={`p${k}`} className="lb-progress" style={{ animationDuration: `${SLIDE_MS}ms` }} aria-hidden="true" />}

      <div className="lb-top">
        <span className="lb-count" aria-live="polite">
          {k + 1} / {n}
        </span>
        <div className="lb-toolbar" role="toolbar" aria-label="เครื่องมือดูรูป">
          <Tool label="ขยาย" icon={I.zoomIn} onClick={() => zoomTo(view.s * STEP)} disabled={view.s >= MAX} kbd="+" />
          <Tool label="ย่อ" icon={I.zoomOut} onClick={() => zoomTo(view.s / STEP)} disabled={view.s <= MIN} kbd="−" />
          <Tool label="ขนาดจริง 1:1" icon={I.actual} onClick={toggleActual} disabled={!canActual} pressed={canActual && Math.abs(view.s - actual) < 0.01} />
          <span className="lb-sep" aria-hidden="true" />
          <Tool label="หมุนซ้าย" icon={I.rotL} onClick={() => rotate(-90)} kbd="Shift+R" />
          <Tool label="หมุนขวา" icon={I.rotR} onClick={() => rotate(90)} kbd="R" />
          <Tool label="พลิกแนวนอน" icon={I.flipH} onClick={flipH} pressed={view.fh === -1} />
          <Tool label="พลิกแนวตั้ง" icon={I.flipV} onClick={flipV} pressed={view.fv === -1} />
          <span className="lb-sep" aria-hidden="true" />
          <Tool label="รีเซ็ต" icon={I.reset} onClick={reset} disabled={!changed} kbd="0" />
        </div>
        <div className="lb-actions">
          {n > 1 && <Tool label={playing ? "หยุดเล่นสไลด์" : "เล่นสไลด์"} icon={playing ? I.pause : I.play} onClick={() => setPlaying((x) => !x)} fill pressed={playing} kbd="P" />}
          <Tool label={isFull ? "ออกจากเต็มจอ" : "เต็มจอ"} icon={isFull ? I.exitFull : I.full} onClick={toggleFull} kbd="F" />
          <button type="button" className="lb-tool lb-close" aria-label="ปิดรูปขยาย" title="ปิด (Esc)" data-tip="ปิด (Esc)" onClick={close} autoFocus>
            <Svg>{I.close}</Svg>
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="lb-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e)}
        onPointerCancel={(e) => endPointer(e, true)}
        onDoubleClick={(e) => {
          const r = imgRef.current?.getBoundingClientRect();
          if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
          const c = stageCenter(e.clientX, e.clientY);
          if (view.s > 1) reset();
          else zoomTo(2.5, c.cx, c.cy);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          key={im.full}
          src={im.full}
          alt={k === 0 ? alt : `${alt} รูปที่ ${k + 1}`}
          width={FULL}
          height={FULL}
          decoding="async"
          draggable={false}
          onLoad={measure}
          style={{ transform, opacity: dy ? Math.max(0.3, 1 - dy / 400) : undefined }}
        />
      </div>

      {n > 1 && (
        <>
          <button type="button" className="lb-nav prev" aria-label="รูปก่อนหน้า" title="รูปก่อนหน้า (←)" onClick={() => step(-1)}>
            <Svg>{I.prev}</Svg>
          </button>
          <button type="button" className="lb-nav next" aria-label="รูปถัดไป" title="รูปถัดไป (→)" onClick={() => step(1)}>
            <Svg>{I.next}</Svg>
          </button>
          <div className="lb-thumbs" ref={thumbsRef} role="group" aria-label="รูปย่อทั้งหมด">
            {images.map((t, j) => (
              <button key={t.full} type="button" data-k={j} className="lb-thumb" aria-label={`รูปที่ ${j + 1}`} aria-current={j === k ? "true" : undefined} onClick={() => setK(j)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.sm} alt="" width={64} height={64} loading="lazy" decoding="async" draggable={false} />
              </button>
            ))}
          </div>
        </>
      )}
    </dialog>
  );
}
