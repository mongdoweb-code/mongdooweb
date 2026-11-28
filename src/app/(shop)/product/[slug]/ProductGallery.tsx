"use client";
// รูปภาพประกอบใต้ Data Sheet: จัดวางตามรูปแบบที่ตั้งในหลังบ้าน (เรียง 1–3 · ตาราง · สไลด์ · masonry · คอลลาจ · แบ่งเส้น 2 รูป)
// ระยะห่าง/ระยะขอบ/รัศมีมุม เป็นตัวแปร CSS · คลิกรูป = เปิดดูเต็มจอ (Lightbox เดียวกับรูปสินค้า) · รูปโหลดแบบ lazy + srcset
import { useState } from "react";
import { CROSS4_CLIPS, FREE_CLIPS, HEART_MASK, galleryBlocks, layoutOf, ratioOf, splitClip, type Gallery } from "@/lib/product-gallery";
import { srcSetOf } from "@/lib/img-srcset";
import { Lightbox } from "./Lightbox";
import "./gallery.css";

export type GalleryView = Omit<Gallery, "items"> & { items: (Gallery["items"][number] & { full: string; sm: string })[] };

/** ตัวอย่างลายน้ำในหลังบ้าน (รูปจริงบนหน้าร้านใส่ลายน้ำลงในไฟล์แล้ว) */
export type WmPreview = { url: string; style: React.CSSProperties };

/** ตำแหน่งรูปทรงพิเศษ (% ของกรอบ): [left, top, width, height, หมุน°] */
const HEX_POS = [[16.667, 0], [50, 0], [0, 30], [33.333, 30], [66.667, 30], [16.667, 60], [50, 60]] as const;
const SCATTER_POS = [[3, 4, 54, 56, -4], [61, 10, 34, 38, 3], [5, 64, 40, 31, 2], [50, 55, 42, 40, -5]] as const;

export function ProductGallery({ g, name, preview, wmPreview }: { g: GalleryView; name: string; preview?: boolean; wmPreview?: WmPreview | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const blocks = galleryBlocks(g);
  const ar = ratioOf(g.layout, g.ratio);
  const style = {
    "--pg-gap": `${g.gap}px`, "--pg-h": `${g.gap / 2}px`, "--pg-pad": `${g.pad}px`, "--pg-r": `${g.radius}px`,
    "--pg-fit": g.fit, ...(ar ? { "--pg-ar": String(ar) } : {}),
  } as React.CSSProperties;
  const cell = (it: GalleryView["items"][number] & { i: number }, cls = "", clip?: string, sizes = "(max-width: 768px) 100vw, 640px", pos?: React.CSSProperties, k?: number) => (
    <figure key={k ?? it.key} className={`pg-cell ${cls}`} style={clip || pos ? { ...(clip ? { clipPath: clip } : {}), ...pos } : undefined}>
      <button type="button" className="pg-img" onClick={() => setOpen(it.i)} aria-label={`ดูรูปขนาดใหญ่: ${it.cap || `${name} รูปที่ ${it.i + 1}`}`} disabled={preview}>
        {/* eslint-disable-next-line @next/next/no-img-element -- รูปจากที่เก็บไฟล์ของร้าน + srcset ของเราเอง */}
        <img src={it.full} srcSet={srcSetOf(it.full)} sizes={sizes} alt={it.cap || `${name} รูปที่ ${it.i + 1}`} loading="lazy" decoding="async" />
        {wmPreview && g.wm && (
          // eslint-disable-next-line @next/next/no-img-element -- ตัวอย่างลายน้ำในหลังบ้านเท่านั้น
          <img className="pg-wm" src={wmPreview.url} alt="" aria-hidden="true" style={wmPreview.style} />
        )}
      </button>
      {it.cap && g.caption !== "none" && <figcaption className={`pg-cap pg-cap-${g.caption}`}>{it.cap}</figcaption>}
    </figure>
  );
  return (
    <section className={`pg-sec pg-cap-mode-${g.caption}${ar ? "" : " pg-auto"} pg-fit-${g.fit}`} aria-labelledby={g.title ? "pg-h" : undefined} aria-label={g.title ? undefined : "รูปภาพประกอบ"} style={style} data-layout={g.layout}>
      {g.title && <h2 className="sec-title pg-title" id="pg-h">{g.title}</h2>}
      <div className="pg-blocks">
        {blocks.map((b, bi) => {
          const L = layoutOf(b.layout);
          if (b.layout === "cross4") {
            return <div key={bi} className="pg-block pg-split pg-cross4" data-block="cross4">{b.items.map((it, k) => cell(it, "pg-abs", CROSS4_CLIPS[k]))}</div>;
          }
          if (b.layout === "hex") {
            return (
              <div key={bi} className="pg-block pg-shape pg-hex" data-block="hex">
                {b.items.map((it, k) => cell(it, "pg-abs", undefined, "(max-width: 768px) 40vw, 360px", { left: `${HEX_POS[k][0]}%`, top: `${HEX_POS[k][1]}%` }))}
              </div>
            );
          }
          if (b.layout === "heart") {
            const cells: [number, number][] = [];
            HEART_MASK.forEach((row, y) => [...row].forEach((c, x) => c === "1" && cells.push([x, y])));
            return (
              <div key={bi} className="pg-block pg-shape pg-heart" data-block="heart">
                {b.items.map((it, k) => cell(it, "", undefined, "(max-width: 768px) 14vw, 160px", { gridColumn: cells[k][0] + 1, gridRow: cells[k][1] + 1 }, k))}
              </div>
            );
          }
          if (b.layout === "scatter") {
            return (
              <div key={bi} className="pg-block pg-shape pg-scatter" data-block="scatter">
                {b.items.map((it, k) => { const [l, t, w, h, r] = SCATTER_POS[k]; return cell(it, "pg-abs pg-frame", undefined, undefined, { left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, transform: `rotate(${r}deg)` }); })}
              </div>
            );
          }
          if (b.layout === "stackTilt" || b.layout === "circle") {
            return <div key={bi} className={`pg-block pg-shape pg-${b.layout}`} data-block={b.layout}>{b.items.map((it) => cell(it, b.layout === "stackTilt" ? "pg-frame" : ""))}</div>;
          }
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
