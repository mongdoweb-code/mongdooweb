// การ์ดสินค้า — markup เดียวกับ "สินค้าขายดี" ในหน้าแรก (ปุ่ม data-add ทำงานผ่าน shell.js)
// ไม่มี import ฝั่ง server จึงใช้ได้ทั้งใน server component และ client component (สินค้าที่ดูล่าสุด)
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

/** options = จำนวนตัวเลือกของสินค้า (สินค้าหลายตัวเลือกแสดงการ์ดเดียว) */
export function ProductCard({ p, eager = false, note, options }: { p: CatalogItem; eager?: boolean; note?: string; options?: number }) {
  const href = `/product/${encodeURIComponent(p.id)}`;
  // ส่งเฉพาะข้อมูลราคาไปยัง client component (ไม่ส่งทั้งสินค้า)
  const pv = { price: p.price, compareAt: p.compareAt ?? null, sale: p.sale ?? null, badge: p.badge ?? null };
  return (
    <article className="prod-card" id={`prod-${p.id}`}>
      <a className="prod-img" href={href} tabIndex={-1} aria-hidden="true">
        <PriceBadge p={pv} />
        {p.img ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูปย่อ WebP จาก /media อยู่แล้ว
          <img
            src={p.img}
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
      {/* รายการโปรด / เปรียบเทียบ — สถานะและการกดจัดการใน public/js/shell.js (localStorage) */}
      <div className="wc-tools">
        <button type="button" className="wc-btn" data-wish={p.id} aria-pressed="false" aria-label={`เพิ่มในรายการโปรด: ${p.name}`} title="รายการโปรด">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
          </svg>
        </button>
        <button type="button" className="wc-btn" data-compare={p.id} aria-pressed="false" aria-label={`เปรียบเทียบ: ${p.name}`} title="เปรียบเทียบ">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4v16M17 4v16M3 8h8M13 16h8" />
          </svg>
        </button>
      </div>
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
export function ProductGrid({ items, empty, eager = 0, options }: { items: CatalogItem[]; empty?: React.ReactNode; eager?: number; options?: Record<string, number> }) {
  if (!items.length) return <div className="pg-empty">{empty ?? "ไม่พบสินค้า"}</div>;
  return (
    <div className="prod-grid">
      {items.map((p, i) => (
        <ProductCard key={p.id} p={p} eager={i < eager} options={options?.[p.id]} />
      ))}
    </div>
  );
}
