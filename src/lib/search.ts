// ค้นหาสินค้าแบบฉลาดขึ้น (U15/A11)
// - คำพ้อง ไทย/อังกฤษ จากตาราง SearchSynonym (แก้ได้ในหลังบ้าน /admin/search) — คำใดคำหนึ่งในกลุ่มเจอก็นับว่าเจอ
// - พิมพ์ผิดเล็กน้อยยังเจอ: ไม่เจอแบบตรงทุกคำ → เทียบแบบใกล้เคียง (edit distance ภายในข้อความ ไม่พึ่ง extension ของ Postgres
//   เพราะสินค้ามีราว 200 รายการ ค้นในหน่วยความจำเร็วพอ) แล้วบอกลูกค้าว่าเป็น "ผลใกล้เคียง"
// - บันทึกคำค้น (ตัดช่องว่าง ตัวพิมพ์เล็ก ไม่เก็บ IP/ผู้ใช้ และไม่เก็บคำที่ดูเหมือนเบอร์โทร/อีเมล) + จำนวนผล
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";
import type { CatalogItem, ShopCategory } from "@/lib/storefront";

/** ตัวพิมพ์เล็ก/ใหญ่ เว้นวรรค ขีด จุด ไม่มีผล ("DL-1", "dl 1", "DL1" เหมือนกัน) — ต้องตรงกับ shell.js */
export const normWord = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[​-‍﻿]/g, "")
    .replace(/[\s\-_./,()[\]"'“”+]+/g, "");

/** ชุดคำพ้องเริ่มต้น (ชุดเดียวกับ migration 20261022092000_lot10_search_synonyms + ปุ่ม "เพิ่มชุดเริ่มต้น" ในหลังบ้าน) */
export const DEFAULT_SYNONYMS: string[][] = [
  ["ใต้น้ำ", "ไฟใต้น้ำ", "underwater"],
  ["สระ", "สระว่ายน้ำ", "ไฟสระ", "pool", "swimming pool"],
  ["น้ำพุ", "ไฟน้ำพุ", "fountain"],
  ["สวน", "ไฟสวน", "ไฟสนาม", "garden"],
  ["บ่อปลา", "บ่อน้ำ", "pond"],
  ["rgb", "เปลี่ยนสี", "หลายสี"],
  ["แสงขาว", "สีขาว", "white", "daylight", "เดย์ไลท์"],
  ["วอร์ม", "วอร์มไวท์", "warm", "warm white", "ww", "แสงส้ม"],
  ["หม้อแปลง", "อะแดปเตอร์", "adapter", "power supply", "พาวเวอร์ซัพพลาย", "transformer", "switching"],
  ["ไฟเส้น", "strip", "led strip", "ไฟริบบิ้น"],
  ["รีโมท", "รีโมต", "remote", "controller", "คอนโทรลเลอร์"],
  ["สปอร์ตไลท์", "spotlight", "floodlight", "flood light", "ฟลัดไลท์"],
  ["ดาวน์ไลท์", "downlight"],
  ["ฝังพื้น", "ไฟฝังพื้น", "uplight", "in ground"],
  ["ท่อหด", "heat shrink"],
  ["ไฟส่องตึก", "ไฟส่องอาคาร", "wall washer", "วอลวอชเชอร์"],
  ["กันน้ำ", "waterproof"],
];

/** ทำความสะอาดกลุ่มคำ: ตัดซ้ำ/ว่าง ยาวไม่เกิน 40 ตัวอักษร กลุ่มละ ≤ 12 คำ */
export function cleanWords(raw: string | string[]) {
  const list = (Array.isArray(raw) ? raw : raw.split(/[,\n،、]+/)).map((w) => w.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of list) {
    const k = normWord(w);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out.slice(0, 12);
}

/** กลุ่มคำพ้องทั้งหมด (แคช ล้างด้วย tag storefront เมื่อแก้ในหลังบ้าน) */
export async function getSynonymGroups(): Promise<string[][]> {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  try {
    const rows = await prisma.searchSynonym.findMany({ orderBy: { createdAt: "asc" }, select: { words: true } });
    return rows.map((r) => cleanWords(r.words)).filter((g) => g.length > 1);
  } catch {
    return DEFAULT_SYNONYMS;
  }
}

/** คำ (normalize แล้ว) → คำอื่นในกลุ่มเดียวกัน */
export function synonymIndex(groups: string[][]) {
  const idx = new Map<string, Set<string>>();
  for (const g of groups) {
    const words = g.map(normWord).filter(Boolean);
    for (const w of words) {
      const s = idx.get(w) ?? new Set<string>();
      for (const o of words) if (o !== w) s.add(o);
      idx.set(w, s);
    }
  }
  return idx;
}

/**
 * ระยะแก้ไขน้อยสุดของ pattern เมื่อเทียบกับ "ช่วงใดช่วงหนึ่ง" ในข้อความ (approximate substring, Sellers)
 * หยุดเร็วเมื่อเจอค่า 0 · คืน Infinity ถ้าเกิน maxK
 */
export function fuzzyDistance(text: string, pattern: string, maxK: number) {
  const m = pattern.length;
  if (!m) return 0;
  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  let best = prev[m];
  for (let j = 1; j <= text.length; j++) {
    cur[0] = 0;
    const c = text.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const sub = prev[i - 1] + (pattern.charCodeAt(i - 1) === c ? 0 : 1);
      cur[i] = Math.min(sub, prev[i] + 1, cur[i - 1] + 1);
    }
    if (cur[m] < best) best = cur[m];
    if (best === 0) return 0;
    [prev, cur] = [cur, prev];
  }
  return best <= maxK ? best : Infinity;
}

/** จำนวนตัวที่พิมพ์ผิดได้ตามความยาวคำ (คำสั้นต้องตรงเป๊ะ ไม่งั้นเจอมั่ว) */
export const typoBudget = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

export type SmartResult = { items: CatalogItem[]; approx: boolean };

/**
 * ค้นหาสินค้า: ทุกคำต้องเจอ (ชื่อ รหัส หมวด สเปก คำค้น หรือคำพ้อง) → ไม่เจอ: ลองรวมคำ ("under water" = underwater)
 * → ไม่เจอ: แบบใกล้เคียง (พิมพ์ผิด 1–2 ตัว หรือส่วนต้นของคำ ≥ 60%)
 */
export function smartSearch(catalog: CatalogItem[], categories: ShopCategory[], q: string, groups: string[][]): SmartResult {
  const toks = q.trim().split(/\s+/).map(normWord).filter(Boolean).slice(0, 8);
  if (!toks.length) return { items: [], approx: false };
  const syn = synonymIndex(groups);
  const catName = new Map(categories.map((c) => [c.slug, `${c.th} ${c.en}`]));
  const rows = catalog.map((p) => ({
    p,
    name: normWord(p.name),
    sku: normWord(p.sku ?? ""),
    hay: normWord([p.name, p.sku ?? "", p.cat, catName.get(p.catId) ?? "", p.specs.join(" "), p.kw ?? ""].join(" ")),
  }));
  const alts = (t: string) => [t, ...(syn.get(t) ?? [])];
  const hit = (hay: string, t: string) => alts(t).some((a) => hay.includes(a));

  const strict = (tokens: string[]) =>
    rows
      .map((r) => {
        let score = 0;
        for (const t of tokens) {
          if (!hit(r.hay, t)) return null;
          score += r.sku === t ? 6 : r.sku.startsWith(t) ? 4 : r.name.startsWith(t) ? 3 : r.name.includes(t) ? 2 : 1;
        }
        return { p: r.p, score: score + (r.p.best ? 0.5 : 0) };
      })
      .filter((x): x is { p: CatalogItem; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);

  let items = strict(toks);
  if (items.length) return { items, approx: false };
  if (toks.length > 1) {
    items = strict([toks.join("")]);
    if (items.length) return { items, approx: false };
  }

  // ผลใกล้เคียง: ทุกคำต้อง "ใกล้" (พิมพ์ผิดไม่เกินงบ หรือส่วนต้นของคำยาวพอ) — คะแนนดีขึ้นเมื่อผิดน้อย
  const near = (r: (typeof rows)[number], t: string) => {
    let best = 0;
    for (const a of alts(t)) {
      if (r.hay.includes(a)) return 1;
      const k = typoBudget(a.length);
      if (k) {
        const d = fuzzyDistance(r.hay, a, k);
        if (d !== Infinity) best = Math.max(best, 1 - d / (a.length + 1));
      }
      // ส่วนต้นของคำ (เช่น "ไฟสระน้ำ" → "ไฟสระ") — คำค้นยาวกว่าชื่อสินค้า
      const min = Math.max(2, Math.ceil(a.length * 0.6));
      for (let n = a.length - 1; n >= min; n--) {
        if (r.hay.includes(a.slice(0, n))) {
          best = Math.max(best, n / a.length);
          break;
        }
      }
    }
    return best;
  };
  const loose = rows
    .map((r) => {
      let score = 0;
      let all = true;
      for (const t of toks) {
        const s = near(r, t);
        if (!s) all = false;
        score += s;
      }
      // หลายคำ: ยอมให้ขาดได้บ้างถ้าคะแนนรวมสูงพอ
      return { p: r.p, score: all ? score + 0.5 : score };
    })
    .filter((x) => x.score >= Math.max(0.6, toks.length * 0.5))
    .sort((a, b) => b.score - a.score);
  return { items: loose.slice(0, 48).map((x) => x.p), approx: loose.length > 0 };
}

// ---------- บันทึกคำค้น ----------

/** คำค้นที่เก็บได้: ตัวพิมพ์เล็ก ช่องว่างเดียว ≤ 100 ตัว · คำที่ดูเหมือนเบอร์โทร/อีเมล/เลขคำสั่งซื้อ = ไม่เก็บ (null) */
export function normalizeQuery(q: string) {
  const s = q.normalize("NFC").toLowerCase().replace(/[\u0000-\u001f​-‍﻿]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!s) return null;
  if (/@/.test(s) || (s.match(/\d/g)?.length ?? 0) >= 8 || /mdw-\d/.test(s)) return null;
  return s;
}

export async function logSearch(q: string, results: number) {
  const query = normalizeQuery(q);
  if (!query) return;
  try {
    await prisma.searchLog.create({ data: { query, results } });
  } catch {}
}
