// การ์ดสินค้า — markup เดียวกับ "สินค้าขายดี" ในหน้าแรก (ปุ่ม data-add ทำงานผ่าน shell.js)
import type { CatalogItem } from "@/lib/storefront";

export const formatBaht = (n: number) => "฿" + n.toLocaleString("th-TH");

export function phClass(p: Pick<CatalogItem, "acc" | "color">) {
  return "ph" + (p.acc ? " acc" : p.color === "rgb" ? " rgb" : "");
}

export function ProductCard({ p }: { p: CatalogItem }) {
  const href = `/product/${encodeURIComponent(p.id)}`;
  return (
    <article className="prod-card" id={`prod-${p.id}`}>
      <a className="prod-img" href={href} tabIndex={-1} aria-hidden="true">
        {p.badge && <span className="prod-badge">{p.badge}</span>}
        <div className={phClass(p)} />
      </a>
      <div className="prod-body">
        <div className="prod-cat">{p.cat}</div>
        <h3 className="prod-name">
          <a href={href}>{p.name}</a>
        </h3>
        <div className="prod-specs">
          {p.specs.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <div className="prod-foot">
          <div className="prod-price">{formatBaht(p.price)}</div>
          <button className="add-btn" type="button" data-add={p.id} aria-label={`ใส่ตะกร้า: ${p.name}`}>
            ใส่ตะกร้า
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ items, empty }: { items: CatalogItem[]; empty?: React.ReactNode }) {
  if (!items.length) return <div className="pg-empty">{empty ?? "ไม่พบสินค้า"}</div>;
  return (
    <div className="prod-grid">
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}
