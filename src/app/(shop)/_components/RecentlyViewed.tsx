"use client";
// สินค้าที่ดูล่าสุด — เก็บเฉพาะในเครื่องลูกค้า (localStorage "mdw_recent" = [{ id, t }] ไม่เกิน 8 รายการ)
// ไม่ใช้คุกกี้ ไม่ส่งไปเซิร์ฟเวอร์ · ชื่อ/ราคา/รูปอ่านจากข้อมูลหน้าร้านล่าสุด (<script id="mdw-data">)
// จึงไม่แสดงสินค้าที่ปิดขายไปแล้ว และราคาเป็นปัจจุบันเสมอ
import { useEffect, useState } from "react";
import type { CatalogItem } from "@/lib/storefront";
import { ProductCard } from "./ProductCard";

export const RECENT_KEY = "mdw_recent";
export const RECENT_MAX = 8;

type Entry = { id: string; t: number };

function readIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is Entry => !!e && typeof e === "object" && typeof (e as Entry).id === "string")
      .map((e) => e.id.slice(0, 200))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    const now = Date.now();
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_MAX).map((id, i) => ({ id, t: now - i }))));
  } catch {}
}

/** บันทึกว่าดูสินค้านี้ (ย้ายขึ้นเป็นรายการแรก) */
export function recordView(id: string) {
  writeIds([id, ...readIds().filter((x) => x !== id)]);
}

function catalogMap(): Map<string, CatalogItem> {
  try {
    const data = JSON.parse(document.getElementById("mdw-data")?.textContent ?? "{}");
    return new Map((Array.isArray(data.catalog) ? (data.catalog as CatalogItem[]) : []).map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

/** สินค้าที่ดูล่าสุดที่ยังเปิดขายอยู่ (ไม่รวม exclude) */
export function readRecent(exclude?: string): CatalogItem[] {
  const map = catalogMap();
  return readIds()
    .filter((id) => id !== exclude)
    .map((id) => map.get(id))
    .filter((p): p is CatalogItem => !!p);
}

/** ส่วน "สินค้าที่คุณดูล่าสุด" ในหน้าสินค้า (record = บันทึกสินค้าหน้านี้ด้วย) */
export function RecentlyViewed({ currentId }: { currentId?: string }) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  useEffect(() => {
    const list = readRecent(currentId);
    if (currentId) recordView(currentId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่านจาก localStorage ได้หลัง mount เท่านั้น
    setItems(list);
  }, [currentId]);

  if (!items || !items.length) return null;
  return (
    <section className="pdp-related recent" aria-labelledby="recent-h">
      <div className="sec-head">
        <h2 className="sec-title" id="recent-h">
          สินค้าที่คุณดูล่าสุด
        </h2>
        <button
          type="button"
          className="link-more recent-clear"
          onClick={() => {
            writeIds(currentId ? [currentId] : []);
            setItems([]);
          }}
        >
          ล้างรายการ
        </button>
      </div>
      <div className="prod-grid">
        {items.slice(0, 4).map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}

// ตะกร้าว่างใน mini-cart แสดงรายการเดียวกันนี้จาก public/js/shell.js (recentHtml) ทุกหน้า
