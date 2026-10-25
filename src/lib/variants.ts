// สินค้าหลายตัวเลือก (U1/A1) — สินค้าแต่ละตัวเลือกเป็น Product แยก (ราคา/รูป/สต็อก/URL ของตัวเอง) ผูกกันด้วย VariantGroup
// ไฟล์นี้ไม่มี import ฝั่ง server → ใช้ได้ทั้งหน้าร้าน หลังบ้าน และสคริปต์

export type VariantMember = {
  slug: string;
  name: string;
  sku: string;
  options: Record<string, string>;
  inStock: boolean;
  price: number;
  img?: string | null;
};
export type VariantGroupView = { id: string; name: string; optionNames: string[]; primarySlug: string; members: VariantMember[] };

export const MAX_OPTIONS = 3;

/** อ่าน Product.variantOptions ตามชื่อตัวเลือกของกลุ่ม (ค่าที่ไม่มี = "") */
export function readOptions(v: unknown, names: string[]): Record<string, string> {
  const src = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(names.map((n) => [n, typeof src[n] === "string" ? (src[n] as string).trim().slice(0, 60) : ""]));
}

/** ชื่อตัวเลือกของกลุ่มจากข้อความ "สี, วัตต์" — ไม่ซ้ำ ไม่เกิน 3 */
export function parseOptionNames(text: string) {
  const out: string[] = [];
  for (const s of text.split(/[,\n]/)) {
    const v = s.trim().slice(0, 30);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, MAX_OPTIONS);
}

/** ข้อความตัวเลือก เช่น "แสงขาว · 10W" */
export const optionLabel = (names: string[], o: Record<string, string>) => names.map((n) => o[n]).filter(Boolean).join(" · ");

export type SelectorValue = { value: string; slug: string | null; current: boolean; out: boolean };
export type SelectorRow = { name: string; values: SelectorValue[] };

/**
 * ปุ่มเลือกตัวเลือกบนหน้าสินค้า (เลือกตามลำดับชั้น: ตัวเลือกแรกเลือกได้ทุกค่า
 * ตัวเลือกถัดไปเลือกได้เฉพาะค่าที่มีอยู่จริงคู่กับค่าที่เลือกไว้ก่อนหน้า — ไม่มีคู่นั้น = ปิดปุ่ม)
 * ปลายทางของปุ่ม = ตัวเลือกที่ตรงกับค่าปัจจุบันมากที่สุด จึงไปถึงได้ทุกตัวเลือกเสมอ
 */
export function selectorRows(g: VariantGroupView, currentSlug: string): SelectorRow[] {
  const cur = g.members.find((m) => m.slug === currentSlug);
  if (!cur) return [];
  return g.optionNames.map((name, i) => {
    const earlier = g.optionNames.slice(0, i);
    const values: string[] = [];
    for (const m of g.members) if (m.options[name] && !values.includes(m.options[name])) values.push(m.options[name]);
    return {
      name,
      values: values.map((value) => {
        const cands = g.members.filter((m) => m.options[name] === value && earlier.every((n) => m.options[n] === cur.options[n]));
        // ตรงกับค่าปัจจุบันของตัวเลือกอื่นมากที่สุด → มีของก่อน → ลำดับเดิม
        const score = (m: VariantMember) => g.optionNames.filter((n) => n !== name && m.options[n] === cur.options[n]).length * 2 + (m.inStock ? 1 : 0);
        const best = cands.sort((a, b) => score(b) - score(a))[0];
        return { value, slug: best?.slug ?? null, current: cur.options[name] === value, out: !!best && !best.inStock };
      }),
    };
  });
}

/** ตรวจกลุ่ม: ทุกตัวต้องมีค่าครบทุกตัวเลือก และไม่มีชุดค่าซ้ำกัน — คืนข้อความผิด (null = ผ่าน) */
export function validateGroup(optionNames: string[], members: { label: string; options: Record<string, string> }[]): string | null {
  if (!optionNames.length) return "กรุณาตั้งชื่อตัวเลือกอย่างน้อย 1 อย่าง เช่น สี หรือ วัตต์";
  const seen = new Map<string, string>();
  for (const m of members) {
    const miss = optionNames.find((n) => !m.options[n]);
    if (miss) return `"${m.label}" ยังไม่ได้ใส่ค่า "${miss}"`;
    const key = optionNames.map((n) => m.options[n].toLowerCase()).join("\u0000");
    if (seen.has(key)) return `"${m.label}" มีค่าตัวเลือกซ้ำกับ "${seen.get(key)}" (${optionLabel(optionNames, m.options)})`;
    seen.set(key, m.label);
  }
  return null;
}

// ---------- แนะนำกลุ่มจากชื่อสินค้า (สินค้าที่นำเข้าจาก WooCommerce ตัวเลือกย่อยกลายเป็นสินค้าแยก) ----------

const COLORS: [string, RegExp][] = [
  ["RGB", /\brgbwa\b|\brgbw\b|\brgb\b|เปลี่ยนสี/i],
  ["วอร์มไวท์", /วอร์ม\s*ไวท์|วอม\s*ไวท์|วอร์ม|วอม|warm\s*white|warmwhite|\bwarm\b|\bww\b/i],
  ["เนเชอรัลไวท์", /natural\s*white|เนเชอรัล/i],
  ["สีแดง", /สีแดง|\(red\)|\bred\b/i],
  ["สีเขียว", /สีเขียว|\(green\)|\bgreen\b/i],
  ["สีน้ำเงิน", /สีน้ำเงิน|\(blue\)|\bblue\b/i],
  ["สีเหลือง", /สีเหลือง|\byellow\b/i],
  ["แสงขาว", /แสงขาว|แสงสีขาว|สีขาว|daylight|\bwhite\b|\bwh\b/i],
];
const WATT_RE = /(\d+(?:\.\d+)?)\s*(?:x\s*1\s*)?(?:w\b|วัตต์|w(?=[^a-z]|$))/i;

/** ดึงวัตต์/สีจากชื่อ (ใช้แนะนำกลุ่มเท่านั้น — แอดมินยืนยัน/แก้ค่าก่อนสร้างกลุ่ม) */
export function guessOptions(name: string): { watt: string | null; color: string | null } {
  // วงเล็บที่รวมหลายค่า เช่น "(Red/Green/Blue)" เป็นคำอธิบายทั้งตระกูล ไม่ใช่ค่าของตัวนี้
  const n = name.replace(/\([^)]*\/[^)]*\)/g, " ");
  const w = n.match(WATT_RE);
  const color = COLORS.find(([, re]) => re.test(n))?.[0] ?? null;
  return { watt: w ? `${Number(w[1])}W` : null, color };
}

/** ชื่อฐาน (ตัดวัตต์ สี อุณหภูมิสี วงเล็บ) สำหรับจับกลุ่ม */
export function baseName(name: string) {
  let s = name.normalize("NFC").toLowerCase();
  s = s.replace(/\([^)]*\/[^)]*\)/g, " ");
  s = s.replace(/\(([^)]*)\)/g, (m, inner: string) => (COLORS.some(([, re]) => re.test(inner)) || /\d\s*(w|วัตต์)/i.test(inner) ? " " : m));
  s = s.replace(/\d{4}\s*k(\s*-\s*\d{4}\s*k)?/gi, " ");
  s = s.replace(/(ขนาด|ขนา)?\s*\d+(?:\.\d+)?\s*(x\s*1\s*)?(w\b|วัตต์|w(?=[^a-z]|$))/gi, " ");
  for (const [, re] of COLORS) s = s.replace(new RegExp(re.source, "gi"), " ");
  s = s.replace(/แสง|สี(?=\s|$)|-\s*$/g, " ");
  return s.replace(/[\s\-_/.,]+/g, " ").trim();
}

/** ชื่อกลุ่มจากชื่อสินค้า: ตัดค่าที่เป็นตัวเลือก (วัตต์/สี) ออก */
export function groupName(name: string, optionNames: string[]) {
  let s = name.replace(/\([^)]*\/[^)]*\)/g, " ");
  if (optionNames.includes("วัตต์")) s = s.replace(/(ขนาด|ขนา)?\s*\d+(?:\.\d+)?\s*(x\s*1\s*)?(w\b|วัตต์|w(?=[^a-z]|$))/gi, " ");
  if (optionNames.includes("สี")) {
    s = s.replace(/\(([^)]*)\)/g, (m, inner: string) => (COLORS.some(([, re]) => re.test(inner)) ? " " : m));
    s = s.replace(/\d{4}\s*k(\s*-\s*\d{4}\s*k)?/gi, " ");
    for (const [, re] of COLORS) s = s.replace(new RegExp(re.source, "gi"), " ");
    s = s.replace(/(^|\s)(แสง|สี)(?=\s|$)/g, " ");
  }
  return s.replace(/\(\s*\)/g, " ").replace(/\s*-\s*$/, "").replace(/\s+/g, " ").trim().slice(0, 120) || name.slice(0, 120);
}

export type SuggestInput = { id: string; name: string; sku: string; categoryId: string; categoryName?: string; priceSatang: number; isActive: boolean };
export type Suggestion = {
  key: string;
  name: string;
  categoryName: string;
  optionNames: string[];
  members: { id: string; name: string; sku: string; options: Record<string, string>; priceSatang: number; isActive: boolean }[];
  skipped: { id: string; name: string; sku: string; reason: string }[];
};

/**
 * จับกลุ่มสินค้าในหมวดเดียวกันที่ชื่อเหมือนกันเมื่อตัดวัตต์/สีออก และต่างกันที่วัตต์หรือสี
 * (ไม่แตะฐานข้อมูล — หน้าหลังบ้านแสดงเป็นรายการให้เจ้าของร้านเลือกยืนยัน)
 */
export function suggestGroups(products: SuggestInput[]): Suggestion[] {
  const buckets = new Map<string, SuggestInput[]>();
  for (const p of products) {
    const b = baseName(p.name);
    if (b.length < 4) continue;
    const key = `${p.categoryId}|${b}`;
    buckets.set(key, [...(buckets.get(key) ?? []), p]);
  }
  const out: Suggestion[] = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const g = list.map((p) => ({ p, o: guessOptions(p.name) }));
    const optionNames: string[] = [];
    if (new Set(g.map((x) => x.o.color ?? "")).size > 1) optionNames.push("สี");
    if (new Set(g.map((x) => x.o.watt ?? "")).size > 1) optionNames.push("วัตต์");
    if (!optionNames.length) continue;
    const members: Suggestion["members"] = [];
    const skipped: Suggestion["skipped"] = [];
    const seen = new Set<string>();
    // เปิดขายก่อน → ราคาน้อยไปมาก
    for (const { p, o } of g.sort((a, b) => Number(b.p.isActive) - Number(a.p.isActive) || a.p.priceSatang - b.p.priceSatang)) {
      const options: Record<string, string> = {};
      if (optionNames.includes("สี")) options["สี"] = o.color ?? "";
      if (optionNames.includes("วัตต์")) options["วัตต์"] = o.watt ?? "";
      const miss = optionNames.find((n) => !options[n]);
      const combo = optionNames.map((n) => options[n]).join("|");
      if (miss) skipped.push({ id: p.id, name: p.name, sku: p.sku, reason: `หา${miss}จากชื่อไม่ได้` });
      else if (seen.has(combo)) skipped.push({ id: p.id, name: p.name, sku: p.sku, reason: `ตัวเลือกซ้ำ (${combo.replace("|", " · ")})` });
      else {
        seen.add(combo);
        members.push({ id: p.id, name: p.name, sku: p.sku, options, priceSatang: p.priceSatang, isActive: p.isActive });
      }
    }
    if (members.length < 2) continue;
    // เรียงตัวเลือก: สีตามลำดับในรายการ, วัตต์จากน้อยไปมาก
    members.sort((a, b) => (parseFloat(a.options["วัตต์"] ?? "0") || 0) - (parseFloat(b.options["วัตต์"] ?? "0") || 0));
    const shortest = [...members].sort((a, b) => a.name.length - b.name.length)[0].name;
    out.push({
      key,
      name: groupName(shortest, optionNames),
      categoryName: list[0].categoryName ?? "",
      optionNames,
      members,
      skipped,
    });
  }
  return out.sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name, "th"));
}
