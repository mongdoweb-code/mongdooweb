"use client";
// หน้าต่าง "เลือกสินค้า" ของตัวแก้ไขเอกสารขาย: ค้นหา + กรองหมวด + รูป/ราคา/สต็อก · ติ๊กหลายรายการพร้อมจำนวน แล้วเพิ่มทีเดียว
// แป้นพิมพ์: พิมพ์ค้นหาได้ทันที · ↑↓ เลื่อน · Space/Enter ติ๊ก · Ctrl+Enter เพิ่มที่เลือก · Esc ปิด
import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "@/lib/doc-calc";

export type PickProd = {
  id: string; sku: string; name: string; unit: string; price: number; service: boolean; off: boolean;
  cat?: string; stock?: number | null; out?: boolean; imgs?: string[];
};

const thumb = (key: string) => (/^https:\/\//i.test(key) ? key : `/media/${key.replace(/\.webp$/, "-sm.webp")}`);
const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

export function ProductPicker({ products, inDoc, onAdd, onClose }: {
  products: PickProd[];
  /** productId → จำนวนที่อยู่ในเอกสารแล้ว (แสดงป้าย "มีในเอกสาร") */
  inDoc: Map<string, number>;
  onAdd: (picks: { p: PickProd; qty: number }[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [hideOff, setHideOff] = useState(true);
  const [sel, setSel] = useState<Map<string, number>>(new Map());
  const [hi, setHi] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) if (p.cat) m.set(p.cat, (m.get(p.cat) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);

  const list = useMemo(() => {
    const words = norm(q).split(" ").filter(Boolean);
    return products
      .filter((p) => (!hideOff || !p.off || sel.has(p.id)) && (!cat || p.cat === cat))
      .filter((p) => {
        if (!words.length) return true;
        const hay = norm(`${p.sku} ${p.name} ${p.cat ?? ""}`);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 200);
  }, [products, q, cat, hideOff, sel]);

  // ตั้งค่าครั้งเดียวตอนเปิด (onClose จากหน้าแม่เปลี่ยนทุกครั้งที่ render — ใช้ผ่าน ref ไม่งั้นล็อก/ปลดล็อกการเลื่อนหน้าซ้ำ ๆ จนปุ่มขยับ)
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    search.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", esc);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.classList.remove("modal-open");
    };
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  const toggle = (p: PickProd) =>
    setSel((m) => {
      const n = new Map(m);
      if (n.has(p.id)) n.delete(p.id);
      else n.set(p.id, 1);
      return n;
    });
  const setQty = (id: string, qty: number) =>
    setSel((m) => {
      const n = new Map(m);
      if (qty <= 0) n.delete(id);
      else n.set(id, Math.min(99999, qty));
      return n;
    });

  const add = () => {
    if (!sel.size) return;
    const byId = new Map(products.map((p) => [p.id, p]));
    onAdd([...sel.entries()].flatMap(([id, qty]) => (byId.get(id) ? [{ p: byId.get(id)!, qty }] : [])));
  };
  const total = [...sel.entries()].reduce((s, [id, qty]) => s + (products.find((p) => p.id === id)?.price ?? 0) * qty, 0);

  return (
    <div className="pp-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pp" role="dialog" aria-modal="true" aria-labelledby="pp-t"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            add();
            return;
          }
          const t = e.target as HTMLElement;
          if (t.tagName === "INPUT" && t !== search.current) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter" && list[hi]) { e.preventDefault(); toggle(list[hi]); }
        }}>
        <div className="pp-head">
          <h2 id="pp-t">เลือกสินค้า</h2>
          <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose}>✕</button>
        </div>
        <div className="pp-tools">
          <input ref={search} type="search" value={q} placeholder="ค้นหาชื่อ รหัสสินค้า หรือหมวด (พิมพ์หลายคำได้)" aria-label="ค้นหาสินค้า" aria-controls="pp-list"
            onChange={(e) => { setQ(e.target.value); setHi(0); }} />
          <label className="chk-row"><input type="checkbox" checked={hideOff} onChange={(e) => setHideOff(e.target.checked)} /> ซ่อนสินค้าที่ปิดขาย</label>
        </div>
        <div className="pp-cats" role="group" aria-label="กรองตามหมวด">
          <button type="button" aria-pressed={!cat} onClick={() => { setCat(""); setHi(0); }}>ทุกหมวด</button>
          {cats.map(([c, n]) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => { setCat(cat === c ? "" : c); setHi(0); }}>{c} <span>{n}</span></button>
          ))}
        </div>
        <ul className="pp-list" id="pp-list" ref={listRef} role="listbox" aria-multiselectable="true" aria-label="รายการสินค้า">
          {list.map((p, i) => {
            const on = sel.has(p.id);
            const qty = sel.get(p.id) ?? 1;
            const have = inDoc.get(p.id);
            const short = on && p.stock != null && qty > p.stock;
            return (
              <li key={p.id} data-i={i} role="option" aria-selected={on} className={`pp-row${on ? " on" : ""}${i === hi ? " hi" : ""}`}
                onMouseEnter={() => setHi(i)}>
                <label className="pp-pick">
                  <input type="checkbox" checked={on} onChange={() => toggle(p)} aria-label={`เลือก ${p.sku} ${p.name}`} />
                  <span className="pp-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.imgs?.[0] ? <img src={thumb(p.imgs[0])} alt="" loading="lazy" /> : <span aria-hidden="true">—</span>}
                  </span>
                  <span className="pp-info">
                    <b>{p.name}</b>
                    <span className="sub">
                      {p.sku}{p.cat ? ` · ${p.cat}` : ""}
                      {p.service ? " · ค่าบริการ" : ""}
                    </span>
                    <span className="pp-tags">
                      {p.off && <i className="t-off">ปิดขายหน้าเว็บ</i>}
                      {p.out && <i className="t-out">หมด</i>}
                      {p.stock != null && !p.out && <i className={p.stock <= 5 ? "t-low" : ""}>คงเหลือ {p.stock.toLocaleString("th-TH")}</i>}
                      {have ? <i className="t-in">มีในเอกสารแล้ว ×{have}</i> : null}
                    </span>
                  </span>
                </label>
                <span className="pp-price">{p.price ? `฿${money(p.price)}` : <i className="t-ask">สอบถามราคา</i>}<small>/{p.unit}</small></span>
                {on ? (
                  <span className="pp-qty">
                    <button type="button" aria-label={`ลดจำนวน ${p.sku}`} onClick={() => setQty(p.id, qty - 1)}>−</button>
                    <input inputMode="numeric" value={qty} aria-label={`จำนวน ${p.sku}`} onChange={(e) => setQty(p.id, Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)))} />
                    <button type="button" aria-label={`เพิ่มจำนวน ${p.sku}`} onClick={() => setQty(p.id, qty + 1)}>+</button>
                    {short && <small className="err-msg">เกินสต็อก ({p.stock})</small>}
                  </span>
                ) : <span className="pp-qty-ph" />}
              </li>
            );
          })}
          {!list.length && <li className="pp-none">ไม่พบสินค้า “{q}”{cat ? ` ในหมวด ${cat}` : ""} — ปิดหน้าต่างนี้แล้วพิมพ์ชื่อรายการเองได้</li>}
        </ul>
        <div className="pp-foot">
          <span>{list.length >= 200 ? "แสดง 200 รายการแรก — พิมพ์ค้นหาเพื่อจำกัดผล" : `${list.length} รายการ`} · เลือกแล้ว <b>{sel.size}</b> รายการ{sel.size ? ` · ประมาณ ฿${money(total)}` : ""}</span>
          <span className="spacer" />
          {sel.size > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel(new Map())}>ล้างที่เลือก</button>}
          <button type="button" className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" disabled={!sel.size} onClick={add}>เพิ่ม {sel.size || ""} รายการ</button>
        </div>
      </div>
    </div>
  );
}
