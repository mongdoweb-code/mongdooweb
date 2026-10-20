// รายการสินค้า + ตัวกรอง (สีแสง, พื้นที่ใช้งาน, เรียงราคา) — ตัวกรองอยู่ใน URL จึงแชร์ลิงก์ได้
import { COLOR_FILTERS, SORTS, USE_FILTERS, filterCatalog, getShopData } from "@/lib/storefront";
import { ProductGrid } from "./ProductCard";

type Params = Record<string, string | string[] | undefined>;
const PER_PAGE = 24;
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
  const all = filterCatalog(catalog, { category, ...current });
  // แบ่งหน้าละ 24 รายการ
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(one(sp.page))) || 1));
  const items = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const pageHref = (n: number) => {
    const qs = new URLSearchParams(Object.entries({ ...current, page: n > 1 ? String(n) : "" }).filter(([, v]) => v)).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

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
          {all.length} รายการ
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
      {pages > 1 && (
        <nav className="pager-shop" aria-label="แบ่งหน้า">
          {page > 1 && <a href={pageHref(page - 1)} rel="prev">← ก่อนหน้า</a>}
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <a key={n} href={pageHref(n)} aria-current={n === page ? "page" : undefined}>
              {n}
            </a>
          ))}
          {page < pages && <a href={pageHref(page + 1)} rel="next">ถัดไป →</a>}
        </nav>
      )}
    </>
  );
}

export function ListingFallback() {
  return <div className="pg-empty">กำลังโหลดสินค้า…</div>;
}
