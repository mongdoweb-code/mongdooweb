// การ์ดสินค้า — markup เดียวกับ "สินค้าขายดี" ในหน้าแรก (ปุ่ม data-add ทำงานผ่าน shell.js)
// ไม่มี import ฝั่ง server จึงใช้ได้ทั้งใน server component และ client component (สินค้าที่ดูล่าสุด)
import { CARD_SIZES, srcSetOf } from "@/lib/img-srcset";
import type { CatalogItem } from "@/lib/storefront";

export const formatBaht = (n: number) => "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

export function phClass(p: Pick<CatalogItem, "acc" | "color">) {
  return "ph" + (p.acc ? " acc" : p.color === "rgb" ? " rgb" : "");
}

export const canBuy = (p: Pick<CatalogItem, "price" | "inStock">) => p.price > 0 && p.inStock;

/** รูปย่อ (-sm) กว้าง/สูงไม่เกิน 480px — ใส่ขนาดไว้กันหน้าเลื่อน (กล่องรูปเป็นสี่เหลี่ยมจัตุรัส object-fit: contain) */
export const THUMB_SIZE = 480;

export function ProductCard({ p, eager = false, note }: { p: CatalogItem; eager?: boolean; note?: string }) {
  const href = `/product/${encodeURIComponent(p.id)}`;
  const badge = p.badge ?? (p.compareAt ? `ลด ${Math.round((1 - p.price / p.compareAt) * 100)}%` : null);
  return (
    <article className="prod-card" id={`prod-${p.id}`}>
      <a className="prod-img" href={href} tabIndex={-1} aria-hidden="true">
        {badge && <span className={`prod-badge${!p.badge ? " badge-sale" : ""}`}>{badge}</span>}
        {p.img ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูปย่อ WebP จาก /media อยู่แล้ว
          <img
            src={p.img}
            srcSet={srcSetOf(p.img, 640)}
            sizes={CARD_SIZES}
            alt=""
            width={THUMB_SIZE}
            height={THUMB_SIZE}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
          />
        ) : (
          <div className={phClass(p)} />
        )}
        {p.price > 0 && !p.inStock && <span className="stock-out">สินค้าหมดชั่วคราว</span>}
      </a>
      <div className="prod-body">
        {note ? <div className="prod-note">{note}</div> : <div className="prod-cat">{p.cat}</div>}
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
            <a className="add-btn" href={href} aria-label={`${p.price > 0 ? "สินค้าหมด" : "ดูรายละเอียด"}: ${p.name}`}>
              {p.price > 0 ? "สินค้าหมด" : "ดูรายละเอียด"}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/** eager = จำนวนการ์ดแถวแรกที่โหลดรูปทันที (อยู่ในจอแรก) ที่เหลือ lazy-load */
export function ProductGrid({ items, empty, eager = 0 }: { items: CatalogItem[]; empty?: React.ReactNode; eager?: number }) {
  if (!items.length) return <div className="pg-empty">{empty ?? "ไม่พบสินค้า"}</div>;
  return (
    <div className="prod-grid">
      {items.map((p, i) => (
        <ProductCard key={p.id} p={p} eager={i < eager} />
      ))}
    </div>
  );
}
