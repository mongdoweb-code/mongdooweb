// เรียงตารางหมวดหมู่ (ใช้ทั้งหน้าแสดงผลและตอนบันทึกเป็นลำดับหน้าร้าน — กติกาเดียวกัน)
export const CAT_SORT_KEYS = ["order", "name", "group", "count"] as const;
export type CatSortKey = (typeof CAT_SORT_KEYS)[number];
export const CAT_SORT_LABEL: Record<CatSortKey, string> = { order: "ลำดับหน้าร้าน", name: "ชื่อหมวด", group: "กลุ่ม", count: "จำนวนสินค้า" };
export const isCatSortKey = (k: string): k is CatSortKey => (CAT_SORT_KEYS as readonly string[]).includes(k);

/** ลำดับกลุ่มตามเมนูหน้าร้าน */
const GROUP_RANK: Record<string, number> = { WATER: 0, OUTDOOR: 1, BUILDING: 2, DECO: 3 };

type Sortable = { sortOrder: number; nameTh: string; group: string; _count: { products: number } };

export function sortCategories<T extends Sortable>(list: T[], key: CatSortKey, desc: boolean): T[] {
  const sign = desc ? -1 : 1;
  const cmp: Record<CatSortKey, (a: T, b: T) => number> = {
    order: (a, b) => a.sortOrder - b.sortOrder,
    name: (a, b) => a.nameTh.localeCompare(b.nameTh, "th"),
    group: (a, b) => (GROUP_RANK[a.group] ?? 9) - (GROUP_RANK[b.group] ?? 9),
    count: (a, b) => a._count.products - b._count.products,
  };
  // ค่าเท่ากัน → คงลำดับหน้าร้านเดิม (เรียงแบบคงที่)
  return [...list].sort((a, b) => sign * cmp[key](a, b) || a.sortOrder - b.sortOrder);
}
