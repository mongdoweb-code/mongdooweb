// ข้อมูลประกอบรายการสินค้า (ไม่ส่งไปเบราว์เซอร์ทั้งก้อน): นิยามสเปก, ค่าสเปกต่อสินค้า, กลุ่มตัวเลือก
// แคชด้วย tag storefront เหมือนข้อมูลหน้าร้านอื่น — หลังบ้านเรียก refreshStorefront() หลังแก้
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";
import { parseAttrs, type Attrs, type SpecDef } from "@/lib/specs";
import { optionLabel, readOptions } from "@/lib/variants";

/** นิยามสเปกทั้งหมด (ทุกหมวด + สเปกกลาง) */
export async function getSpecDefs(): Promise<SpecDef[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const rows = await prisma.specAttribute.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    code: r.code,
    label: r.label,
    unit: r.unit,
    type: r.type,
    options: r.options,
    filterable: r.filterable,
    sortOrder: r.sortOrder,
  }));
}

export type ProductExtra = {
  categoryId: string;
  attrs: Attrs;
  /** กลุ่มตัวเลือก (null = ไม่อยู่ในกลุ่ม หรือกลุ่มเหลือตัวที่เปิดขายตัวเดียว) */
  group: string | null;
  /** ตัวหลักของกลุ่ม (canonical) */
  primary: boolean;
  /** ค่าตัวเลือก เช่น "แสงขาว · 10W" */
  option: string;
  specs: { label: string; value: string }[];
};

/** ค่าสเปก/กลุ่มตัวเลือกของสินค้าที่เปิดขาย ต่อ slug + จำนวนตัวเลือกต่อกลุ่ม */
export async function getCatalogExtras(): Promise<{ bySlug: Record<string, ProductExtra>; groupSize: Record<string, number>; categoryIds: Record<string, string> }> {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, isService: false, category: { isActive: true } },
      select: {
        id: true, slug: true, categoryId: true, attrs: true, specs: true, variantGroupId: true, variantOptions: true,
        variantGroup: { select: { primaryId: true, optionNames: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.category.findMany({ select: { id: true, slug: true } }),
  ]);
  const groupSize: Record<string, number> = {};
  for (const p of products) if (p.variantGroupId) groupSize[p.variantGroupId] = (groupSize[p.variantGroupId] ?? 0) + 1;
  // ตัวหลักของกลุ่ม = primaryId ถ้ายังเปิดขาย ไม่งั้นตัวแรก
  const firstOf: Record<string, string> = {};
  for (const p of products) if (p.variantGroupId && !firstOf[p.variantGroupId]) firstOf[p.variantGroupId] = p.id;
  const bySlug: Record<string, ProductExtra> = {};
  for (const p of products) {
    const g = p.variantGroupId && groupSize[p.variantGroupId] >= 2 ? p.variantGroupId : null;
    const primaryId = g ? (products.some((x) => x.id === p.variantGroup?.primaryId && x.variantGroupId === g) ? p.variantGroup!.primaryId! : firstOf[g]) : null;
    const names = p.variantGroup?.optionNames ?? [];
    bySlug[p.slug] = {
      categoryId: p.categoryId,
      attrs: parseAttrs(p.attrs),
      group: g,
      primary: !g || primaryId === p.id,
      option: g ? optionLabel(names, readOptions(p.variantOptions, names)) : "",
      specs: Array.isArray(p.specs)
        ? (p.specs as { label?: unknown; value?: unknown }[]).map((s) => ({ label: String(s?.label ?? ""), value: String(s?.value ?? "") })).filter((s) => s.value)
        : [],
    };
  }
  return { bySlug, groupSize, categoryIds: Object.fromEntries(categories.map((c) => [c.slug, c.id])) };
}
