// Data Sheet สินค้า — ฟังก์ชันล้วน (ไม่มี import) ใช้ได้ทั้ง server (ตรวจซ้ำตอนบันทึก/แสดงผล) และเบราว์เซอร์ (ตัวแก้ไขในหลังบ้าน)
// โครง: กลุ่ม (ชื่อไทย + EN) → แถว (หัวข้อไทย + EN + ค่า + ไฮไลต์) · หมายเหตุท้ายตาราง · รูปแบบ ("" = ตามค่าร้าน)
// แสดงผล: A ตารางเรียบ 2 คอลัมน์ · B แผ่นข้อมูลจัดกลุ่ม + แถบไฮไลต์ · C ตารางเทียบทุกรุ่น (สินค้าในกลุ่มตัวเลือก)

export type DsRow = { label: string; en: string; value: string; hl: boolean };
export type DsGroup = { title: string; en: string; rows: DsRow[] };
export type DsStyle = "A" | "B";
export type Datasheet = { groups: DsGroup[]; note: string; style: "" | DsStyle };

export const DS_LIMITS = { groups: 12, rows: 80, label: 60, en: 60, value: 300, title: 60, note: 300, highlights: 6 } as const;
export const DS_STYLES: Record<DsStyle, string> = { A: "ตารางเรียบ (รายการ | Specification)", B: "Data Sheet มืออาชีพ (จัดกลุ่ม + แถบไฮไลต์)" };
export const EMPTY_DS: Datasheet = { groups: [], note: "", style: "" };

const line = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "");
export const isDsStyle = (v: unknown): v is DsStyle => v === "A" || v === "B";

/**
 * ค่าที่บันทึก/ส่งมา → Data Sheet ที่ใช้ได้: ตัดแถวที่ไม่มีค่า · กลุ่มที่ไม่มีแถว · ความยาว/จำนวนเกิน · ไฮไลต์ ≤ 6
 * (ตัวแก้ไขเก็บแถวว่างไว้ระหว่างพิมพ์ — ตัดตอนบันทึกเท่านั้น)
 */
export function parseDatasheet(v: unknown): Datasheet {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const groups: DsGroup[] = [];
  let rows = 0, hls = 0;
  for (const g of Array.isArray(o.groups) ? o.groups : []) {
    if (!g || typeof g !== "object" || groups.length >= DS_LIMITS.groups) continue;
    const gg = g as Record<string, unknown>;
    const out: DsRow[] = [];
    for (const r of Array.isArray(gg.rows) ? gg.rows : []) {
      if (!r || typeof r !== "object" || rows >= DS_LIMITS.rows) continue;
      const rr = r as Record<string, unknown>;
      const value = line(rr.value, DS_LIMITS.value);
      if (!value) continue;
      const hl = rr.hl === true && hls < DS_LIMITS.highlights;
      if (hl) hls++;
      out.push({ label: line(rr.label, DS_LIMITS.label), en: line(rr.en, DS_LIMITS.en), value, hl });
      rows++;
    }
    if (out.length) groups.push({ title: line(gg.title, DS_LIMITS.title), en: line(gg.en, DS_LIMITS.title), rows: out });
  }
  return { groups, note: line(o.note, DS_LIMITS.note), style: isDsStyle(o.style) ? o.style : "" };
}

export const dsRows = (ds: Datasheet) => ds.groups.flatMap((g) => g.rows);
export const dsEmpty = (ds: Datasheet | null | undefined) => !ds || !dsRows(ds).length;
/** รูปแบบที่ใช้จริง: ของสินค้า → ค่าร้าน */
export const dsStyleOf = (ds: Datasheet, shop: string): DsStyle => (ds.style || (isDsStyle(shop) ? shop : "B"));
/** แถวไฮไลต์ (แบบ B) — ไม่ได้ติ๊กเลย = ไม่แสดงแถบ */
export const dsHighlights = (ds: Datasheet) => dsRows(ds).filter((r) => r.hl).slice(0, DS_LIMITS.highlights);
/** หัวข้อที่แสดง (ไทย → EN → "คุณสมบัติ") */
export const dsLabel = (r: Pick<DsRow, "label" | "en">) => r.label || r.en || "คุณสมบัติ";

/** ค่าหลายตัวเลือกคั่นด้วย "/" (≥ 3 ค่า ค่าละไม่ยาว) → ป้าย เช่น มุมลำแสง 15° / 25° / 35° · อื่น ๆ = null (แสดงเป็นข้อความ) */
export function dsChips(value: string): string[] | null {
  const parts = value.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 3 && parts.every((p) => p.length <= 16) ? parts : null;
}

/** ไอคอนของแถบไฮไลต์ตามหัวข้อ (เดาจากคำ — ไม่ตรงอะไร = ★) */
export function dsIcon(r: Pick<DsRow, "label" | "en">): string {
  const t = `${r.label} ${r.en}`.toLowerCase();
  const map: [RegExp, string][] = [
    [/กำลังไฟ|วัตต์|power|watt/, "⚡"], [/แรงดัน|โวลต์|voltage|input/, "🔌"], [/สี|color|cct|อุณหภูมิ/, "🌈"],
    [/กันน้ำ|ip\b|ip rating|waterproof/, "💧"], [/อายุ|lifespan|life|ชั่วโมง/, "⏱"], [/ประกัน|warranty/, "🛡"],
    [/มุม|beam|angle/, "📐"], [/ความสว่าง|lumen|ลูเมน/, "☀"], [/วัสดุ|material/, "🧱"], [/ขนาด|dimension|size/, "📏"],
    [/น้ำหนัก|weight/, "⚖"], [/ควบคุม|control|รีโมท/, "🎛"], [/ชิป|chip|led/, "💡"],
  ];
  return map.find(([re]) => re.test(t))?.[1] ?? "★";
}

/** หัวตารางที่วางมาด้วย ("รายการ | Specification") — ข้าม */
const HEADER_RE = /^(รายการ|หัวข้อ|item|items|parameter|spec(ification)?s?|คุณสมบัติ)$/i;
const VALUE_HEAD_RE = /^(spec(ification)?s?|value|ค่า|รายละเอียด|ข้อมูล|detail)$/i;

/**
 * ข้อความที่วางจาก Excel / Google Sheets / PDF / เว็บ → กลุ่มและแถว
 * แยกคอลัมน์ด้วย Tab · " | " · ":" · ช่องว่าง 2 ตัวขึ้นไป · "......" (แบบคำอธิบายเดิมของร้าน) · บรรทัดเดียวไม่มีตัวแยก = ชื่อกลุ่ม
 * 3 คอลัมน์ (ไทย | EN | ค่า) ใช้ได้ — ในตาราง 3 คอลัมน์ บรรทัด 2 ช่อง (ไทย | EN) = ชื่อกลุ่ม · ตัด "- " / "• " หน้าบรรทัด
 */
export function parsePaste(text: string): DsGroup[] {
  // แยกทุกบรรทัดเป็นช่องก่อน แล้วค่อยตัดสินว่าบรรทัดไหนเป็นชื่อกลุ่ม
  const lines: string[][] = [];
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const l = raw.replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, "").replace(/\u00a0/g, " ").trimEnd();
    if (!l.trim()) continue;
    let cells: string[];
    if (l.includes("\t")) cells = l.split("\t");
    else if (/\s\|\s|^\||\|$/.test(l)) cells = l.split("|");
    else if (/\.{3,}/.test(l)) cells = l.split(/\.{3,}/);
    else if (/^[^:：]{1,60}[:：]\s*\S/.test(l)) { const i = l.search(/[:：]/); cells = [l.slice(0, i), l.slice(i + 1)]; }
    else if (/\S\s{2,}\S/.test(l)) cells = l.split(/\s{2,}/);
    else cells = [l];
    cells = cells.map((c) => c.trim()).filter((c, i, a) => c || (i > 0 && i < a.length - 1));
    if (cells.length >= 2 && HEADER_RE.test(cells[0]) && VALUE_HEAD_RE.test(cells[cells.length - 1])) continue;
    lines.push(cells);
  }
  // ตาราง 3 คอลัมน์ (ไทย | EN | ค่า): บรรทัด 2 ช่องคือชื่อกลุ่ม (ไทย | EN) ไม่ใช่แถวข้อมูล
  const multi = lines.filter((c) => c.length >= 2);
  const threeCol = multi.length > 0 && multi.filter((c) => c.length >= 3).length * 2 > multi.length;
  const groups: DsGroup[] = [];
  let cur: DsGroup | null = null;
  for (const cells of lines) {
    if (cells.length === 1 || (threeCol && cells.length === 2)) {
      const t = cells[0].replace(/[:：]$/, "").trim();
      if (t.length <= DS_LIMITS.title) { cur = { title: t, en: (cells[1] ?? "").slice(0, DS_LIMITS.title), rows: [] }; groups.push(cur); }
      continue;
    }
    if (!cur) { cur = { title: "", en: "", rows: [] }; groups.push(cur); }
    cur.rows.push({
      label: cells[0].slice(0, DS_LIMITS.label),
      en: (cells.length >= 3 ? cells[1] : "").slice(0, DS_LIMITS.en),
      value: cells[cells.length - 1].slice(0, DS_LIMITS.value),
      hl: false,
    });
  }
  return groups.filter((g) => g.rows.length || g.title);
}

/** สเปกเดิมของสินค้า (หัวข้อ/ค่า + สเปกตามหมวด) → กลุ่มเดียว */
export function fromSpecs(specs: { label: string; value: string }[], attrs: { label: string; value: string }[] = []): DsGroup[] {
  const seen = new Set<string>();
  const rows: DsRow[] = [];
  for (const s of [...attrs, ...specs]) {
    const label = line(s.label, DS_LIMITS.label), value = line(s.value, DS_LIMITS.value);
    if (!value || seen.has(label)) continue;
    seen.add(label);
    rows.push({ label, en: "", value, hl: false });
  }
  return rows.length ? [{ title: "", en: "", rows }] : [];
}

/** Data Sheet → แม่แบบของหมวด (หัวข้อ/กลุ่ม/ไฮไลต์ ไม่มีค่า) */
export function toTemplate(groups: DsGroup[]): DsGroup[] {
  return groups
    .map((g) => ({ title: line(g.title, DS_LIMITS.title), en: line(g.en, DS_LIMITS.title), rows: g.rows.filter((r) => r.label || r.en).map((r) => ({ label: line(r.label, DS_LIMITS.label), en: line(r.en, DS_LIMITS.en), value: "", hl: !!r.hl })) }))
    .filter((g) => g.rows.length)
    .slice(0, DS_LIMITS.groups);
}
/** แม่แบบที่บันทึกไว้ในหมวด → กลุ่ม (ค่าว่าง) */
export function parseTemplate(v: unknown): DsGroup[] {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const groups = Array.isArray(o.groups) ? o.groups : Array.isArray(v) ? v : [];
  return toTemplate(groups.filter((g): g is DsGroup => !!g && typeof g === "object" && Array.isArray((g as DsGroup).rows)));
}

/** ใช้แม่แบบ: หัวข้อตามแม่แบบ ค่าเดิมที่หัวข้อตรงกันยังอยู่ · แถวเดิมที่ไม่อยู่ในแม่แบบต่อท้ายกลุ่ม "อื่น ๆ" */
export function applyTemplate(template: DsGroup[], current: DsGroup[]): DsGroup[] {
  const key = (r: Pick<DsRow, "label" | "en">) => (r.label || r.en).toLowerCase();
  const old = new Map(current.flatMap((g) => g.rows).filter((r) => r.value).map((r) => [key(r), r]));
  const used = new Set<string>();
  const out = template.map((g) => ({
    ...g,
    rows: g.rows.map((r) => {
      const o = old.get(key(r));
      if (o) used.add(key(r));
      return { ...r, value: o?.value ?? "", hl: r.hl || !!o?.hl };
    }),
  }));
  const rest = current.flatMap((g) => g.rows).filter((r) => r.value && !used.has(key(r)));
  if (rest.length) out.push({ title: "อื่น ๆ", en: "Others", rows: rest });
  return out;
}

export type DsCompare = {
  cols: { slug: string; label: string; current: boolean; price: number; inStock: boolean }[];
  rows: { label: string; en: string; values: string[]; same: boolean }[];
};

/**
 * ตารางเทียบรุ่น (แบบ C): หัวข้อเรียงตาม Data Sheet ของรุ่นที่กำลังดู แล้วต่อด้วยหัวข้อที่มีเฉพาะรุ่นอื่น
 * same = ทุกรุ่นมีค่าเท่ากัน · ต้องมี ≥ 2 รุ่นที่มี Data Sheet จึงแสดง (null = ไม่แสดง)
 */
export function dsCompare(members: { slug: string; label: string; current: boolean; price: number; inStock: boolean; ds: Datasheet }[]): DsCompare | null {
  const withDs = members.filter((m) => !dsEmpty(m.ds));
  if (withDs.length < 2) return null;
  const key = (r: Pick<DsRow, "label" | "en">) => (r.label || r.en).toLowerCase();
  const order: { k: string; label: string; en: string }[] = [];
  const seen = new Set<string>();
  const cur = withDs.find((m) => m.current) ?? withDs[0];
  for (const m of [cur, ...withDs.filter((x) => x !== cur)])
    for (const r of dsRows(m.ds)) if (!seen.has(key(r))) { seen.add(key(r)); order.push({ k: key(r), label: r.label, en: r.en }); }
  const maps = withDs.map((m) => new Map(dsRows(m.ds).map((r) => [key(r), r.value])));
  return {
    cols: withDs.map((m) => ({ slug: m.slug, label: m.label, current: m.current, price: m.price, inStock: m.inStock })),
    rows: order.map((o) => {
      const values = maps.map((mp) => mp.get(o.k) ?? "");
      return { label: o.label, en: o.en, values, same: values.every((v) => v && v === values[0]) };
    }),
  };
}
