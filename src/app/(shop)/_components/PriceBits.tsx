"use client";
// ราคา/ป้ายลดราคาที่คำนวณตามเวลาจริงของเครื่องลูกค้า (U3)
// ข้อมูลหน้าร้านถูกแคชไว้ → ช่วงลดราคาเริ่ม/หมดระหว่างที่แคชยังไม่หมดอายุ ราคาบนหน้าก็ต้องเปลี่ยนตามทันที
// render แรก (ตอน hydrate) ใช้ค่าที่ server คำนวณ → ตรงกับ HTML เสมอ แล้วค่อยใช้เวลาจริงหลัง mount
import { useCallback, useSyncExternalStore } from "react";
import { percentOff, viewPrice, type SaleInfo } from "@/lib/pricing";
import { formatBaht } from "./format";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** เวลาปัจจุบัน (ms) ปัดลงตาม step (ค่าเริ่มต้น 1 วินาที — ราคาเปลี่ยนตรงเวลาโปรเริ่ม/หมด) — ฝั่ง server/ตอน hydrate = null */
export function useNow(step = 1000): number | null {
  const get = useCallback(() => Math.floor(Date.now() / step) * step, [step]);
  return useSyncExternalStore(subscribe, get, () => null);
}

type Priced = { price: number; compareAt?: number | null; sale?: SaleInfo | null; badge?: string | null };

/** ป้ายบนรูปสินค้า: ลดราคาตามเวลา → "ลด x%" ก่อนเสมอ · ไม่งั้นป้ายที่ร้านตั้ง หรือ % จากราคาขีดฆ่า */
function badgeOf(p: Priced, now: number | null) {
  const v = viewPrice(p, now);
  if (v.on && v.compareAt) return { text: `ลด ${percentOff(v.price, v.compareAt)}%`, sale: true };
  if (p.badge) return { text: p.badge, sale: false };
  if (v.compareAt) return { text: `ลด ${percentOff(v.price, v.compareAt)}%`, sale: true };
  return null;
}

function Badge({ p, now, className }: { p: Priced; now: number | null; className: string }) {
  const b = badgeOf(p, now);
  return b ? <span className={`${className}${b.sale ? " badge-sale" : ""}`}>{b.text}</span> : null;
}
function LiveBadge({ p, className }: { p: Priced; className: string }) {
  return <Badge p={p} now={useNow()} className={className} />;
}
export function PriceBadge({ p, className = "prod-badge" }: { p: Priced; className?: string }) {
  return p.sale ? <LiveBadge p={p} className={className} /> : <Badge p={p} now={null} className={className} />;
}

function Price({ p, now }: { p: Priced; now: number | null }) {
  const v = viewPrice(p, now);
  return (
    <div className="prod-price">
      {v.price > 0 ? formatBaht(v.price) : "สอบถามราคา"}
      {v.compareAt && (
        <s>
          <span className="sr-only">ราคาปกติ </span>
          {formatBaht(v.compareAt)}
        </s>
      )}
    </div>
  );
}
function LivePrice({ p }: { p: Priced }) {
  return <Price p={p} now={useNow()} />;
}
/** ราคาบนการ์ดสินค้า */
export function CardPrice({ p }: { p: Priced }) {
  return p.sale ? <LivePrice p={p} /> : <Price p={p} now={null} />;
}

/** นับถอยหลัง "เหลือเวลา 2 วัน 03:12:45" */
export function countdownText(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  return d > 0 ? `${d} วัน ${hms}` : hms;
}
