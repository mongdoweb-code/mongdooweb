"use client";
// รูปภาพประกอบใต้ Data Sheet: จัดวางตามรูปแบบที่ตั้งในหลังบ้าน (เรียง 1–3 · ตาราง · สไลด์ · masonry · คอลลาจ · แบ่งเส้น 2 รูป)
// ระยะห่าง/ระยะขอบ/รัศมีมุม เป็นตัวแปร CSS · คลิกรูป = เปิดดูเต็มจอ (Lightbox เดียวกับรูปสินค้า) · รูปโหลดแบบ lazy + srcset
import { useState } from "react";
import { FREE_CLIPS, galleryBlocks, layoutOf, splitClip, type Gallery } from "@/lib/product-gallery";
import { srcSetOf } from "@/lib/img-srcset";
import { Lightbox } from "./Lightbox";
import "./gallery.css";

export type GalleryView = Omit<Gallery, "items"> & { items: (Gallery["items"][number] & { full: string; sm: string })[] };

export function ProductGallery({ g, name, preview }: { g: GalleryView; name: string; preview?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const blocks = galleryBlocks(g);
  const style = { "--pg-gap": `${g.gap}px`, "--pg-pad": `${g.pad}px`, "--pg-r": `${g.radius}px` } as React.CSSProperties;
  const cell = (it: GalleryView["items"][number] & { i: number }, cls = "", clip?: string, sizes = "(max-width: 768px) 100vw, 640px") => (
    <figure key={it.key} className={`pg-cell ${cls}`} style={clip ? { clipPath: clip } : undefined}>
      <button type="button" className="pg-img" onClick={() => setOpen(it.i)} aria-label={`ดูรูปขนาดใหญ่: ${it.cap || `${name} รูปที่ ${it.i + 1}`}`} disabled={preview}>
        {/* eslint-disable-next-line @next/next/no-img-element -- รูปจากที่เก็บไฟล์ของร้าน + srcset ของเราเอง */}
        <img src={it.full} srcSet={srcSetOf(it.full)} sizes={sizes} alt={it.cap || `${name} รูปที่ ${it.i + 1}`} loading="lazy" decoding="async" />
      </button>
      {it.cap && g.caption !== "none" && <figcaption className={`pg-cap pg-cap-${g.caption}`}>{it.cap}</figcaption>}
    </figure>
  );
  return (
    <section className={`pg-sec pg-cap-mode-${g.caption}`} aria-labelledby={g.title ? "pg-h" : undefined} aria-label={g.title ? undefined : "รูปภาพประกอบ"} style={style} data-layout={g.layout}>
      {g.title && <h2 className="sec-title pg-title" id="pg-h">{g.title}</h2>}
      <div className="pg-blocks">
        {blocks.map((b, bi) => {
          const L = layoutOf(b.layout);
          if (L.kind === "split") {
            const [a, c] = b.items;
            return (
              <div key={bi} className="pg-block pg-split" data-block={b.layout}>
                {cell(a, "pg-under")}
                {cell(c, "pg-over", splitClip(b.layout))}
              </div>
            );
          }
          if (b.layout === "free") {
            return <div key={bi} className="pg-block pg-free" data-block="free">{b.items.map((it, k) => cell(it, "pg-abs", FREE_CLIPS[k]))}</div>;
          }
          return (
            <div key={bi} className={`pg-block pg-${b.layout}`} data-block={b.layout}>
              {b.items.map((it) => cell(it, "", undefined, L.cols === 1 ? "(max-width: 1024px) 100vw, 1100px" : undefined))}
            </div>
          );
        })}
      </div>
      {open !== null && (
        <Lightbox images={g.items.map((it) => ({ full: it.full, sm: it.sm }))} alt={name} start={open} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
