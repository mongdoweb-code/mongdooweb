// การ์ดสินค้า — markup เดียวกับ "สินค้าขายดี" ในหน้าแรก (ปุ่ม data-add ทำงานผ่าน shell.js)
import type { CatalogItem } from "@/lib/storefront";

export const formatBaht = (n: number) => "฿" + n.toLocaleString("th-TH");

export function phClass(p: Pick<CatalogItem, "acc" | "color">) {
  return "ph" + (p.acc ? " acc" : p.color === "rgb" ? " rgb" : "");
}

export const canBuy = (p: Pick<CatalogItem, "price" | "inStock">) => p.price > 0 && p.inStock;

export function ProductCard({ p }: { p: CatalogItem }) {
  const href = `/product/${encodeURIComponent(p.id)}`;
  const badge = p.badge ?? (p.compareAt ? `ลด ${Math.round((1 - p.price / p.compareAt) * 100)}%` : null);
  return (
    <article className="prod-card" id={`prod-${p.id}`}>
      <a className="prod-img" href={href} tabIndex={-1} aria-hidden="true">
        {badge && <span className={`prod-badge${!p.badge ? " badge-sale" : ""}`}>{badge}</span>}
        {p.img ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูปย่อ WebP จาก /media อยู่แล้ว
          <img src={p.img} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className={phClass(p)} />
        )}
        {p.price > 0 && !p.inStock && <span className="stock-out">สินค้าหมดชั่วคราว</span>}
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
          <div className="prod-price">
            {p.price > 0 ? formatBaht(p.price) : "สอบถามราคา"}
            {p.compareAt && <s>{formatBaht(p.compareAt)}</s>}
          </div>
          {canBuy(p) ? (
            <button className="add-btn" type="button" data-add={p.id} aria-label={`ใส่ตะกร้า: ${p.name}`}>
              ใส่ตะกร้า
            </button>
          ) : (
            <a className="add-btn" href={href}>
              {p.price > 0 ? "สินค้าหมด" : "ดูรายละเอียด"}
            </a>
          )}
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
