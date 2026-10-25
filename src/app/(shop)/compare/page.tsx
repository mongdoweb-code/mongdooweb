// /compare?ids=a,b,c — เปรียบเทียบสินค้าสูงสุด 4 ชิ้น (U5): ราคา หมวด สถานะ ตัวเลือก สเปกแบบมีโครงสร้าง + สเปกอิสระ
// ลิงก์นี้แชร์ได้ (รายการอยู่ใน URL) · ไม่มี ids → ใช้รายการที่เลือกไว้ในเครื่อง
import type { Metadata } from "next";
import { Suspense } from "react";
import { getCatalogExtras, getSpecDefs } from "@/lib/product-data";
import { defsFor, formatAttr } from "@/lib/specs";
import { getShopData, type CatalogItem } from "@/lib/storefront";
import { PageHead } from "../_components/PageHead";
import { CardPrice } from "../_components/PriceBits";
import { phClass } from "../_components/ProductCard";
import { ShareTools } from "../_components/ShareTools";
import { CompareRedirect, CompareSync, DiffToggle } from "./CompareClient";

export const metadata: Metadata = {
  title: "เปรียบเทียบสินค้า — มองดูเว็บ",
  description: "เปรียบเทียบราคาและสเปกไฟ LED สูงสุด 4 รุ่นแบบตารางเดียว แชร์ลิงก์ให้ทีมงานหรือลูกค้าได้",
  alternates: { canonical: "/compare" },
  robots: { index: false, follow: true },
};

const MAX = 4;
type Params = Record<string, string | string[] | undefined>;

function parseIds(v: string | string[] | undefined) {
  const raw = (Array.isArray(v) ? v.join(",") : (v ?? "")).split(",");
  const out: string[] = [];
  for (const s of raw) {
    const id = s.trim().slice(0, 200);
    if (id && !out.includes(id)) out.push(id);
  }
  return out.slice(0, MAX);
}

type Row = { key: string; label: string; cells: (string | null)[] };

async function CompareTable({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ids = parseIds(sp.ids);
  if (!ids.length) return <CompareRedirect cleared={sp.ids !== undefined} />;
  const [{ catalog }, extras, allDefs] = await Promise.all([getShopData(), getCatalogExtras(), getSpecDefs()]);
  const items = ids.map((id) => catalog.find((p) => p.id === id)).filter((p): p is CatalogItem => !!p);
  if (!items.length) return <CompareRedirect />;
  const ex = (p: CatalogItem) => extras.bySlug[p.id];

  // สเปกแบบมีโครงสร้าง: รวมรหัสของทุกหมวดที่อยู่ในตาราง (เรียงตามนิยาม)
  const defs = new Map<string, ReturnType<typeof defsFor>[number]>();
  for (const p of items) for (const d of defsFor(allDefs, ex(p)?.categoryId)) if (!defs.has(d.code)) defs.set(d.code, d);
  const rows: Row[] = [];
  for (const d of defs.values()) {
    const cells = items.map((p) => {
      const v = ex(p)?.attrs[d.code];
      return v == null ? null : formatAttr(d, v);
    });
    if (cells.some((c) => c != null)) rows.push({ key: `a:${d.code}`, label: d.label, cells });
  }
  // สเปกอิสระ (หัวข้อที่ไม่ซ้ำกับสเปกแบบมีโครงสร้าง)
  const taken = new Set(rows.map((r) => r.label));
  const labels: string[] = [];
  for (const p of items) for (const s of ex(p)?.specs ?? []) if (s.label && !taken.has(s.label) && !labels.includes(s.label)) labels.push(s.label);
  for (const l of labels.slice(0, 30)) rows.push({ key: `s:${l}`, label: l, cells: items.map((p) => ex(p)?.specs.find((s) => s.label === l)?.value ?? null) });

  const base: Row[] = [
    { key: "cat", label: "หมวด", cells: items.map((p) => p.cat) },
    { key: "sku", label: "รหัสสินค้า", cells: items.map((p) => p.sku ?? null) },
    ...(items.some((p) => ex(p)?.option) ? [{ key: "opt", label: "ตัวเลือก", cells: items.map((p) => ex(p)?.option || null) }] : []),
    { key: "stock", label: "สถานะ", cells: items.map((p) => (p.price <= 0 ? "สอบถามราคา" : p.inStock ? "มีสินค้าพร้อมส่ง" : "สินค้าหมดชั่วคราว")) },
    { key: "kit", label: "หม้อแปลงในชุด", cells: items.map((p) => (p.acc ? null : p.kit ? "มีในกล่อง" : "ซื้อแยก")) },
  ];
  const all = [...base, ...rows];
  const same = (r: Row) => r.cells.every((c) => (c ?? "") === (r.cells[0] ?? ""));
  const path = `/compare?ids=${items.map((p) => encodeURIComponent(p.id)).join(",")}`;
  const others = (id: string) => items.filter((p) => p.id !== id).map((p) => encodeURIComponent(p.id));

  return (
    <>
      <CompareSync ids={items.map((p) => p.id)} />
      <div className="cmp-tools">
        <span>
          เปรียบเทียบ <b>{items.length}</b> ชิ้น (สูงสุด {MAX})
        </span>
        {items.length > 1 && <DiffToggle target="cmpTable" />}
        <ShareTools path={path} text={`เปรียบเทียบสินค้า ${items.length} รุ่น จากร้านมองดูเว็บ`} />
      </div>
      <div className="cmp-wrap" tabIndex={0} role="region" aria-label="ตารางเปรียบเทียบ (เลื่อนซ้าย-ขวาได้)">
        <table className="cmp-table" id="cmpTable">
          <caption className="sr-only">เปรียบเทียบสินค้า {items.length} รายการ</caption>
          <thead>
            <tr>
              <td />
              {items.map((p) => (
                <th key={p.id} scope="col">
                  <div className="cmp-prod">
                    {p.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.img} alt="" width={120} height={120} loading="lazy" decoding="async" />
                    ) : (
                      <span className={phClass(p)} />
                    )}
                    <a className="nm" href={`/product/${encodeURIComponent(p.id)}`}>
                      {p.name}
                    </a>
                    <a className="rm" href={others(p.id).length ? `/compare?ids=${others(p.id).join(",")}` : "/compare?ids="} data-cmp-remove={p.id} aria-label={`เอา ${p.name} ออกจากการเปรียบเทียบ`}>
                      เอาออก
                    </a>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">ราคา</th>
              {items.map((p) => (
                <td key={p.id} className="cmp-price-cell">
                  <CardPrice p={{ price: p.price, compareAt: p.compareAt ?? null, sale: p.sale ?? null }} />
                </td>
              ))}
            </tr>
            {all.map((r) => (
              <tr key={r.key} className={items.length > 1 ? (same(r) ? "same" : "diff") : undefined} data-row={r.key}>
                <th scope="row">{r.label}</th>
                {r.cells.map((c, i) => (
                  <td key={items[i].id}>{c ?? <span className="cmp-none">–</span>}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">
                <span className="sr-only">สั่งซื้อ</span>
              </th>
              {items.map((p) => (
                <td key={p.id}>
                  {p.price > 0 && p.inStock ? (
                    <button className="add-btn" type="button" data-add={p.id} aria-label={`ใส่ตะกร้า: ${p.name}`}>
                      ใส่ตะกร้า
                    </button>
                  ) : (
                    <a className="add-btn" href={`/product/${encodeURIComponent(p.id)}`} aria-label={`ดูรายละเอียด: ${p.name}`}>
                      ดูรายละเอียด
                    </a>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {items.length < MAX && (
        <p style={{ marginTop: 16 }}>
          <a className="link-more" href="/products">
            เพิ่มสินค้าเพื่อเปรียบเทียบ
          </a>
        </p>
      )}
    </>
  );
}

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <main id="main" tabIndex={-1}>
      <PageHead crumbs={[{ label: "เปรียบเทียบสินค้า" }]} selfHref="/compare" eyebrow="เลือกรุ่นที่ใช่" title="เปรียบเทียบสินค้า" />
      <div className="container pg-body">
        <Suspense fallback={<div className="pg-empty">กำลังโหลด…</div>}>
          <CompareTable searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
