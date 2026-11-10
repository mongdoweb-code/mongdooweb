"use client";
// ตัวเลือกสีแบบ Google Docs ใช้ร่วมทุกเมนูที่มีสีในหลังบ้าน (สีตัวอักษร · ไฮไลต์ · สีพื้นการ์ดหมวดยอดนิยม)
// - สีมาตรฐาน 80 สี (เทา 10 + สีสด 10 + ไล่เฉด 6 แถว) + แถว "สีร้าน"
// - "กำหนดเอง": สีที่เคยเลือกเอง (จำในเบราว์เซอร์นี้ สูงสุด 10) · ปุ่ม + เปิดวงล้อสี/พิมพ์รหัส HEX · หลอดดูดสีจากหน้าจอ (Chrome/Edge)
// - ใช้แป้นพิมพ์ได้: ลูกศรเลื่อนในตาราง · Enter/Space เลือก · Esc ปิด · มีเครื่องหมาย ✓ ที่สีปัจจุบัน
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export const PALETTE: { name: string; rows: string[][] } = {
  name: "สีมาตรฐาน",
  rows: [
    ["#000000", "#434343", "#666666", "#999999", "#B7B7B7", "#CCCCCC", "#D9D9D9", "#EFEFEF", "#F3F3F3", "#FFFFFF"],
    ["#980000", "#FF0000", "#FF9900", "#FFFF00", "#00FF00", "#00FFFF", "#4A86E8", "#0000FF", "#9900FF", "#FF00FF"],
    ["#E6B8AF", "#F4CCCC", "#FCE5CD", "#FFF2CC", "#D9EAD3", "#D0E0E3", "#C9DAF8", "#CFE2F3", "#D9D2E9", "#EAD1DC"],
    ["#DD7E6B", "#EA9999", "#F9CB9C", "#FFE599", "#B6D7A8", "#A2C4C9", "#A4C2F4", "#9FC5E8", "#B4A7D6", "#D5A6BD"],
    ["#CC4125", "#E06666", "#F6B26B", "#FFD966", "#93C47D", "#76A5AF", "#6D9EEB", "#6FA8DC", "#8E7CC3", "#C27BA0"],
    ["#A61C00", "#CC0000", "#E69138", "#F1C232", "#6AA84F", "#45818E", "#3C78D8", "#3D85C6", "#674EA7", "#A64D79"],
    ["#85200C", "#990000", "#B45F06", "#BF9000", "#38761D", "#134F5C", "#1155CC", "#0B5394", "#351C75", "#741B47"],
    ["#5B0F00", "#660000", "#783F04", "#7F6000", "#274E13", "#0C343D", "#1C4587", "#073763", "#20124D", "#4C1130"],
  ],
};
/** สีของร้าน (ส้ม/ครีม/ดำ/เขียว) ให้เลือกตรงธีมได้ทันที */
export const BRAND = ["#F26B38", "#D9562A", "#1C1C1C", "#6B6862", "#F2F0EB", "#E8E5DD", "#16A37B", "#0B57D0", "#FFF7F2", "#FCE5CD"];

const NAMES: Record<string, string> = {
  "#000000": "ดำ", "#434343": "เทาเข้มมาก", "#666666": "เทาเข้ม", "#999999": "เทา", "#B7B7B7": "เทากลาง", "#CCCCCC": "เทาอ่อน",
  "#D9D9D9": "เทาอ่อนมาก", "#EFEFEF": "เทาจาง", "#F3F3F3": "เทาจางมาก", "#FFFFFF": "ขาว",
  "#980000": "แดงเลือดหมู", "#FF0000": "แดง", "#FF9900": "ส้ม", "#FFFF00": "เหลือง", "#00FF00": "เขียว", "#00FFFF": "ฟ้าอมเขียว",
  "#4A86E8": "น้ำเงินคอร์นฟลาวเวอร์", "#0000FF": "น้ำเงิน", "#9900FF": "ม่วง", "#FF00FF": "ชมพูบานเย็น",
  "#F26B38": "ส้มของร้าน", "#D9562A": "ส้มเข้มของร้าน", "#1C1C1C": "ดำของร้าน", "#6B6862": "เทาตัวหนังสือรอง",
  "#F2F0EB": "ครีมของร้าน", "#E8E5DD": "ครีมเข้ม", "#16A37B": "เขียวของร้าน", "#0B57D0": "น้ำเงินลิงก์", "#FFF7F2": "ส้มจาง", "#FCE5CD": "พีช",
};
const SHADE = ["", "", "อ่อนมาก 3", "อ่อน 2", "อ่อน 1", "เข้ม 1", "เข้ม 2", "เข้ม 3"];
const BASE = ["แดงเลือดหมู", "แดง", "ส้ม", "เหลือง", "เขียว", "ฟ้าอมเขียว", "น้ำเงินคอร์นฟลาวเวอร์", "น้ำเงิน", "ม่วง", "ชมพูบานเย็น"];
/** ชื่อสีภาษาไทยสำหรับ tooltip/โปรแกรมอ่านหน้าจอ */
export function colorName(hex: string) {
  const h = hex.toUpperCase();
  if (NAMES[h]) return NAMES[h];
  for (let r = 2; r < PALETTE.rows.length; r++) {
    const c = PALETTE.rows[r].indexOf(h);
    if (c >= 0) return `${BASE[c]} ${SHADE[r]}`;
  }
  return h;
}

/** "rgb(1, 2, 3)" / "#abc" / "#aabbcc" → "#AABBCC" (อื่น ๆ = null) */
export function toHex(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return `#${m[1].split("").map((c) => c + c).join("")}`.toUpperCase();
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return `#${m[1]}`.toUpperCase();
  const r = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (r) {
    if (r[4] !== undefined && Number(r[4]) === 0) return null; // โปร่งใส = ไม่มีสี
    return `#${[r[1], r[2], r[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return null;
}
/** สีสว่าง → เครื่องหมาย ✓ สีดำ (ไม่งั้นสีขาว) */
const light = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
};

const STORE = "mdw_custom_colors";
const readCustom = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.map((x) => toHex(String(x))).filter((x): x is string => !!x).slice(0, 10) : [];
  } catch {
    return [];
  }
};
const saveCustom = (hex: string) => {
  const next = [hex, ...readCustom().filter((x) => x !== hex)].slice(0, 10);
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {}
  return next;
};

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

export type PaletteProps = {
  /** สีปัจจุบัน (#RRGGBB) — มีเครื่องหมาย ✓ */
  value: string | null;
  /** เลือกสี (null = ปุ่มรีเซ็ต/ไม่มีสี) */
  onPick: (hex: string | null) => void;
  /** ข้อความปุ่มรีเซ็ต เช่น "รีเซ็ต" (สีตัวอักษร) หรือ "ไม่มีสี" (ไฮไลต์) — ไม่ใส่ = ไม่มีปุ่ม */
  resetLabel?: string;
  /** ชื่อเมนู สำหรับโปรแกรมอ่านหน้าจอ */
  label: string;
  /** เพิ่มชุดสีของเมนูนั้น ๆ ไว้บนสุด เช่น สีพาสเทลของการ์ด */
  presets?: { title: string; colors: { hex: string; name: string }[] };
  onClose?: () => void;
};

/** ตารางสี (วางในป๊อปอัปหรือในหน้าได้) */
export function ColorPalette({ value, onPick, resetLabel, label, presets, onClose }: PaletteProps) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const cur = toHex(value);
  // แสดงเฉพาะหลังผู้ใช้กดเปิด (ฝั่งเบราว์เซอร์) จึงอ่าน localStorage ตอนสร้างได้เลย
  const [custom, setCustom] = useState<string[]>(() => (typeof window === "undefined" ? [] : readCustom()));
  const [adding, setAdding] = useState(false);
  const [hex, setHex] = useState(cur ?? "#F26B38");
  const [bad, setBad] = useState(false);
  const canDrop = typeof window !== "undefined" && "EyeDropper" in window;

  // โฟกัสสีปัจจุบัน (หรือสีแรก) ตอนเปิด
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = el.querySelector<HTMLButtonElement>('.cp-sw[aria-checked="true"]') ?? el.querySelector<HTMLButtonElement>(".cp-sw");
    on?.focus({ preventScroll: true });
  }, []);

  const pick = (h: string | null, remember = false) => {
    if (h && remember) setCustom(saveCustom(h));
    onPick(h);
  };

  const applyHex = () => {
    const h = toHex(hex.startsWith("#") ? hex : `#${hex}`);
    if (!h) return setBad(true);
    setBad(false);
    setAdding(false);
    pick(h, true);
  };

  const drop = async () => {
    try {
      const r = await new (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper().open();
      const h = toHex(r.sRGBHex);
      if (h) pick(h, true);
    } catch {
      /* ผู้ใช้กด Esc */
    }
  };

  // ลูกศรเลื่อนในตาราง (10 คอลัมน์ / แถวละกลุ่ม)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
      return;
    }
    const t = e.target as HTMLElement;
    if (!t.classList.contains("cp-sw")) return;
    const all = [...(box.current?.querySelectorAll<HTMLButtonElement>(".cp-sw") ?? [])];
    const i = all.indexOf(t as HTMLButtonElement);
    const row = (el: HTMLElement) => el.closest<HTMLElement>(".cp-row");
    let j = -1;
    if (e.key === "ArrowRight") j = i + 1;
    else if (e.key === "ArrowLeft") j = i - 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const r = row(t)!;
      const rows = [...(box.current?.querySelectorAll<HTMLElement>(".cp-row") ?? [])];
      const col = [...r.querySelectorAll<HTMLElement>(".cp-sw")].indexOf(t);
      const nr = rows[rows.indexOf(r) + (e.key === "ArrowDown" ? 1 : -1)];
      if (nr) {
        const sw = nr.querySelectorAll<HTMLButtonElement>(".cp-sw");
        if (sw.length) j = all.indexOf(sw[Math.min(col, sw.length - 1)]);
      }
    } else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = all.length - 1;
    else return;
    e.preventDefault();
    all[Math.max(0, Math.min(all.length - 1, j))]?.focus();
  };

  const sw = (h: string, name?: string, remember = false) => (
    <button
      key={h}
      type="button"
      role="radio"
      className={`cp-sw${light(h) ? " lt" : ""}`}
      aria-checked={cur === h}
      aria-label={name ?? colorName(h)}
      title={`${name ?? colorName(h)} ${h}`}
      tabIndex={-1}
      style={{ background: h }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => pick(h, remember)}
    />
  );

  return (
    <div ref={box} className="cp" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {resetLabel && (
        <button type="button" className="cp-reset" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M5 12a7 7 0 0 1 12-5M19 12a7 7 0 0 1-12 5" /></svg>
          {resetLabel}
        </button>
      )}
      {presets && (
        <>
          <div className="cp-h">{presets.title}</div>
          <div className="cp-row cp-pre">{presets.colors.map((c) => sw(c.hex, c.name))}</div>
        </>
      )}
      {PALETTE.rows.map((r, i) => (
        <div key={i} className={`cp-row${i === 1 ? " gap" : ""}`}>
          {r.map((h) => sw(h))}
        </div>
      ))}
      <div className="cp-h">สีของร้าน</div>
      <div className="cp-row">{BRAND.map((h) => sw(h))}</div>
      <div className="cp-h">กำหนดเอง</div>
      <div className="cp-row cp-custom">
        {custom.map((h) => sw(h, `สีที่กำหนดเอง ${h}`, true))}
        <button type="button" className="cp-tool" aria-label="เพิ่มสีกำหนดเอง" title="เพิ่มสีกำหนดเอง (วงล้อสี / รหัส HEX)" aria-expanded={adding}
          onMouseDown={(e) => e.preventDefault()} onClick={() => setAdding((a) => !a)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
        </button>
        {canDrop && (
          <button type="button" className="cp-tool" aria-label="ดูดสีจากหน้าจอ" title="ดูดสีจากหน้าจอ" onMouseDown={(e) => e.preventDefault()} onClick={drop}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7 3 3M5 19l1.5-.5L17 8l-1-1-2-2-1 1L2.5 16.5 2 18l1 1zM14 5l2-2a2.1 2.1 0 0 1 3 3l-2 2" /></svg>
          </button>
        )}
      </div>
      {adding && (
        // ไม่ใช้ <form> — อาจอยู่ในฟอร์มสินค้า (ฟอร์มซ้อนจะส่งฟอร์มนอก)
        <div className="cp-add" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyHex(); } }}>
          <label htmlFor={`${id}w`} className="sr-only">วงล้อสี</label>
          <input id={`${id}w`} type="color" value={toHex(hex) ?? "#000000"} onChange={(e) => { setHex(e.target.value.toUpperCase()); setBad(false); }} />
          <label htmlFor={`${id}x`} className="sr-only">รหัสสี HEX</label>
          <input id={`${id}x`} className={`cp-hex${bad ? " bad" : ""}`} value={hex} maxLength={7} spellCheck={false} placeholder="#RRGGBB" aria-invalid={bad}
            onChange={(e) => { setHex(e.target.value.trim()); setBad(false); }} />
          <span className="cp-prev" style={{ background: toHex(hex.startsWith("#") ? hex : `#${hex}`) ?? "transparent" }} aria-hidden="true" />
          <button type="button" className="btn btn-primary btn-sm" onClick={applyHex}>ใช้สีนี้</button>
          {bad && <span className="cp-err" role="alert">รหัสสีไม่ถูกต้อง เช่น #F26B38</span>}
        </div>
      )}
    </div>
  );
}

/** ป๊อปอัปตัวเลือกสี — วางใน wrapper ที่ position:relative · ปิดเมื่อคลิกนอก/Esc · ไม่ล้นขอบจอ */
export function ColorPopover({ open, onClose, ...p }: PaletteProps & { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<"left" | "right">("left");
  const close = useCallback(() => onClose(), [onClose]);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) setSide("right");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const w = ref.current?.parentElement;
      if (w && !w.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, close]);

  if (!open) return null;
  return (
    <div ref={ref} className={`cp-pop ${side}`} role="dialog" aria-label={p.label}>
      <ColorPalette {...p} onClose={close} />
    </div>
  );
}
