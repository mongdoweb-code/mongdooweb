// รายการสินค้า + เรียงลำดับ + ตัวกรอง (การใช้งาน, สีแสง, ช่วงราคา, มีของ)
// ทุกตัวกรองอยู่ใน URL (ลิงก์ธรรมดา) → แชร์ลิงก์ได้ และกดย้อนกลับของเบราว์เซอร์ได้ทีละขั้น
import {
  COLOR_FILTERS,
  PRICE_FILTERS,
  SORTS,
  STOCK_FILTERS,
  USE_FILTERS,
  filterCatalog,
  getListingMeta,
  getShopData,
  type CatalogItem,
} from "@/lib/storefront";
import { ProductGrid } from "./ProductCard";
import { FilterPanel, SortSelect } from "./ListingControls";

type Params = Record<string, string | string[] | undefined>;
const PER_PAGE = 24;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const GROUPS = [
  { key: "use", legend: "การใช้งาน", opts: USE_FILTERS },
  { key: "color", legend: "สีแสง", opts: COLOR_FILTERS },
  { key: "price", legend: "ช่วงราคา", opts: PRICE_FILTERS },
  { key: "stock", legend: "สถานะสินค้า", opts: STOCK_FILTERS },
] as const;
type FilterKey = (typeof GROUPS)[number]["key"];
type State = Record<FilterKey | "sort", string>;

/** อ่านค่าจาก URL — ค่าที่ไม่รู้จักถูกตัดทิ้ง (กัน URL แปลกๆ ทำให้หน้าเพี้ยน) */
export function readListingParams(sp: Params): State {
  const pick = (k: string, allowed: Record<string, string>) => {
    const v = one(sp[k]);
    return v in allowed ? v : "";
  };
  const sort = one(sp.sort) === "popular" ? "" : pick("sort", SORTS); // "popular" = ค่าเดิมของรอบก่อน
  return {
    use: pick("use", USE_FILTERS),
    color: pick("color", COLOR_FILTERS),
    price: pick("price", PRICE_FILTERS),
    stock: pick("stock", STOCK_FILTERS),
    sort,
  };
}

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
  const current = readListingParams(sp);
  const [{ catalog }, meta] = await Promise.all([getShopData(), getListingMeta()]);
  const base: CatalogItem[] = category ? catalog.filter((p) => p.catId === category) : catalog;
  const all = filterCatalog(base, current, meta);

  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(one(sp.page))) || 1));
  const items = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const url = (next: Partial<State> & { page?: number }) => {
    const merged: Record<string, string> = { ...current, ...next, page: next.page && next.page > 1 ? String(next.page) : "" };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  // ชิปแต่ละตัว: กดซ้ำตัวที่เลือกอยู่ = ยกเลิกตัวกรองนั้น · เปลี่ยนตัวกรองแล้วกลับไปหน้า 1
  const toggle = (key: FilterKey, value: string) => url({ [key]: current[key] === value ? "" : value, page: 1 });

  const active = GROUPS.flatMap((g) =>
    current[g.key] ? [{ key: g.key, label: (g.opts as Record<string, string>)[current[g.key]] }] : [],
  );
  const clearAll = url({ use: "", color: "", price: "", stock: "", page: 1 });

  const groups = GROUPS.map((g) => {
    const opts = Object.entries(g.opts as Record<string, string>)
      .map(([v, label]) => ({
        v,
        label,
        // จำนวนผลถ้าเลือกตัวเลือกนี้ (คงตัวกรองกลุ่มอื่นไว้)
        n: filterCatalog(base, { ...current, [g.key]: v, sort: "" }).length,
        on: current[g.key] === v,
      }))
      .filter((o) => o.on || o.n > 0);
    return { ...g, opts };
  }).filter((g) => g.opts.length > 0);

  return (
    <>
      <div className="lst-bar">
        <p className="lst-count" role="status">
          พบ <b>{all.length.toLocaleString("th-TH")}</b> รายการ
          {pages > 1 && <span className="lst-page"> · หน้า {page}/{pages}</span>}
        </p>
        <SortSelect
          value={current.sort}
          options={Object.entries(SORTS).map(([v, label]) => ({ value: v, label, href: url({ sort: v, page: 1 }) }))}
        />
        <FilterPanel activeCount={active.length}>
        {groups.map((g) => (
          <fieldset key={g.key} className="lst-group">
            <legend>{g.legend}</legend>
            <div className="lst-chips">
              {g.opts.map((o) => (
                <a key={o.v} className="chip" href={toggle(g.key, o.v)} aria-current={o.on ? "true" : undefined} rel="nofollow">
                  {o.label}
                  <span className="chip-n">
                    <span className="sr-only">(</span>
                    {o.n}
                    <span className="sr-only"> รายการ)</span>
                  </span>
                </a>
              ))}
            </div>
          </fieldset>
        ))}
        </FilterPanel>
      </div>
      {active.length > 0 && (
        <div className="lst-active" aria-label="ตัวกรองที่เลือก">
          {active.map((a) => (
            <a key={a.key} className="chip chip-x" href={url({ [a.key]: "", page: 1 })} rel="nofollow" aria-label={`เอาตัวกรอง ${a.label} ออก`}>
              {a.label} <span aria-hidden="true">×</span>
            </a>
          ))}
          <a className="lst-clear" href={clearAll}>
            ล้างตัวกรองทั้งหมด
          </a>
        </div>
      )}
      <ProductGrid
        items={items}
        eager={4}
        empty={
          active.length ? (
            <>
              <b>ไม่พบสินค้าตามตัวกรองนี้</b>
              ลอง{" "}
              <a href={clearAll} className="link-more">
                ล้างตัวกรอง
              </a>{" "}
              หรือ{" "}
              <a href="/#finder" className="link-more">
                ให้เราช่วยเลือกรุ่น
              </a>
            </>
          ) : (
            <>
              <b>ยังไม่มีสินค้าในหมวดนี้บนหน้าเว็บ</b>
              สอบถามรุ่นและราคาได้ทาง{" "}
              <a href="#" data-line target="_blank" rel="noopener" className="link-more">
                LINE
              </a>
            </>
          )
        }
      />
      {pages > 1 && (
        <nav className="pager-shop" aria-label="แบ่งหน้า">
          {page > 1 && (
            <a href={url({ page: page - 1 })} rel="prev">
              ← ก่อนหน้า
            </a>
          )}
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <a key={n} href={url({ page: n })} aria-current={n === page ? "page" : undefined} aria-label={`หน้า ${n}`}>
              {n}
            </a>
          ))}
          {page < pages && (
            <a href={url({ page: page + 1 })} rel="next">
              ถัดไป →
            </a>
          )}
        </nav>
      )}
    </>
  );
}

export function ListingFallback() {
  // จองความสูงไว้ก่อนรายการสินค้ามาถึง (stream) — ท้ายเว็บจะได้ไม่กระโดด (CLS, U14)
  return <div className="pg-empty" style={{ minHeight: "150vh" }}>กำลังโหลดสินค้า…</div>;
}
