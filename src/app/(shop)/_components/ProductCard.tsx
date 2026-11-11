// การ์ดสินค้า — markup เดียวกับ "สินค้าขายดี" ในหน้าแรก (ปุ่ม data-add ทำงานผ่าน shell.js)
// ไม่มี import ฝั่ง server จึงใช้ได้ทั้งใน server component และ client component (สินค้าที่ดูล่าสุด)
import { CARD_SIZES, srcSetOf } from "@/lib/img-srcset";
import type { CatalogItem } from "@/lib/storefront";
import { formatBaht } from "./format";
import { CardPrice, PriceBadge } from "./PriceBits";

export { formatBaht };

export function phClass(p: Pick<CatalogItem, "acc" | "color">) {
  return "ph" + (p.acc ? " acc" : p.color === "rgb" ? " rgb" : "");
}

export const canBuy = (p: Pick<CatalogItem, "price" | "inStock">) => p.price > 0 && p.inStock;

/** รูปย่อ (-sm) กว้าง/สูงไม่เกิน 480px — ใส่ขนาดไว้กันหน้าเลื่อน (กล่องรูปเป็นสี่เหลี่ยมจัตุรัส object-fit: contain) */
export const THUMB_SIZE = 480;

/** รถเข็น — สื่อว่ากดเพื่อสั่งซื้อ */
const CartIcon = () => (
  <svg className="add-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1" />
    <circle cx="9.5" cy="19.5" r="1.3" />
    <circle cx="16.5" cy="19.5" r="1.3" />
  </svg>
);
const MoreIcon = () => (
  <svg className="add-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** options = จำนวนตัวเลือกของสินค้า (สินค้าหลายตัวเลือกแสดงการ์ดเดียว) */
export function ProductCard({ p, eager = false, note, options }: { p: CatalogItem; eager?: boolean; note?: string; options?: number }) {
  const href = `/product/${encodeURIComponent(p.id)}`;
  // ส่งเฉพาะข้อมูลราคาไปยัง client component (ไม่ส่งทั้งสินค้า)
  const pv = { price: p.price, compareAt: p.compareAt ?? null, sale: p.sale ?? null, badge: p.badge ?? null };
  return (
    <article className="prod-card" id={`prod-${p.id}`}>
      {/* data-more = รูปอื่นของสินค้า — ชี้เมาส์ค้างแล้วเลื่อนแสดงทีละรูปแบบ fade (public/js/shell.js) */}
      <a className="prod-img" href={href} tabIndex={-1} aria-hidden="true" data-more={p.more?.length ? p.more.join(" ") : undefined}>
        <PriceBadge p={pv} />
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
        {options && options > 1 ? <div className="prod-opts">มี {options} ตัวเลือก</div> : null}
        <div className="prod-specs">
          {p.specs.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <div className="prod-foot">
          <CardPrice p={pv} />
          {canBuy(p) ? (
            <button className="add-btn" type="button" data-add={p.id} aria-label={`ใส่ตะกร้า: ${p.name}`} title="ใส่ตะกร้า">
              <CartIcon />
              <span className="add-lbl">ใส่ตะกร้า</span>
            </button>
          ) : (
            <a className="add-btn add-more" href={href} aria-label={`${p.price > 0 ? "สินค้าหมด" : "ดูรายละเอียด"}: ${p.name}`} title={p.price > 0 ? "สินค้าหมด" : "ดูรายละเอียด"}>
              <MoreIcon />
              <span className="add-lbl">{p.price > 0 ? "สินค้าหมด" : "ดูรายละเอียด"}</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/** eager = จำนวนการ์ดแถวแรกที่โหลดรูปทันที (อยู่ในจอแรก) ที่เหลือ lazy-load */
/** view = มุมมองของหน้ารายการสินค้า (g2 | g3 | g4 | g6 | list) — ไม่ส่ง = ตารางปกติของหน้าแรก/สินค้าที่เกี่ยวข้อง */
export function ProductGrid({ items, empty, eager = 0, options, view }: { items: CatalogItem[]; empty?: React.ReactNode; eager?: number; options?: Record<string, number>; view?: string }) {
  if (!items.length) return <div className="pg-empty">{empty ?? "ไม่พบสินค้า"}</div>;
  return (
    <div className="prod-grid" data-view={view} data-listing={view ? "" : undefined}>
      {items.map((p, i) => (
        <ProductCard key={p.id} p={p} eager={i < eager} options={options?.[p.id]} />
      ))}
    </div>
  );
}
