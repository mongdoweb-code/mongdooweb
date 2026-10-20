"use client";
// แกลเลอรีรูป + เลือกจำนวนแล้วใส่ตะกร้า (ใช้ตะกร้ากลางใน public/js/shell.js)
import { useState } from "react";

type ShellWindow = Window & { addToCart?: (id: string, qty: number, mode: string) => boolean; openCart?: (from?: Element) => void };

export function Gallery({ images, alt, badge }: { images: { full: string; sm: string }[]; alt: string; badge?: string | null }) {
  const [i, setI] = useState(0);
  const cur = images[i];
  return (
    <div className="pdp-gallery">
      <div className="pdp-main">
        {badge && <span className="prod-badge">{badge}</span>}
        {cur ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูป WebP จาก /media ย่อขนาดแล้ว
          <img src={cur.full} alt={alt} fetchPriority="high" />
        ) : (
          <div className="ph" />
        )}
      </div>
      {images.length > 1 && (
        <div className="pdp-thumbs" role="group" aria-label="รูปสินค้า">
          {images.map((im, k) => (
            <button key={im.sm} type="button" aria-current={k === i} aria-label={`รูปที่ ${k + 1}`} onClick={() => setI(k)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.sm} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BuyBox({ slug, max }: { slug: string; max: number }) {
  const [qty, setQty] = useState(1);
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.floor(n) || 1));
  return (
    <div className="pdp-actions">
      <div className="pdp-qty">
        <button type="button" aria-label="ลดจำนวน" onClick={() => setQty((q) => clamp(q - 1))}>−</button>
        <label className="sr-only" htmlFor="pdpQty">จำนวน</label>
        <input id="pdpQty" type="number" inputMode="numeric" min={1} max={max} value={qty} onChange={(e) => setQty(clamp(Number(e.target.value)))} />
        <button type="button" aria-label="เพิ่มจำนวน" onClick={() => setQty((q) => clamp(q + 1))}>+</button>
      </div>
      <button
        className="btn btn-primary"
        type="button"
        onClick={(e) => {
          const w = window as ShellWindow;
          if (w.addToCart?.(slug, qty, "silent")) w.openCart?.(e.currentTarget);
        }}
      >
        ใส่ตะกร้า <span className="arr">→</span>
      </button>
    </div>
  );
}
