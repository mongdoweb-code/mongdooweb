// หน้าจัดเรียงสินค้าหน้าร้าน (/admin/products/order) — ฟังก์ชันล้วน ใช้ได้ทั้งเบราว์เซอร์และ server (ไม่มี import)
// กติกา: สินค้าปักหมุดอยู่บนสุดเสมอ (ตามลำดับหน้าร้าน PRODUCT_ORDER = ปักหมุดก่อน แล้วตาม sortOrder)

export type BoardBase = { id: string; pinned: boolean };
export type BoardSortFields = { name: string; sku: string; price: number; sold: number; created: number; catOrder: number; out: boolean };

/** ปักหมุดขึ้นก่อน (คงลำดับเดิมในแต่ละกลุ่ม) */
export function pinnedFirst<T extends BoardBase>(xs: T[]): T[] {
  return [...xs.filter((x) => x.pinned), ...xs.filter((x) => !x.pinned)];
}

/**
 * ย้ายสินค้าชุดหนึ่ง (ตามลำดับที่เห็น) ไปวางที่ตำแหน่ง index ของรายการที่เหลือ (0 = บนสุด)
 * ชิ้นที่ไม่ได้ปักหมุดจะไม่ขึ้นเหนือชิ้นที่ปักหมุด (ปรับตำแหน่งให้อัตโนมัติ)
 */
export function moveIds<T extends BoardBase>(xs: T[], ids: string[], index: number): T[] {
  const set = new Set(ids);
  const moving = xs.filter((x) => set.has(x.id));
  if (!moving.length) return xs;
  const rest = xs.filter((x) => !set.has(x.id));
  const at = Math.max(0, Math.min(rest.length, Math.floor(index)));
  return pinnedFirst([...rest.slice(0, at), ...moving, ...rest.slice(at)]);
}

/** ตำแหน่งที่จะวางเมื่อปล่อยบนสินค้า targetId (ก่อน/หลัง) — คิดในรายการที่ไม่มีชิ้นที่ย้าย */
export function dropIndex<T extends BoardBase>(xs: T[], ids: string[], targetId: string, after: boolean): number {
  const set = new Set(ids);
  const rest = xs.filter((x) => !set.has(x.id));
  const i = rest.findIndex((x) => x.id === targetId);
  return i < 0 ? rest.length : i + (after ? 1 : 0);
}

/** ย้ายไปบนสุด/ล่างสุดของกลุ่มตัวเอง (ปักหมุด / ไม่ปักหมุด) */
export function moveEdge<T extends BoardBase>(xs: T[], ids: string[], edge: "top" | "bottom"): T[] {
  if (edge === "bottom") return moveIds(xs, ids, xs.length);
  const set = new Set(ids);
  const pinnedMoving = xs.some((x) => set.has(x.id) && x.pinned);
  return moveIds(xs, ids, pinnedMoving ? 0 : xs.filter((x) => x.pinned && !set.has(x.id)).length);
}

export function setPinned<T extends BoardBase>(xs: T[], ids: string[], pinned: boolean): T[] {
  const set = new Set(ids);
  // ปักหมุดใหม่ = ต่อท้ายกลุ่มปักหมุด · เลิกปักหมุด = ขึ้นต้นกลุ่มไม่ปักหมุด (ตำแหน่งที่ใกล้เดิมที่สุด)
  const changed = xs.filter((x) => set.has(x.id) && x.pinned !== pinned).map((x) => ({ ...x, pinned }));
  if (!changed.length) return xs;
  const ch = new Set(changed.map((x) => x.id));
  const rest = xs.filter((x) => !ch.has(x.id));
  const pins = rest.filter((x) => x.pinned), others = rest.filter((x) => !x.pinned);
  return [...pins, ...changed, ...others];
}

export const AUTO_SORTS = {
  best: "ขายดีก่อน",
  new: "สินค้าใหม่ก่อน",
  "price-asc": "ราคาต่ำ → สูง",
  "price-desc": "ราคาสูง → ต่ำ",
  cat: "ตามลำดับหมวด",
  name: "ชื่อ ก → ฮ",
  stock: "มีของก่อน หมดไว้ท้าย",
} as const;
export type AutoSortKey = keyof typeof AUTO_SORTS;

const th = new Intl.Collator("th", { numeric: true });
/** เรียงอัตโนมัติทั้งร้าน (ชิ้นปักหมุดอยู่บนสุดเหมือนเดิม) — เสมอกัน = คงลำดับเดิม */
export function autoSort<T extends BoardBase & BoardSortFields>(xs: T[], key: AutoSortKey): T[] {
  const cmp: Record<AutoSortKey, (a: T, b: T) => number> = {
    best: (a, b) => b.sold - a.sold,
    new: (a, b) => b.created - a.created,
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    cat: (a, b) => a.catOrder - b.catOrder,
    name: (a, b) => th.compare(a.name, b.name),
    stock: (a, b) => Number(a.out) - Number(b.out),
  };
  const f = cmp[key];
  if (!f) return xs;
  const idx = new Map(xs.map((x, i) => [x.id, i]));
  const sort = (g: T[]) => [...g].sort((a, b) => f(a, b) || idx.get(a.id)! - idx.get(b.id)!);
  return [...sort(xs.filter((x) => x.pinned)), ...sort(xs.filter((x) => !x.pinned))];
}

/**
 * ชิ้นที่ "ถูกย้าย" เมื่อเทียบกับลำดับเดิม = ชิ้นที่ไม่อยู่ในลำดับย่อยที่ยาวที่สุดที่ยังเรียงเหมือนเดิม (LIS) + ชิ้นที่เปลี่ยนปักหมุด
 * (ย้าย 1 ชิ้นไปบนสุด = 1 ชิ้น ไม่ใช่ทุกชิ้นที่ถูกเลื่อนตาม)
 */
export function movedIds(orig: BoardBase[], cur: BoardBase[]): Set<string> {
  const pos = new Map(orig.map((x, i) => [x.id, i]));
  const pin = new Map(orig.map((x) => [x.id, x.pinned]));
  const seq = cur.map((x) => pos.get(x.id) ?? -1);
  // LIS แบบ O(n log n) พร้อมย้อนรอย
  const tails: number[] = [], prev = new Array<number>(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] < 0) continue;
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (seq[tails[m]] < seq[i]) lo = m + 1;
      else hi = m;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set<number>();
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) keep.add(k);
  const out = new Set<string>();
  cur.forEach((x, i) => {
    if (!keep.has(i) || pin.get(x.id) !== x.pinned) out.add(x.id);
  });
  return out;
}

/** ข้อมูลที่ส่งไปบันทึก: ลำดับ id ทั้งหมด + id ที่ปักหมุด */
export const boardPayload = (xs: BoardBase[]) => ({ ids: xs.map((x) => x.id), pinned: xs.filter((x) => x.pinned).map((x) => x.id) });

export const BOARD_PER = [12, 24, 36] as const;
export const BOARD_PER_DEFAULT = 24;
export const BOARD_VIEWS = { table: "ตาราง", card: "การ์ด", small: "การ์ดเล็ก" } as const;
export type BoardView = keyof typeof BOARD_VIEWS;
