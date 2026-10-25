// สเปกสินค้าแบบมีโครงสร้าง (U6/A5) — นิยามสเปกต่อหมวด (SpecAttribute) + ค่าของสินค้า (Product.attrs)
// ไฟล์นี้ไม่มี import ฝั่ง server → ใช้ได้ทั้งหน้าร้าน หลังบ้าน (ฟอร์มฝั่งเบราว์เซอร์) และ server action

export type AttrType = "TEXT" | "NUMBER" | "ENUM";
export type SpecDef = {
  id: string;
  categoryId: string | null;
  code: string;
  label: string;
  unit: string | null;
  type: AttrType;
  options: string[];
  filterable: boolean;
  sortOrder: number;
};
export type AttrValue = string | number;
export type Attrs = Record<string, AttrValue>;

/** รหัสสเปก: a-z ตัวแรก ตามด้วย a-z 0-9 _ (ใช้เป็นชื่อพารามิเตอร์ใน URL ตัวกรอง) */
export const CODE_RE = /^[a-z][a-z0-9_]{0,29}$/;
export const ATTR_TYPES: Record<AttrType, string> = { ENUM: "ตัวเลือก (เลือกได้หลายค่าในตัวกรอง)", NUMBER: "ตัวเลข (กรองเป็นช่วง)", TEXT: "ข้อความ" };

/** อ่าน Product.attrs จาก JSON — ตัดค่าที่ผิดรูป */
export function parseAttrs(v: unknown): Attrs {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Attrs = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!CODE_RE.test(k)) continue;
    if (typeof x === "number" && Number.isFinite(x)) out[k] = x;
    else if (typeof x === "string" && x.trim()) out[k] = x.trim().slice(0, 100);
  }
  return out;
}

/** สเปกที่ใช้กับหมวดนี้ = สเปกกลาง (ทุกหมวด) + สเปกของหมวด (รหัสซ้ำ → ใช้ของหมวด) เรียงตาม sortOrder */
export function defsFor(defs: SpecDef[], categoryId: string | null | undefined): SpecDef[] {
  const byCode = new Map<string, SpecDef>();
  for (const d of defs) if (d.categoryId === null) byCode.set(d.code, d);
  if (categoryId) for (const d of defs) if (d.categoryId === categoryId) byCode.set(d.code, d);
  return [...byCode.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "th"));
}

const numFmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** ค่าที่แสดงในตารางสเปก เช่น "12 W", "IP68" */
export function formatAttr(def: Pick<SpecDef, "type" | "unit">, v: AttrValue) {
  if (def.type === "NUMBER" && typeof v === "number") {
    const u = def.unit?.trim();
    return u ? (/^[°%]/.test(u) ? `${numFmt(v)}${u}` : `${numFmt(v)} ${u}`) : numFmt(v);
  }
  return String(v);
}

/** แปลงข้อความเป็นตัวเลข: "12", "1,200", "12.5W" → number | null */
export function toNumber(s: string): number | null {
  const m = s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * ตรวจค่าสเปกจากฟอร์มหลังบ้าน: เก็บเฉพาะรหัสที่หมวดนี้มี · ENUM ต้องอยู่ในตัวเลือก · NUMBER ต้องเป็นตัวเลข
 * คืน attrs ที่สะอาด + รายชื่อรหัสที่ผิด
 */
export function cleanAttrs(defs: SpecDef[], raw: Record<string, unknown>): { attrs: Attrs; bad: string[] } {
  const attrs: Attrs = {};
  const bad: string[] = [];
  for (const d of defs) {
    const v = raw[d.code];
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    if (d.type === "NUMBER") {
      const n = toNumber(s);
      if (n == null || Math.abs(n) > 1e9) bad.push(d.code);
      else attrs[d.code] = n;
    } else if (d.type === "ENUM") {
      const hit = d.options.find((o) => o === s) ?? d.options.find((o) => o.toLowerCase() === s.toLowerCase());
      if (!hit) bad.push(d.code);
      else attrs[d.code] = hit;
    } else attrs[d.code] = s.slice(0, 100);
  }
  return { attrs, bad };
}

/** แยกตัวเลือกจากข้อความในหลังบ้าน (ขึ้นบรรทัดใหม่หรือ ,) — ไม่ซ้ำ ไม่เกิน 40 ค่า */
export function parseOptions(text: string) {
  const out: string[] = [];
  for (const s of text.split(/[\n,]/)) {
    const v = s.trim().slice(0, 60);
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, 40);
}

// ---------- ตัวกรองในหน้าหมวด (อยู่ใน URL) ----------
// ENUM/TEXT: ?f_ip=IP68&f_ip=IP67 (เลือกหลายค่า = "ค่าใดค่าหนึ่ง") · NUMBER: ?f_watt_min=5&f_watt_max=20

export type SpecFilter = { enums: Record<string, string[]>; ranges: Record<string, { min: number | null; max: number | null }> };
type Params = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export function readSpecFilter(sp: Params, defs: SpecDef[]): SpecFilter {
  const f: SpecFilter = { enums: {}, ranges: {} };
  for (const d of defs) {
    if (!d.filterable) continue;
    if (d.type === "NUMBER") {
      const min = toNumber(list(sp[`f_${d.code}_min`])[0] ?? "");
      const max = toNumber(list(sp[`f_${d.code}_max`])[0] ?? "");
      if (min != null || max != null) f.ranges[d.code] = { min, max };
    } else {
      const vals = [...new Set(list(sp[`f_${d.code}`]).map((v) => v.trim().slice(0, 100)).filter(Boolean))].slice(0, 20);
      if (vals.length) f.enums[d.code] = vals;
    }
  }
  return f;
}

export const specFilterActive = (f: SpecFilter) => Object.keys(f.enums).length + Object.keys(f.ranges).length > 0;

/** สินค้าผ่านตัวกรองสเปกหรือไม่ (ไม่มีค่าสเปกนั้น = ไม่ผ่านเมื่อเลือกกรองสเปกนั้น) · skip = รหัสที่ไม่นำมาคิด (ใช้นับจำนวนต่อตัวเลือก) */
export function matchSpecs(attrs: Attrs, f: SpecFilter, skip?: string) {
  for (const [code, vals] of Object.entries(f.enums)) {
    if (code === skip) continue;
    const v = attrs[code];
    if (v == null || !vals.includes(String(v))) return false;
  }
  for (const [code, r] of Object.entries(f.ranges)) {
    if (code === skip) continue;
    const v = attrs[code];
    if (typeof v !== "number") return false;
    if (r.min != null && v < r.min) return false;
    if (r.max != null && v > r.max) return false;
  }
  return true;
}

/** query string ของตัวกรองสเปก (ใช้ต่อท้าย URL ของหน้าหมวด) */
export function specFilterEntries(f: SpecFilter): [string, string][] {
  const out: [string, string][] = [];
  for (const [code, vals] of Object.entries(f.enums)) for (const v of vals) out.push([`f_${code}`, v]);
  for (const [code, r] of Object.entries(f.ranges)) {
    if (r.min != null) out.push([`f_${code}_min`, String(r.min)]);
    if (r.max != null) out.push([`f_${code}_max`, String(r.max)]);
  }
  return out;
}

// ---------- ชุดสเปกมาตรฐานสำหรับไฟ LED (ปุ่ม "เพิ่มชุดมาตรฐาน" ในหลังบ้าน) ----------

export const LED_SPEC_PRESET: Omit<SpecDef, "id" | "categoryId">[] = [
  { code: "watt", label: "กำลังไฟ", unit: "W", type: "NUMBER", options: [], filterable: true, sortOrder: 10 },
  { code: "voltage", label: "แรงดันไฟ", unit: null, type: "ENUM", options: ["DC12V", "DC24V", "AC12V", "AC24V", "AC220V"], filterable: true, sortOrder: 20 },
  { code: "ip", label: "ระดับกันน้ำ", unit: null, type: "ENUM", options: ["IP44", "IP65", "IP66", "IP67", "IP68"], filterable: true, sortOrder: 30 },
  { code: "cct", label: "สีแสง / อุณหภูมิสี", unit: null, type: "ENUM", options: ["แสงขาว (6000–6500K)", "วอร์มไวท์ (3000–3500K)", "เนเชอรัลไวท์ (4000K)", "RGB เปลี่ยนสี", "สีเดียว (แดง/เขียว/น้ำเงิน)"], filterable: true, sortOrder: 40 },
  { code: "beam", label: "มุมแสง", unit: "°", type: "NUMBER", options: [], filterable: false, sortOrder: 50 },
  { code: "material", label: "วัสดุ", unit: null, type: "ENUM", options: ["สแตนเลส", "อะลูมิเนียม", "พลาสติก ABS", "ทองเหลือง"], filterable: true, sortOrder: 60 },
];
