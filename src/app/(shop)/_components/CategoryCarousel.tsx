"use client";
// แถบ "เลือกซื้อตามหมวดหมู่": รูปวงกลม + ชื่อหมวด เลื่อนซ้าย/ขวา (ปัดนิ้วบนมือถือ หรือกดลูกศร) — ลูกศรซ่อนเองเมื่อสุดทาง
import { useCallback, useEffect, useRef, useState } from "react";

export type CarouselCat = { slug: string; th: string; img: string | null; count: number };

export function CategoryCarousel({ title, items, current }: { title: string; items: CarouselCat[]; current?: string }) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    // หน้าหมวด: เลื่อนให้หมวดปัจจุบันอยู่ในจอ
    el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
    update();
    el.addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); removeEventListener("resize", update); };
  }, [update]);
  const go = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section className="ccar" aria-labelledby="ccarTitle">
      <h2 id="ccarTitle" className="ccar-h">{title}</h2>
      <div className="ccar-wrap">
        <button type="button" className="ccar-arrow prev" onClick={() => go(-1)} disabled={edge.start} aria-label="เลื่อนหมวดหมู่ไปทางซ้าย">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <ul className="ccar-track" ref={track}>
          {items.map((c) => (
            <li key={c.slug}>
              <a className="ccar-item" href={`/category/${encodeURIComponent(c.slug)}`} aria-current={c.slug === current ? "page" : undefined}>
                <span className="ccar-img">
                  {c.img ? (
                    // eslint-disable-next-line @next/next/no-img-element -- รูปย่อ WebP จาก /media อยู่แล้ว
                    <img src={c.img} alt="" width={120} height={120} loading="lazy" decoding="async" />
                  ) : (
                    <span className="ccar-ph" aria-hidden="true">{c.th.slice(0, 1)}</span>
                  )}
                </span>
                <span className="ccar-name">{c.th}</span>
                <span className="sr-only"> ({c.count} รายการ)</span>
              </a>
            </li>
          ))}
        </ul>
        <button type="button" className="ccar-arrow next" onClick={() => go(1)} disabled={edge.end} aria-label="เลื่อนหมวดหมู่ไปทางขวา">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </button>
      </div>
    </section>
  );
}
