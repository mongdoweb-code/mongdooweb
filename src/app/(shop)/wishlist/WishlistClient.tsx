"use client";
// รายการโปรด (U7) — เก็บในเครื่องลูกค้า (localStorage "mdw_wish") ไม่ต้องสมัครสมาชิก
// แชร์เป็นลิงก์ /wishlist?ids=… · ส่งรายการให้ร้านทาง LINE · ขอใบเสนอราคา (เปิด /quote พร้อมรายการ)
// ชื่อ/ราคา/รูปอ่านจากข้อมูลหน้าร้านล่าสุด (<script id="mdw-data">) — สินค้าที่ปิดขายแล้วไม่แสดง
import { useCallback, useEffect, useState } from "react";
import { viewPrice, type SaleInfo } from "@/lib/pricing";
import { formatBaht } from "../_components/format";
import { useNow } from "../_components/PriceBits";
import { ShareTools, shareToast } from "../_components/ShareTools";

const KEY = "mdw_wish";
type Item = { id: string; name: string; price: number; compareAt?: number; sale?: SaleInfo; img?: string; inStock: boolean; cat: string; sku?: string; acc?: boolean; color?: string };
type ShellWin = Window & {
  mdwLists?: { write: (k: string, v: string[]) => void };
  addToCart?: (id: string, qty: number, mode: string) => boolean;
  openCart?: (from?: Element) => void;
};

function readLocal(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 200).slice(0, 60) : [];
  } catch {
    return [];
  }
}
function writeLocal(ids: string[]) {
  const w = window as ShellWin;
  if (w.mdwLists) w.mdwLists.write(KEY, ids);
  else
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {}
}
function catalog(): Map<string, Item> {
  try {
    const d = JSON.parse(document.getElementById("mdw-data")?.textContent ?? "{}");
    return new Map((Array.isArray(d.catalog) ? (d.catalog as Item[]) : []).map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

export function WishlistClient({ lineBase }: { lineBase: string }) {
  const [ready, setReady] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [shared, setShared] = useState<string[] | null>(null);
  const [items, setItems] = useState<Map<string, Item>>(new Map());
  const [qty, setQty] = useState<Record<string, number>>({});
  const now = useNow();

  const load = useCallback(() => {
    setItems(catalog());
    setIds(readLocal());
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get("ids");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน localStorage/URL ได้หลัง mount เท่านั้น
    if (q != null) setShared([...new Set(q.split(",").map((s) => s.trim().slice(0, 200)).filter(Boolean))].slice(0, 60));
    load();
    setReady(true);
    const on = () => load();
    document.addEventListener("mdw:lists", on);
    addEventListener("storage", on);
    return () => {
      document.removeEventListener("mdw:lists", on);
      removeEventListener("storage", on);
    };
  }, [load]);

  if (!ready) return <div className="pg-empty">กำลังโหลดรายการโปรด…</div>;

  const viewing = shared ?? ids;
  const list = viewing.map((id) => items.get(id)).filter((p): p is Item => !!p);
  const isShared = shared != null && shared.join(",") !== ids.join(",");
  const q = (id: string) => Math.max(1, Math.min(999, qty[id] ?? 1));
  const path = `/wishlist?ids=${list.map((p) => encodeURIComponent(p.id)).join(",")}`;
  const lineText = () =>
    `สวัสดีครับ/ค่ะ ขอใบเสนอราคาสินค้าตามรายการนี้\n${list.map((p, i) => `${i + 1}. ${p.name}${p.sku ? ` (รหัส ${p.sku})` : ""} × ${q(p.id)}`).join("\n")}\n${location.origin}${path}`;
  const remove = (id: string) => {
    if (isShared) setShared((s) => (s ?? []).filter((x) => x !== id));
    else writeLocal(ids.filter((x) => x !== id));
  };

  if (!list.length)
    return (
      <div className="pg-empty" data-wish-empty>
        <b>{shared != null ? "ไม่พบสินค้าในลิงก์นี้" : "ยังไม่มีสินค้าในรายการโปรด"}</b>
        กดรูปหัวใจบนการ์ดสินค้าหรือหน้าสินค้าเพื่อเก็บไว้ดูภายหลัง{" "}
        <a className="link-more" href="/products">
          ดูสินค้าทั้งหมด
        </a>
      </div>
    );

  const buyable = list.filter((p) => p.price > 0 && p.inStock);
  return (
    <>
      {isShared && (
        <div className="wl-shared" role="status">
          <span>
            รายการโปรดที่มีคนแชร์มา <b>{list.length}</b> รายการ
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              writeLocal([...new Set([...list.map((p) => p.id), ...ids])].slice(0, 60));
              setShared(null);
              history.replaceState(null, "", "/wishlist");
              shareToast("บันทึกเป็นรายการโปรดของคุณแล้ว");
            }}
          >
            บันทึกเป็นรายการโปรดของฉัน
          </button>
        </div>
      )}
      <ul className="wl-list" data-wish-list>
        {list.map((p) => {
          const v = viewPrice(p, now);
          return (
            <li key={p.id} className="wl-item" data-wish-item={p.id}>
              {p.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.img} alt="" width={88} height={88} loading="lazy" decoding="async" />
              ) : (
                <span className={`ph${p.acc ? " acc" : p.color === "rgb" ? " rgb" : ""}`} />
              )}
              <div>
                <a className="nm" href={`/product/${encodeURIComponent(p.id)}`}>
                  {p.name}
                </a>
                <div className="meta">
                  {p.cat}
                  {p.sku ? ` · รหัส ${p.sku}` : ""}
                </div>
                <div className="prod-price">
                  {v.price > 0 ? formatBaht(v.price) : "สอบถามราคา"}
                  {v.compareAt && (
                    <s>
                      <span className="sr-only">ราคาปกติ </span>
                      {formatBaht(v.compareAt)}
                    </s>
                  )}
                </div>
                {v.price > 0 && !p.inStock && <div className="meta">สินค้าหมดชั่วคราว</div>}
              </div>
              <div className="act">
                <label className="meta">
                  จำนวน{" "}
                  <input
                    className="wl-qty"
                    type="number"
                    min={1}
                    max={999}
                    inputMode="numeric"
                    value={q(p.id)}
                    onChange={(e) => setQty({ ...qty, [p.id]: Math.floor(Number(e.target.value)) || 1 })}
                  />
                </label>
                {v.price > 0 && p.inStock ? (
                  <button
                    type="button"
                    className="add-btn"
                    onClick={(e) => {
                      const w = window as ShellWin;
                      if (w.addToCart?.(p.id, q(p.id), "silent")) w.openCart?.(e.currentTarget);
                    }}
                  >
                    ใส่ตะกร้า
                  </button>
                ) : (
                  <a className="add-btn" href={`/product/${encodeURIComponent(p.id)}`}>
                    ดูรายละเอียด
                  </a>
                )}
                <button type="button" className="rm" onClick={() => remove(p.id)} aria-label={`เอา ${p.name} ออกจากรายการ`}>
                  เอาออก
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="wl-bar">
        <a className="btn btn-primary" href={`/quote?items=${list.map((p) => `${encodeURIComponent(p.id)}:${q(p.id)}`).join(",")}`} data-wish-quote>
          ขอใบเสนอราคารายการนี้
        </a>
        {buyable.length > 0 && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={(e) => {
              const w = window as ShellWin;
              let n = 0;
              for (const p of buyable) if (w.addToCart?.(p.id, q(p.id), "silent")) n++;
              if (n) w.openCart?.(e.currentTarget);
            }}
          >
            ใส่ทั้งหมดลงตะกร้า ({buyable.length})
          </button>
        )}
        <a
          className="btn btn-line"
          href={lineBase}
          target="_blank"
          rel="noopener"
          data-wish-line
          onClick={(e) => {
            // ลิงก์แชทร้านที่พิมพ์รายการไว้ให้ (ร้านตั้ง LINE ID แล้ว) — ไม่งั้นเปิดหน้าเพิ่มเพื่อนของร้าน
            if (lineBase.includes("/oaMessage/")) e.currentTarget.href = lineBase + encodeURIComponent(lineText());
          }}
        >
          ส่งรายการให้ร้านทาง LINE
        </a>
        <ShareTools path={path} text={`รายการสินค้าที่สนใจ ${list.length} รายการ จากร้านมองดูเว็บ`} />
      </div>
    </>
  );
}
