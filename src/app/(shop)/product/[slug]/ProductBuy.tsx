"use client";
// หน้าสินค้า (ฝั่งเบราว์เซอร์): แกลเลอรีรูป + ขยายเต็มจอ, เลือกจำนวนแล้วใส่ตะกร้า, แถบใส่ตะกร้าติดล่างจอบนมือถือ
// ตะกร้าใช้ของกลางใน public/js/shell.js (window.addToCart / openCart, localStorage "mdw_cart")
import { useCallback, useEffect, useRef, useState } from "react";
import { unitForQty, viewPrice, type SaleInfo, type TierInfo } from "@/lib/pricing";
import { formatBaht } from "../../_components/format";
import { useNow } from "../../_components/PriceBits";
import { srcSetOf } from "@/lib/img-srcset";

type ShellWindow = Window & { addToCart?: (id: string, qty: number, mode: string) => boolean; openCart?: (from?: Element) => void };
type Img = { full: string; sm: string };

/** รูปเต็มกว้าง/สูงไม่เกิน 1600px ใส่ในกล่องจัตุรัส (object-fit: contain) — ระบุขนาดกันหน้าเลื่อน */
const FULL = 1600;

// ---------------- แกลเลอรี ----------------

/** badge = ป้ายบนรูป (component ราคาที่คำนวณ "ลด x%" ตามเวลาจริง) */
export function Gallery({ images, alt, badge }: { images: Img[]; alt: string; badge?: React.ReactNode }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const n = images.length;

  // เลื่อนไปยังรูปที่ k (ปุ่มก่อน/ถัดไป, รูปย่อ, คีย์บอร์ด) — ปัดบนมือถือใช้ scroll-snap ของเบราว์เซอร์
  // ระหว่างเลื่อนด้วยโค้ด (ปุ่ม/คีย์บอร์ด) ไม่อ่านตำแหน่งจาก scroll — กันตัวนับกระโดดระหว่างทาง
  const target = useRef<number | null>(null);
  const go = useCallback(
    (k: number) => {
      const el = track.current;
      const next = (k + n) % n;
      setI(next);
      if (!el) return;
      target.current = next;
      el.scrollTo({ left: next * el.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    [n],
  );

  useEffect(() => {
    const el = track.current;
    if (!el || n < 2) return;
    let raf = 0;
    const at = () => Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const t = target.current;
        if (t !== null) {
          if (Math.abs(el.scrollLeft - t * el.clientWidth) < 2) target.current = null;
          return;
        }
        setI(at());
      });
    };
    // ผู้ใช้ปัดเอง (สัมผัส/ล้อเมาส์) → ยกเลิกเป้าหมายเดิม
    const onUser = () => {
      target.current = null;
    };
    const onEnd = () => {
      target.current = null;
      setI(at());
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onEnd);
    el.addEventListener("touchstart", onUser, { passive: true });
    el.addEventListener("wheel", onUser, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onEnd);
      el.removeEventListener("touchstart", onUser);
      el.removeEventListener("wheel", onUser);
      cancelAnimationFrame(raf);
    };
  }, [n]);

  if (!n) {
    return (
      <div className="pdp-gallery">
        <div className="pdp-main">
          {badge}
          <div className="ph" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="pdp-gallery"
      role="region"
      aria-label={`รูปสินค้า ${n} รูป`}
      onKeyDown={(e) => {
        if (n < 2 || (e.target as HTMLElement).closest("dialog")) return;
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        go(i + (e.key === "ArrowRight" ? 1 : -1));
      }}
    >
      <div className="pdp-main gal">
        {badge}
        <div className="gal-track" ref={track}>
          {images.map((im, k) => (
            <button
              key={im.full + k}
              type="button"
              className="gal-slide"
              aria-label={`ขยายรูปที่ ${k + 1} จาก ${n}`}
              tabIndex={k === i ? 0 : -1}
              onClick={() => setZoom(k)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- รูป WebP จาก /media ย่อขนาดแล้ว */}
              <img
                src={im.full}
                srcSet={srcSetOf(im.full) ?? `${im.sm} 480w, ${im.full} ${FULL}w`}
                sizes="(max-width: 768px) 100vw, 50vw"
                alt={k === 0 ? alt : `${alt} รูปที่ ${k + 1}`}
                width={FULL}
                height={FULL}
                decoding="async"
                loading={k === 0 ? "eager" : "lazy"}
                fetchPriority={k === 0 ? "high" : "low"}
                draggable={false}
              />
            </button>
          ))}
        </div>
        {n > 1 && (
          <>
            <button type="button" className="gal-nav prev" aria-label="รูปก่อนหน้า" onClick={() => go(i - 1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 5-7 7 7 7" />
              </svg>
            </button>
            <button type="button" className="gal-nav next" aria-label="รูปถัดไป" onClick={() => go(i + 1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 5 7 7-7 7" />
              </svg>
            </button>
            <span className="gal-count" aria-live="polite">
              {i + 1} / {n}
            </span>
          </>
        )}
        <span className="gal-hint" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" />
          </svg>
        </span>
      </div>
      {n > 1 && (
        <div className="pdp-thumbs" role="group" aria-label="เลือกรูป">
          {images.map((im, k) => (
            <button key={im.sm + k} type="button" aria-current={k === i} aria-label={`ดูรูปที่ ${k + 1}`} onClick={() => go(k)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.sm} alt="" width={72} height={72} loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
      {zoom !== null && (
        <Lightbox
          images={images}
          alt={alt}
          start={zoom}
          onClose={(k) => {
            setZoom(null);
            go(k);
          }}
        />
      )}
    </div>
  );
}

/** ดูรูปเต็มจอ: ปิดด้วย Esc / ปุ่มปิด / คลิกพื้นหลัง / ปัดลง · เลื่อนรูปด้วยปุ่ม ลูกศร หรือปัดซ้าย-ขวา */
function Lightbox({ images, alt, start, onClose }: { images: Img[]; alt: string; start: number; onClose: (k: number) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [k, setK] = useState(start);
  const kRef = useRef(start);
  useEffect(() => {
    kRef.current = k;
  }, [k]);
  const n = images.length;
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const [dy, setDy] = useState(0);
  const step = (d: number) => setK((x) => (x + d + n) % n);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    // Esc → เหตุการณ์ cancel/close ของ <dialog> (โฟกัสกลับไปที่ปุ่มที่เปิดโดยอัตโนมัติ)
    const onCloseEv = () => onClose(kRef.current);
    d.addEventListener("close", onCloseEv);
    return () => {
      d.removeEventListener("close", onCloseEv);
      html.style.overflow = prev;
    };
  }, [onClose]);

  const close = () => ref.current?.close();
  const im = images[k];

  return (
    <dialog
      ref={ref}
      className="lb"
      aria-label={`รูปสินค้า ${k + 1} จาก ${n}`}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      }}
      onClick={(e) => {
        // คลิกพื้นหลัง (นอกรูป/ปุ่ม) = ปิด
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("lb-stage")) close();
      }}
    >
      <div
        className="lb-stage"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const s = drag.current;
          if (s && s.id === e.pointerId && e.pointerType !== "mouse") setDy(Math.max(0, e.clientY - s.y));
        }}
        onPointerUp={(e) => {
          const s = drag.current;
          drag.current = null;
          setDy(0);
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          const ddy = e.clientY - s.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(ddy)) step(dx < 0 ? 1 : -1);
          else if (ddy > 90 && ddy > Math.abs(dx)) close();
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDy(0);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={im.full}
          src={im.full}
          alt={k === 0 ? alt : `${alt} รูปที่ ${k + 1}`}
          width={FULL}
          height={FULL}
          decoding="async"
          draggable={false}
          style={dy ? { transform: `translateY(${dy}px)`, opacity: Math.max(0.3, 1 - dy / 400) } : undefined}
        />
      </div>
      <button type="button" className="lb-close" aria-label="ปิดรูปขยาย" onClick={close} autoFocus>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      {n > 1 && (
        <>
          <button type="button" className="lb-nav prev" aria-label="รูปก่อนหน้า" onClick={() => step(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 5-7 7 7 7" />
            </svg>
          </button>
          <button type="button" className="lb-nav next" aria-label="รูปถัดไป" onClick={() => step(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
          <span className="lb-count" aria-live="polite">
            {k + 1} / {n}
          </span>
        </>
      )}
    </dialog>
  );
}

// ---------------- เลือกจำนวน + ใส่ตะกร้า ----------------

const CART_KEY = "mdw_cart";
function inCart(slug: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) ?? "{}") as Record<string, unknown>;
    const q = Math.floor(Number(raw?.[slug]));
    return Number.isFinite(q) && q > 0 ? q : 0;
  } catch {
    return 0;
  }
}

/**
 * max = จำนวนสูงสุดที่สั่งได้ (สต็อกคงเหลือ หรือ 999 ถ้าไม่นับสต็อก) — หักจำนวนที่อยู่ในตะกร้าแล้ว
 * stockLeft ≤ 5 → แสดง "เหลือ n ชิ้น" ข้างตัวเลือกจำนวน
 */
export function BuyBox({
  slug,
  max,
  stockLeft,
  unit,
  name,
  price,
  img,
  tiers,
}: {
  slug: string;
  max: number;
  stockLeft: number | null;
  unit: string;
  name: string;
  /** ราคา 1 ชิ้น (ค่าที่แคชไว้ + ช่วงลดราคา) — คำนวณราคาปัจจุบันตามเวลาจริงของเครื่อง */
  price: { price: number; compareAt: number | null; sale: SaleInfo | null };
  img?: string;
  /** ราคาขายส่ง: คิดจากจำนวนรวมในตะกร้า (ที่มีอยู่ + ที่จะใส่เพิ่ม) เหมือนที่ server คิดตอนสั่งซื้อ */
  tiers?: TierInfo;
}) {
  const [have, setHave] = useState(0);
  const [text, setText] = useState("1");
  const [bar, setBar] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const room = Math.max(0, max - have);
  const clamp = (v: number) => Math.max(1, Math.min(Math.max(1, room), Math.floor(v) || 1));
  // จำนวนที่จะใส่ตะกร้า = ค่าที่พิมพ์ ตัดให้อยู่ในช่วง 1..ที่เหลือให้ใส่ได้เสมอ
  const qty = clamp(Number(text));
  const set = (v: number) => setText(String(clamp(v)));
  const base = viewPrice(price, useNow()).price;
  const unitPrice = unitForQty(base, tiers, have + qty);
  const wholesale = unitPrice < base;

  // จำนวนที่อยู่ในตะกร้าแล้ว (อัปเดตเมื่อใส่ตะกร้า หรือแก้จากแท็บอื่น)
  useEffect(() => {
    const sync = () => setHave(inCart(slug));
    sync();
    addEventListener("storage", sync);
    addEventListener("focus", sync);
    return () => {
      removeEventListener("storage", sync);
      removeEventListener("focus", sync);
    };
  }, [slug]);

  // แถบใส่ตะกร้าติดล่างจอ (มือถือ): แสดงเมื่อเลื่อนผ่านปุ่มหลักไปแล้ว
  useEffect(() => {
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setBar(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.toggle("pdp-bar-on", bar);
    return () => document.body.classList.remove("pdp-bar-on");
  }, [bar]);

  const add = (from: Element) => {
    if (room <= 0) return;
    const w = window as ShellWindow;
    if (w.addToCart?.(slug, qty, "silent")) {
      setHave(inCart(slug));
      setText("1");
      w.openCart?.(from);
    }
  };
  const full = room <= 0;
  const low = stockLeft != null && stockLeft <= 5;

  return (
    <>
      <div className="pdp-actions" ref={box}>
        <div className="pdp-qty" role="group" aria-label="จำนวน">
          <button type="button" aria-label="ลดจำนวน" disabled={qty <= 1 || full} onClick={() => set(qty - 1)}>
            −
          </button>
          <label className="sr-only" htmlFor="pdpQty">
            จำนวน ({unit})
          </label>
          <input
            id="pdpQty"
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, room)}
            value={text}
            disabled={full}
            aria-describedby="pdpQtyNote"
            onChange={(e) => {
              // พิมพ์ได้อิสระ ตรวจ/ตัดให้อยู่ในช่วงเมื่อออกจากช่อง หรือเกินสต็อกทันที
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              if (v && Number(v) > room) return set(room);
              setText(v);
            }}
            onBlur={() => set(Number(text))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                set(Number(text));
              }
            }}
          />
          <button type="button" aria-label="เพิ่มจำนวน" disabled={qty >= room || full} onClick={() => set(qty + 1)}>
            +
          </button>
        </div>
        <button className="btn btn-primary pdp-add" type="button" disabled={full} onClick={(e) => add(e.currentTarget)}>
          {full ? "ใส่ตะกร้าครบจำนวนที่มีแล้ว" : "ใส่ตะกร้า"} {!full && <span className="arr">→</span>}
        </button>
        <p className="pdp-qty-note" id="pdpQtyNote">
          {low && (
            <b className="low">
              เหลือ {stockLeft} {unit}
            </b>
          )}
          {have > 0 && (
            <span>
              {low ? " · " : ""}มีในตะกร้าแล้ว {have} {unit}
            </span>
          )}
          {!low && !have && max < 999 && (
            <span>
              สั่งได้สูงสุด {max} {unit}
            </span>
          )}
        </p>
        {wholesale && (
          <p className="pdp-tier-on" role="status">
            ได้ราคาขายส่ง <b>{formatBaht(unitPrice)}</b>/{unit} (รวมในตะกร้า {have + qty} {unit})
          </p>
        )}
      </div>
      <div className="pdp-bar" hidden={!bar} role="region" aria-label="ใส่ตะกร้าด่วน">
        <div className="pdp-bar-in">
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" width={48} height={48} loading="lazy" decoding="async" />
          )}
          <div className="pdp-bar-txt">
            <span className="nm">{name}</span>
            <b>{formatBaht(unitPrice)}</b>
          </div>
          <button className="btn btn-primary btn-sm" type="button" disabled={full} onClick={(e) => add(e.currentTarget)}>
            {full ? "ครบจำนวนแล้ว" : qty > 1 ? `ใส่ตะกร้า ${qty} ${unit}` : "ใส่ตะกร้า"}
          </button>
        </div>
      </div>
    </>
  );
}
