// ลายน้ำรูปภาพ (ตั้งค่าร้าน → ลายน้ำ): ฟังก์ชันล้วน ใช้ได้ทั้ง server และ client
// รูปที่ใส่ลายน้ำเปิดผ่าน /media/wm/<รุ่น>/<key> — รุ่น (ver) คำนวณจากค่าตั้ง เปลี่ยนค่า = ได้ URL ใหม่ รูปสร้างใหม่อัตโนมัติ · ไฟล์ต้นฉบับไม่ถูกแก้
export const WM_POSITIONS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br", "tile"] as const;
export type WmPos = (typeof WM_POSITIONS)[number];
export const WM_POS_LABEL: Record<WmPos, string> = {
  tl: "บนซ้าย", tc: "บนกลาง", tr: "บนขวา", ml: "กลางซ้าย", mc: "กึ่งกลาง", mr: "กลางขวา", bl: "ล่างซ้าย", bc: "ล่างกลาง", br: "ล่างขวา", tile: "ทั้งภาพ (เรียงซ้ำ)",
};
export type Watermark = {
  /** ไฟล์ลายน้ำ (logo/…webp พื้นใส) · ว่าง = ยังไม่ได้ตั้ง */
  key: string;
  pos: WmPos;
  /** ความกว้างของลายน้ำ % ของความกว้างรูป */
  size: number;
  /** ความทึบ % */
  opacity: number;
  /** ระยะจากขอบ % ของความกว้างรูป */
  margin: number;
  /** ใช้กับรูปสินค้าหลักในหน้ารายละเอียดสินค้าด้วย (รูปย่อ/การ์ดสินค้าไม่ใส่) */
  main: boolean;
};
export const WM_DEFAULT: Watermark = { key: "", pos: "br", size: 22, opacity: 60, margin: 3, main: false };
export const WM_KEY_RE = /^logo\/[\w/.-]+\.webp$/;
export const WM_LIMITS = { size: [5, 60], opacity: [10, 100], margin: [0, 10] } as const;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown, [lo, hi]: readonly [number, number], d: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

export function parseWatermark(raw: unknown): Watermark {
  const o = obj(typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw);
  return {
    key: typeof o.key === "string" && WM_KEY_RE.test(o.key) ? o.key : "",
    pos: (WM_POSITIONS as readonly string[]).includes(o.pos as string) ? (o.pos as WmPos) : WM_DEFAULT.pos,
    size: int(o.size, WM_LIMITS.size, WM_DEFAULT.size),
    opacity: int(o.opacity, WM_LIMITS.opacity, WM_DEFAULT.opacity),
    margin: int(o.margin, WM_LIMITS.margin, WM_DEFAULT.margin),
    main: o.main === true,
  };
}

/** รุ่นของค่าตั้ง (8 ตัวอักษร) — ใช้ใน URL รูปที่ใส่ลายน้ำ */
export function wmVersion(w: Watermark) {
  const s = `${w.key}|${w.pos}|${w.size}|${w.opacity}|${w.margin}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).padStart(7, "0").slice(0, 8);
}

/** key รูปที่ใส่ลายน้ำได้: รูปเต็มของสินค้า (ไม่ใช่รูปย่อ) */
export const WM_TARGET_RE = /^products\/[\w/.-]+(?<!-sm)\.webp$/;

/** URL รูปที่ใส่ลายน้ำ (ไม่มีลายน้ำตั้งไว้ / key ใช้ไม่ได้ = URL เดิม) */
export function wmUrl(key: string, w: Watermark | null): string {
  if (!w?.key || !WM_TARGET_RE.test(key)) return `/media/${key}`;
  return `/media/wm/${wmVersion(w)}/${key}`;
}

/** ตำแหน่งลายน้ำเป็น CSS (ตัวอย่างในหลังบ้าน — ให้ตรงกับไฟล์จริง) */
export function wmPreviewStyle(w: Watermark): Record<string, string> {
  const m = `${w.margin}%`;
  const [v, h] = w.pos === "tile" ? ["m", "c"] : [w.pos[0], w.pos[1]];
  return {
    position: "absolute",
    width: `${w.size}%`,
    opacity: String(w.opacity / 100),
    ...(v === "t" ? { top: m } : v === "b" ? { bottom: m } : { top: "50%" }),
    ...(h === "l" ? { left: m } : h === "r" ? { right: m } : { left: "50%" }),
    transform: `translate(${h === "c" ? "-50%" : "0"},${v === "m" ? "-50%" : "0"})`,
    pointerEvents: "none",
  };
}
