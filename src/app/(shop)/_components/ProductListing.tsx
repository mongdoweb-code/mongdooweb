// รายการสินค้า + ตัวกรอง (สีแสง, พื้นที่ใช้งาน, เรียงราคา) — ตัวกรองอยู่ใน URL จึงแชร์ลิงก์ได้
import { COLOR_FILTERS, SORTS, USE_FILTERS, filterCatalog, getShopData } from "@/lib/storefront";
import { ProductGrid } from "./ProductCard";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function ProductListing({
  basePath,
  category,
  searchParams,
}: {
  basePath: string;
  category?: string;
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const current = { color: one(sp.color), use: one(sp.use), sort: one(sp.sort) };
  const { catalog } = await getShopData();
  const items = filterCatalog(catalog, { category, ...current });

  // ลิงก์ของชิปแต่ละตัว: กดซ้ำตัวที่เลือกอยู่ = ยกเลิกตัวกรองนั้น
  const href = (key: keyof typeof current, value: string) => {
    const next = { ...current, [key]: current[key] === value ? "" : value };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v)).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const group = (key: keyof typeof current, legend: string, opts: Record<string, string>) => (
    <fieldset>
      <legend>{legend}</legend>
      {Object.entries(opts).map(([v, label]) => (
        <a key={v} className="chip" href={href(key, v)} aria-current={current[key] === v ? "true" : undefined}>
          {label}
        </a>
      ))}
    </fieldset>
  );

  return (
    <>
      <div className="filters" role="group" aria-label="กรองสินค้า">
        {group("color", "สีแสง", COLOR_FILTERS)}
        {group("use", "พื้นที่ใช้งาน", USE_FILTERS)}
        {group("sort", "เรียงตาม", SORTS)}
        <span className="count" role="status">
          {items.length} รายการ
        </span>
      </div>
      <ProductGrid
        items={items}
        empty={
          Object.values(current).some(Boolean) ? (
            <>
              <b>ไม่พบสินค้าตามตัวกรองนี้</b>
              ลอง <a href={basePath} className="link-more">ล้างตัวกรอง</a> หรือ{" "}
              <a href="/#finder" className="link-more">ให้เราช่วยเลือกรุ่น</a>
            </>
          ) : (
            <>
              <b>ยังไม่มีสินค้าในหมวดนี้บนหน้าเว็บ</b>
              สอบถามรุ่นและราคาได้ทาง <a href="#" data-line target="_blank" rel="noopener" className="link-more">LINE</a>
            </>
          )
        }
      />
    </>
  );
}

export function ListingFallback() {
  return <div className="pg-empty">กำลังโหลดสินค้า…</div>;
}
