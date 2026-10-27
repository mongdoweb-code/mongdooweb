// รายการสินค้า + เรียงลำดับ + ตัวกรอง (การใช้งาน, สีแสง, ช่วงราคา, มีของ) + ตัวกรองสเปกของหมวด (U6)
// ทุกตัวกรองอยู่ใน URL (ลิงก์ธรรมดา) → แชร์ลิงก์ได้ และกดย้อนกลับของเบราว์เซอร์ได้ทีละขั้น
// สินค้าหลายตัวเลือก (U1) แสดงการ์ดเดียวต่อกลุ่ม (ตัวหลัก หรือตัวแรกที่ตรงตัวกรอง) พร้อม "มี n ตัวเลือก"
import { getCatalogExtras, getSpecDefs, type ProductExtra } from "@/lib/product-data";
import {
  defsFor,
  formatAttr,
  matchSpecs,
  readSpecFilter,
  specFilterEntries,
  type SpecDef,
  type SpecFilter,
} from "@/lib/specs";
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

/** รวมสินค้าหลายตัวเลือกเป็นการ์ดเดียว: ตัวหลักของกลุ่มถ้าผ่านตัวกรอง ไม่งั้นตัวแรกที่ผ่าน (คงลำดับเดิม) */
function collapseVariants(list: CatalogItem[], extra: Record<string, ProductExtra>, groupSize: Record<string, number>) {
  const pick = new Map<string, CatalogItem>();
  for (const p of list) {
    const e = extra[p.id];
    if (!e?.group) continue;
    const cur = pick.get(e.group);
    if (!cur || (e.primary && !extra[cur.id]?.primary)) pick.set(e.group, p);
  }
  const options: Record<string, number> = {};
  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  for (const p of list) {
    const g = extra[p.id]?.group;
    if (!g) {
      items.push(p);
      continue;
    }
    if (seen.has(g)) continue;
    seen.add(g);
    const rep = pick.get(g)!;
    items.push(rep);
    options[rep.id] = groupSize[g] ?? 1;
  }
  return { items, options };
}

/** ตัวเลือกของสเปกแต่ละตัวพร้อมจำนวน (นับแบบคงตัวกรองอื่นไว้) */
type SpecGroup =
  | { def: SpecDef; kind: "enum"; opts: { v: string; n: number; on: boolean }[] }
  | { def: SpecDef; kind: "range"; min: number; max: number; cur: { min: number | null; max: number | null } };

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
  const [{ catalog }, meta, extras, allDefs] = await Promise.all([getShopData(), getListingMeta(), getCatalogExtras(), getSpecDefs()]);
  const base: CatalogItem[] = category ? catalog.filter((p) => p.catId === category) : catalog;
  // ตัวกรองสเปก: หน้าหมวด = สเปกของหมวด + สเปกกลาง · สินค้าทั้งหมด = สเปกกลางเท่านั้น
  const defs = defsFor(allDefs, category ? extras.categoryIds[category] ?? "-" : null).filter((d) => d.filterable);
  const sf = readSpecFilter(sp, defs);
  const attrsOf = (p: CatalogItem) => extras.bySlug[p.id]?.attrs ?? {};
  const bySpecs = (list: CatalogItem[], skip?: string) => list.filter((p) => matchSpecs(attrsOf(p), sf, skip));
  const count = (list: CatalogItem[]) => collapseVariants(list, extras.bySlug, extras.groupSize).items.length;
  const { items: all, options } = collapseVariants(bySpecs(filterCatalog(base, current, meta)), extras.bySlug, extras.groupSize);

  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(one(sp.page))) || 1));
  const items = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const url = (next: Partial<State> & { page?: number; spec?: SpecFilter }) => {
    const { spec, ...rest } = next;
    const merged: Record<string, string> = { ...current, ...rest, page: rest.page && rest.page > 1 ? String(rest.page) : "" };
    const q = new URLSearchParams(Object.entries(merged).filter(([, v]) => v));
    for (const [k, v] of specFilterEntries(spec ?? sf)) q.append(k, v);
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  // ตัวกรองสเปกแบบเลือกหลายค่า: กดค่าเดิมซ้ำ = เอาออก
  const toggleSpec = (code: string, v: string) => {
    const vals = sf.enums[code] ?? [];
    const nextVals = vals.includes(v) ? vals.filter((x) => x !== v) : [...vals, v];
    const enums = { ...sf.enums, [code]: nextVals };
    if (!nextVals.length) delete enums[code];
    return url({ spec: { ...sf, enums }, page: 1 });
  };
  const withoutRange = (code: string) => {
    const ranges = { ...sf.ranges };
    delete ranges[code];
    return { ...sf, ranges };
  };
  // ชิปแต่ละตัว: กดซ้ำตัวที่เลือกอยู่ = ยกเลิกตัวกรองนั้น · เปลี่ยนตัวกรองแล้วกลับไปหน้า 1
  const toggle = (key: FilterKey, value: string) => url({ [key]: current[key] === value ? "" : value, page: 1 });

  const unitOf = (d: SpecDef) => (d.unit ? ` ${d.unit}` : "");
  const active = [
    ...GROUPS.flatMap((g) =>
      current[g.key] ? [{ key: g.key, label: (g.opts as Record<string, string>)[current[g.key]], href: url({ [g.key]: "", page: 1 }) }] : [],
    ),
    ...defs.flatMap((d) => {
      const vals = sf.enums[d.code] ?? [];
      const r = sf.ranges[d.code];
      return [
        ...vals.map((v) => ({ key: `${d.code}:${v}`, label: `${d.label}: ${v}`, href: toggleSpec(d.code, v) })),
        ...(r
          ? [
              {
                key: `${d.code}:range`,
                label: `${d.label}: ${r.min ?? "…"}–${r.max ?? "…"}${unitOf(d)}`,
                href: url({ spec: withoutRange(d.code), page: 1 }),
              },
            ]
          : []),
      ];
    }),
  ];
  const clearAll = url({ use: "", color: "", price: "", stock: "", page: 1, spec: { enums: {}, ranges: {} } });

  // ตัวกรองสเปก: นับจำนวนโดยใช้ตัวกรองอื่นทั้งหมด ยกเว้นสเปกนั้นเอง
  const baseFiltered = filterCatalog(base, { ...current, sort: "" });
  const specGroups: SpecGroup[] = defs.flatMap((d): SpecGroup[] => {
    const pool = bySpecs(baseFiltered, d.code);
    if (d.type === "NUMBER") {
      const nums = base.map((p) => attrsOf(p)[d.code]).filter((v): v is number => typeof v === "number");
      if (!nums.length) return [];
      return [{ def: d, kind: "range", min: Math.min(...nums), max: Math.max(...nums), cur: sf.ranges[d.code] ?? { min: null, max: null } }];
    }
    const present = new Set(base.map((p) => attrsOf(p)[d.code]).filter((v) => v != null).map(String));
    const values = [...(d.type === "ENUM" ? d.options.filter((o) => present.has(o)) : []), ...[...present].filter((v) => !d.options.includes(v)).sort()];
    const on = sf.enums[d.code] ?? [];
    const opts = values
      .map((v) => ({ v, on: on.includes(v), n: count(pool.filter((p) => String(attrsOf(p)[d.code] ?? "") === v)) }))
      .filter((o) => o.on || o.n > 0);
    return opts.length ? [{ def: d, kind: "enum", opts }] : [];
  });

  const groups = GROUPS.map((g) => {
    const opts = Object.entries(g.opts as Record<string, string>)
      .map(([v, label]) => ({
        v,
        label,
        // จำนวนผลถ้าเลือกตัวเลือกนี้ (คงตัวกรองกลุ่มอื่นไว้)
        n: count(bySpecs(filterCatalog(base, { ...current, [g.key]: v, sort: "" }))),
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
        {specGroups.map((g) =>
          g.kind === "enum" ? (
            <fieldset key={g.def.code} className="lst-group" data-spec={g.def.code}>
              <legend>{g.def.label}</legend>
              <div className="lst-chips">
                {g.opts.map((o) => (
                  <a key={o.v} className="chip" href={toggleSpec(g.def.code, o.v)} aria-current={o.on ? "true" : undefined} rel="nofollow">
                    {o.v}
                    <span className="chip-n">
                      <span className="sr-only">(</span>
                      {o.n}
                      <span className="sr-only"> รายการ)</span>
                    </span>
                  </a>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset key={g.def.code} className="lst-group" data-spec={g.def.code}>
              <legend>
                {g.def.label}
                {g.def.unit ? ` (${g.def.unit})` : ""}
              </legend>
              <form className="lst-range" action={basePath} method="get">
                {[...Object.entries(current).filter(([, v]) => v), ...specFilterEntries(withoutRange(g.def.code))].map(([k, v], i) => (
                  <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
                ))}
                <label>
                  <span className="sr-only">{g.def.label} ต่ำสุด</span>
                  <input
                    name={`f_${g.def.code}_min`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    defaultValue={g.cur.min ?? ""}
                    placeholder={`ต่ำสุด ${formatAttr({ type: "NUMBER", unit: null }, g.min)}`}
                  />
                </label>
                <span aria-hidden="true">–</span>
                <label>
                  <span className="sr-only">{g.def.label} สูงสุด</span>
                  <input
                    name={`f_${g.def.code}_max`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    defaultValue={g.cur.max ?? ""}
                    placeholder={`สูงสุด ${formatAttr({ type: "NUMBER", unit: null }, g.max)}`}
                  />
                </label>
                <button type="submit" className="chip">
                  กรอง
                </button>
              </form>
            </fieldset>
          ),
        )}
        </FilterPanel>
      </div>
      {active.length > 0 && (
        <div className="lst-active" aria-label="ตัวกรองที่เลือก">
          {active.map((a) => (
            <a key={a.key} className="chip chip-x" href={a.href} rel="nofollow" aria-label={`เอาตัวกรอง ${a.label} ออก`}>
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
        options={options}
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
