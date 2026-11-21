"use client";
// กระดานจัดเรียงสินค้าหน้าร้าน: 3 มุมมอง (ตาราง / การ์ด / การ์ดเล็ก) · ลากวาง (เมาส์ทั้งการ์ด · จอสัมผัสที่ปุ่มจับ ⠿ · คีย์บอร์ดลูกศรที่ปุ่มจับ)
// · พิมพ์เลขลำดับ · ★ ปักหมุด · ⤒ บนสุด · ⤓ ล่างสุด · เลือกหลายชิ้น · เรียงอัตโนมัติ · ย้อนกลับ · เส้นแบ่งหน้าแบบหน้าร้าน
// ยังไม่บันทึกจนกด "บันทึกลำดับ" (ครั้งเดียวทั้งร้าน) · คืนลำดับก่อนหน้าได้
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AUTO_SORTS, BOARD_PER, BOARD_PER_DEFAULT, BOARD_VIEWS, autoSort, boardPayload, dropIndex, moveEdge, moveIds, movedIds, setPinned,
  type AutoSortKey, type BoardView,
} from "@/lib/order-board";
import { notifySave } from "../../../_components/save-notify";
import { restoreBoard, saveBoard } from "./actions";

export type BoardProduct = {
  id: string; sku: string; name: string; slug: string; img: string; pinned: boolean; price: number; sold: number; created: number;
  cat: string; catOrder: number; hidden: string; out: boolean;
  group: { id: string; name: string; primary: boolean; hasPrimary: boolean } | null;
};

const VIEW_KEY = "mdw_order_view";
const PER_KEY = "mdw_order_per";
const baht = (s: number) => `฿${(s / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const readLS = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

type Drag = { ids: string[]; over: string | null; after: boolean; x: number; y: number };

const ICONS: Record<BoardView, React.ReactNode> = {
  table: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>,
  card: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>,
  small: <svg viewBox="0 0 24 24" aria-hidden="true">{[4, 10, 16].flatMap((y) => [4, 10, 16].map((x) => <rect key={`${x}${y}`} x={x} y={y} width="4" height="4" rx="1" />))}</svg>,
};

export function OrderBoard({ products, lastSaved }: { products: BoardProduct[]; lastSaved: string | null }) {
  const router = useRouter();
  const [items, setItems] = useState(products);
  const [orig, setOrig] = useState(products);
  const [history, setHistory] = useState<BoardProduct[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [onlyMatch, setOnlyMatch] = useState(false);
  const [per, setPer] = useState<number>(BOARD_PER_DEFAULT);
  const [view, setView] = useState<BoardView>("card");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [toast, setToast] = useState("");
  const [stale, setStale] = useState(false);
  const [pending, start] = useTransition();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const boardRef = useRef<HTMLDivElement>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);

  // มุมมอง/จำนวนต่อหน้า จำไว้ในเบราว์เซอร์นี้
  useEffect(() => {
    const v = readLS(VIEW_KEY), p = Number(readLS(PER_KEY));
    if (v in BOARD_VIEWS) setView(v as BoardView);
    if ((BOARD_PER as readonly number[]).includes(p)) setPer(p);
  }, []);

  const moved = useMemo(() => movedIds(orig, items), [orig, items]);
  const dirty = moved.size > 0;

  // ข้อมูลจากเซิร์ฟเวอร์เปลี่ยน (หลังคืนลำดับ / โหลดใหม่) และยังไม่ได้แก้ค้าง → ใช้ลำดับใหม่
  useEffect(() => {
    if (dirty) return;
    setItems(products);
    setOrig(products);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // ออกจากหน้าโดยยังไม่บันทึก → เตือน
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const say = (t: string) => {
    setToast(t);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(""), 2200);
  };
  const apply = useCallback((next: BoardProduct[], msg?: string) => {
    const cur = itemsRef.current;
    if (next === cur || next.map((x) => x.id + x.pinned).join() === cur.map((x) => x.id + x.pinned).join()) return;
    setHistory((h) => [...h.slice(-49), cur]);
    setItems(next);
    if (msg) say(msg);
  }, []);

  // สินค้าที่แสดงจริงบนหน้าร้านของกลุ่มรุ่น (รุ่นหลัก หรือรุ่นแรกที่เปิดขายตามลำดับ) — รุ่นอื่นรวมอยู่ในการ์ดนั้น
  const groupShown = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of items) if (p.group && !p.hidden && p.group.primary) m.set(p.group.id, p.id);
    for (const p of items) if (p.group && !p.hidden && !m.has(p.group.id)) m.set(p.group.id, p.id);
    return m;
  }, [items]);

  const cats = useMemo(() => [...new Map(products.map((p) => [p.cat, p.catOrder])).entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c), [products]);
  const ql = q.trim().toLowerCase();
  const matches = (p: BoardProduct) => (!ql || p.name.toLowerCase().includes(ql) || p.sku.toLowerCase().includes(ql)) && (!cat || p.cat === cat);
  const filtering = !!ql || !!cat;
  const pinnedCount = items.filter((x) => x.pinned).length;

  const orderedSel = (ids?: Set<string>) => items.filter((x) => (ids ?? selected).has(x.id)).map((x) => x.id);
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const moveTo = (id: string, pos: number) => {
    const x = items.find((y) => y.id === id)!;
    const ids = selected.has(id) ? orderedSel() : [id];
    const next = moveIds(items, ids, pos - 1);
    const at = next.findIndex((y) => y.id === id) + 1;
    apply(next, !x.pinned && pos <= pinnedCount ? `สินค้าที่ปักหมุดอยู่บนสุดเสมอ — ไปอยู่ลำดับที่ ${at}` : `ย้ายไปลำดับที่ ${at}`);
  };
  const edge = (ids: string[], e: "top" | "bottom") => apply(moveEdge(items, ids, e), e === "top" ? "ย้ายไปบนสุดแล้ว" : "ย้ายไปล่างสุดแล้ว");
  const pin = (ids: string[], on: boolean) => apply(setPinned(items, ids, on), on ? "ปักหมุดแล้ว — อยู่บนสุดเสมอ" : "เลิกปักหมุดแล้ว");

  // ---------- ลากวาง (Pointer Events: เมาส์ + นิ้ว + ปากกา) ----------
  const dragRef = useRef<Drag | null>(null);
  const startRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const scrollRaf = useRef(0);
  const findTarget = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-ob-id]");
    if (!el || !boardRef.current?.contains(el)) return null;
    const r = el.getBoundingClientRect();
    const after = view === "table" ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
    return { id: el.dataset.obId!, after };
  };
  const stopScroll = () => cancelAnimationFrame(scrollRaf.current);
  const autoScroll = (y: number) => {
    stopScroll();
    const edgeY = 90;
    const v = y < edgeY ? -Math.ceil((edgeY - y) / 6) : y > window.innerHeight - edgeY ? Math.ceil((y - (window.innerHeight - edgeY)) / 6) : 0;
    if (!v) return;
    const step = () => { window.scrollBy(0, v); scrollRaf.current = requestAnimationFrame(step); };
    scrollRaf.current = requestAnimationFrame(step);
  };
  const onMove = useCallback((e: PointerEvent) => {
    const s = startRef.current;
    if (!s) return;
    if (!dragRef.current) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
      const ids = selectedRef.current.has(s.id) ? itemsRef.current.filter((x) => selectedRef.current.has(x.id)).map((x) => x.id) : [s.id];
      dragRef.current = { ids, over: null, after: false, x: e.clientX, y: e.clientY };
      document.body.classList.add("ob-dragging");
    }
    const t = findTarget(e.clientX, e.clientY);
    const d = { ...dragRef.current, x: e.clientX, y: e.clientY, over: t && !dragRef.current.ids.includes(t.id) ? t.id : null, after: t?.after ?? false };
    dragRef.current = d;
    setDrag(d);
    autoScroll(e.clientY);
    e.preventDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const onUp = useCallback(() => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    stopScroll();
    document.body.classList.remove("ob-dragging");
    const d = dragRef.current;
    dragRef.current = null;
    startRef.current = null;
    setDrag(null);
    if (d?.over) {
      const cur = itemsRef.current;
      apply(moveIds(cur, d.ids, dropIndex(cur, d.ids, d.over, d.after)), d.ids.length > 1 ? `ย้าย ${d.ids.length} ชิ้นแล้ว` : "ย้ายแล้ว");
    }
  }, [onMove, apply]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    const onHandle = !!t.closest("[data-drag-handle]");
    // นิ้ว/ปากกา: ลากที่ปุ่มจับเท่านั้น (เลื่อนหน้าจอได้ตามปกติ) · เมาส์: ลากได้ทั้งการ์ด ยกเว้นช่องกรอก/ปุ่ม
    if (!onHandle && (e.pointerType !== "mouse" || t.closest("input,button,a,label,select,textarea"))) return;
    if (onHandle) e.preventDefault();
    startRef.current = { id, x: e.clientX, y: e.clientY };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  useEffect(() => () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); stopScroll(); }, [onMove, onUp]);

  // คีย์บอร์ดที่ปุ่มจับ: ↑/← ขึ้น 1 · ↓/→ ลง 1 · Home บนสุด · End ล่างสุด · Space เลือก
  const onHandleKey = (e: React.KeyboardEvent, id: string) => {
    const i = items.findIndex((x) => x.id === id);
    let next: BoardProduct[] | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = moveIds(items, [id], i - 1);
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") next = moveIds(items, [id], i + 1);
    else if (e.key === "Home") next = moveEdge(items, [id], "top");
    else if (e.key === "End") next = moveEdge(items, [id], "bottom");
    else if (e.key === " ") { e.preventDefault(); toggleSel(id); return; }
    if (!next) return;
    e.preventDefault();
    apply(next);
    const at = next.findIndex((x) => x.id === id) + 1;
    say(`ลำดับที่ ${at}`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-ob-id="${id}"] [data-drag-handle]`)?.focus());
  };

  // ---------- บันทึก / คืนค่า ----------
  const save = () => start(async () => {
    const { ids, pinned } = boardPayload(items);
    const r = await saveBoard(ids, pinned);
    notifySave(r.error ? { ok: false, title: "บันทึกลำดับไม่สำเร็จ", message: r.error } : { ok: true, title: "บันทึกลำดับสำเร็จ", message: r.ok, viewHref: "/products", viewLabel: "ดูหน้าร้าน" });
    if (r.stale) setStale(true);
    if (r.ok) {
      setOrig(items);
      setHistory([]);
      router.refresh();
    }
  });
  const restore = () => {
    if (!confirm(dirty ? "ทิ้งการจัดเรียงที่ยังไม่บันทึก แล้วคืนลำดับก่อนการบันทึกครั้งล่าสุด?" : "คืนลำดับก่อนการบันทึกครั้งล่าสุด? (กดอีกครั้งเพื่อสลับกลับได้)")) return;
    start(async () => {
      const r = await restoreBoard();
      notifySave(r.error ? { ok: false, title: "คืนลำดับไม่สำเร็จ", message: r.error } : { ok: true, title: "คืนลำดับก่อนหน้าแล้ว", message: r.ok });
      if (r.ok) {
        setHistory([]);
        // ให้ useEffect รับลำดับใหม่จากเซิร์ฟเวอร์
        setOrig(itemsRef.current);
        router.refresh();
      }
    });
  };
  const discard = () => {
    if (!confirm("ทิ้งการจัดเรียงที่ยังไม่บันทึก?")) return;
    setItems(orig);
    setHistory([]);
  };

  // ---------- แสดงผล ----------
  const selIds = orderedSel();
  const ghostName = drag ? items.find((x) => x.id === drag.ids[0])?.name : "";
  const status = (p: BoardProduct) => {
    const tags: React.ReactNode[] = [];
    if (p.pinned) tags.push(<span key="pin" className="ob-tag t-pin">★ ปักหมุด</span>);
    if (p.hidden) tags.push(<span key="hid" className="ob-tag t-off">ไม่แสดง · {p.hidden}</span>);
    else if (p.group && groupShown.get(p.group.id) !== p.id) tags.push(<span key="var" className="ob-tag t-var" title={`รวมอยู่ในการ์ดของรุ่นหลัก “${p.group.name}” บนหน้าร้าน`}>รุ่นย่อย</span>);
    if (p.out) tags.push(<span key="out" className="ob-tag t-out">หมด</span>);
    return tags;
  };
  const rowCls = (p: BoardProduct) =>
    [
      "ob-item",
      selected.has(p.id) && "is-sel",
      moved.has(p.id) && "is-moved",
      (p.hidden || (p.group && groupShown.get(p.group.id) !== p.id)) && "is-muted",
      filtering && !matches(p) && "is-dim",
      drag?.ids.includes(p.id) && "is-dragging",
      drag?.over === p.id && (drag.after ? "drop-after" : "drop-before"),
    ].filter(Boolean).join(" ");
  const posInput = (p: BoardProduct, i: number) => (
    <input
      key={`${p.id}:${i}`}
      className="ob-pos"
      type="text"
      inputMode="numeric"
      defaultValue={i + 1}
      aria-label={`ลำดับของ ${p.name} (พิมพ์เลขแล้วกด Enter เพื่อย้าย)`}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.currentTarget.value = String(i + 1); e.currentTarget.blur(); }
      }}
      onBlur={(e) => {
        const n = parseInt(e.currentTarget.value.replace(/\D/g, ""), 10);
        if (!n || n === i + 1) { e.currentTarget.value = String(i + 1); return; }
        moveTo(p.id, Math.min(n, items.length));
      }}
    />
  );
  const handle = (p: BoardProduct) => (
    <button type="button" className="ob-handle" data-drag-handle aria-label={`ลากเพื่อย้าย ${p.name} (หรือใช้ปุ่มลูกศร)`} title="ลากเพื่อย้าย · ปุ่มลูกศรเลื่อนทีละช่อง · Home/End บนสุด/ล่างสุด"
      onKeyDown={(e) => onHandleKey(e, p.id)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
    </button>
  );
  const acts = (p: BoardProduct) => (
    <span className="ob-acts">
      <button type="button" className={`ob-ib pin${p.pinned ? " on" : ""}`} aria-pressed={p.pinned} onClick={() => pin([p.id], !p.pinned)} aria-label={`${p.pinned ? "เลิกปักหมุด" : "ปักหมุด"} ${p.name}`} data-tip={p.pinned ? "เลิกปักหมุด" : "ปักหมุด (บนสุดเสมอ)"}>★</button>
      <button type="button" className="ob-ib" onClick={() => edge([p.id], "top")} aria-label={`ย้าย ${p.name} ไปบนสุด`} data-tip="บนสุด">⤒</button>
      <button type="button" className="ob-ib" onClick={() => edge([p.id], "bottom")} aria-label={`ย้าย ${p.name} ไปล่างสุด`} data-tip="ล่างสุด">⤓</button>
    </span>
  );
  const check = (p: BoardProduct) => (
    <input type="checkbox" className="ob-chk" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)} aria-label={`เลือก ${p.name}`} />
  );
  const img = (p: BoardProduct) => (
    // eslint-disable-next-line @next/next/no-img-element
    p.img ? <img src={p.img} alt="" loading="lazy" draggable={false} /> : <span className="ob-noimg">ไม่มีรูป</span>
  );
  const pageBreak = (i: number) => (i > 0 && i % per === 0 ? i / per + 1 : 0);
  const visible = onlyMatch && filtering ? items.filter(matches) : items;
  const indexOf = new Map(items.map((x, i) => [x.id, i]));

  return (
    <div className={`ob ob-v-${view}`}>
      <div className="ob-bar" role="toolbar" aria-label="เครื่องมือจัดเรียง">
        <label className="ob-search">
          <span className="sr-only">ค้นหาสินค้า</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัสสินค้า เพื่อหาแล้วย้าย" />
        </label>
        <select className="ob-sel" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="กรองตามหมวด">
          <option value="">ทุกหมวด</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {filtering && (
          <label className="ob-only"><input type="checkbox" checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} /> แสดงเฉพาะที่ตรง</label>
        )}
        <select className="ob-sel" value="" onChange={(e) => {
          const k = e.target.value as AutoSortKey;
          if (!k) return;
          apply(autoSort(items, k), `เรียงแบบ “${AUTO_SORTS[k]}” แล้ว (ชิ้นที่ปักหมุดอยู่บนสุดเหมือนเดิม) — ปรับต่อได้ ยังไม่บันทึก`);
        }} aria-label="เรียงอัตโนมัติทั้งร้าน">
          <option value="">เรียงอัตโนมัติทั้งร้าน…</option>
          {(Object.keys(AUTO_SORTS) as AutoSortKey[]).map((k) => <option key={k} value={k}>{AUTO_SORTS[k]}</option>)}
        </select>
        <select className="ob-sel" value={per} onChange={(e) => { setPer(Number(e.target.value)); writeLS(PER_KEY, e.target.value); }} aria-label="เส้นแบ่งหน้าตามจำนวนต่อหน้าของหน้าร้าน">
          {BOARD_PER.map((n) => <option key={n} value={n}>แบ่งหน้า {n} ชิ้น/หน้า{n === BOARD_PER_DEFAULT ? " (ค่าเริ่มต้นหน้าร้าน)" : ""}</option>)}
        </select>
        <span className="ob-spacer" />
        <span className="ob-views" role="radiogroup" aria-label="มุมมอง">
          {(Object.keys(BOARD_VIEWS) as BoardView[]).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "on" : ""} data-view={v}
              onClick={() => { setView(v); writeLS(VIEW_KEY, v); }} title={BOARD_VIEWS[v]}>
              {ICONS[v]}<span>{BOARD_VIEWS[v]}</span>
            </button>
          ))}
        </span>
        <button type="button" className="ob-pill" disabled={!history.length} onClick={() => { setItems(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); }} title="ย้อนการย้ายครั้งล่าสุด">↶ ย้อนกลับ</button>

        {selected.size > 0 && (
          <div className="ob-selbar" role="group" aria-label="จัดการชิ้นที่เลือก">
            <b>เลือก {selected.size} ชิ้น</b>
            <button type="button" className="ob-pill" onClick={() => edge(selIds, "top")}>⤒ ย้ายไปบนสุด</button>
            <button type="button" className="ob-pill" onClick={() => edge(selIds, "bottom")}>⤓ ย้ายไปล่างสุด</button>
            <button type="button" className="ob-pill" onClick={() => pin(selIds, true)}>★ ปักหมุด</button>
            <button type="button" className="ob-pill" onClick={() => pin(selIds, false)}>เลิกปักหมุด</button>
            <form className="ob-goto" onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(String(new FormData(e.currentTarget).get("to") ?? ""), 10);
              if (n >= 1) apply(moveIds(items, selIds, n - 1), `ย้าย ${selIds.length} ชิ้นไปลำดับที่ ${n} แล้ว`);
            }}>
              <label>ไปลำดับที่ <input name="to" inputMode="numeric" size={4} aria-label="ลำดับที่จะย้ายไป" /></label>
              <button type="submit" className="ob-pill">ย้าย</button>
            </form>
            {filtering && <button type="button" className="ob-pill" onClick={() => setSelected(new Set(items.filter(matches).map((x) => x.id)))}>เลือกทั้งหมดที่ตรง ({items.filter(matches).length})</button>}
            <button type="button" className="ob-pill ghost" onClick={() => setSelected(new Set())}>ยกเลิกเลือก</button>
          </div>
        )}
      </div>

      <div className="ob-legend">
        <span>ทั้งหมด <b>{items.length.toLocaleString("th-TH")}</b> ชิ้น · ปักหมุด {pinnedCount}</span>
        <span><i className="lg lg-break" /> เส้นประ = ขึ้นหน้าใหม่ของหน้าร้าน</span>
        <span><i className="lg lg-moved" /> ย้ายแล้ว ยังไม่บันทึก</span>
        <span><i className="lg lg-muted" /> ไม่แสดงบนหน้าร้าน / รุ่นย่อย</span>
        <span className="ob-tipline">ลากการ์ดเพื่อย้าย (มือถือ: ลากที่ ⠿) · พิมพ์เลขในช่องลำดับแล้ว Enter · ติ๊กหลายชิ้นแล้วลากพร้อมกันได้</span>
      </div>

      <div ref={boardRef} className="ob-board" aria-live="off">
        {view === "table" ? (
          <table className="tbl ob-tbl">
            <thead>
              <tr><th className="c-chk"><span className="sr-only">เลือก</span></th><th>ลำดับ</th><th><span className="sr-only">ลาก</span></th><th>สินค้า</th><th>หมวด</th><th className="r">ราคา</th><th className="r">ขายได้</th><th>สถานะ</th><th className="r">จัดการ</th></tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const i = indexOf.get(p.id)!;
                const br = !onlyMatch || !filtering ? pageBreak(i) : 0;
                return (
                  <Fragment key={p.id}>
                    {br > 0 && <tr className="ob-break"><td colSpan={9}><span>หน้า {br} ของหน้าร้าน · เริ่มลำดับที่ {i + 1}</span></td></tr>}
                    <tr className={rowCls(p)} data-ob-id={p.id} onPointerDown={(e) => onDown(e, p.id)}>
                      <td className="c-chk">{check(p)}</td>
                      <td>{posInput(p, i)}</td>
                      <td>{handle(p)}</td>
                      <td><span className="ob-prod"><span className="ob-thumb">{img(p)}</span><span><b>{p.name}</b><small>{p.sku}</small></span></span></td>
                      <td className="sub">{p.cat}</td>
                      <td className="r num">{baht(p.price)}</td>
                      <td className="r num">{p.sold.toLocaleString("th-TH")}</td>
                      <td><span className="ob-tags">{status(p)}</span></td>
                      <td className="r">{acts(p)}</td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <ol className="ob-grid">
            {visible.map((p) => {
              const i = indexOf.get(p.id)!;
              const br = !onlyMatch || !filtering ? pageBreak(i) : 0;
              return (
                <Fragment key={p.id}>
                  {br > 0 && <li className="ob-break" aria-hidden="true"><span>หน้า {br} ของหน้าร้าน · เริ่มลำดับที่ {i + 1}</span></li>}
                  <li className={rowCls(p)} data-ob-id={p.id} onPointerDown={(e) => onDown(e, p.id)}>
                    <div className="ob-top">{posInput(p, i)}{handle(p)}{check(p)}</div>
                    <div className="ob-img">{img(p)}<span className="ob-tags">{status(p)}</span></div>
                    {view === "card" && <div className="ob-cat">{p.cat}</div>}
                    <div className="ob-name" title={p.name}>{p.name}</div>
                    <div className="ob-foot">
                      <span className="ob-price num">{baht(p.price)}{view === "card" && p.sold > 0 && <small> · ขาย {p.sold}</small>}</span>
                      {acts(p)}
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ol>
        )}
        {!visible.length && <div className="empty"><b>ไม่พบสินค้าที่ตรงกับการค้นหา</b></div>}
      </div>

      {drag && drag.x > 0 && (
        <div className="ob-ghost" style={{ left: drag.x + 14, top: drag.y + 14 }} aria-hidden="true">
          {drag.ids.length > 1 ? `ย้าย ${drag.ids.length} ชิ้น` : ghostName}
        </div>
      )}
      {toast && <div className="ob-toast" role="status">{toast}</div>}

      <div className="ob-foot-bar">
        <button type="button" className="btn btn-ghost" disabled={pending || !lastSaved} onClick={restore} title={lastSaved ? `ลำดับก่อนการบันทึกเมื่อ ${lastSaved}` : "ยังไม่มีลำดับที่บันทึกไว้"}>คืนลำดับก่อนหน้า</button>
        <span className="ob-msg" role="status">
          {stale ? (
            <>มีสินค้าเพิ่ม/ลบระหว่างจัด · <button type="button" className="link" onClick={() => window.location.reload()}>โหลดหน้าใหม่</button></>
          ) : dirty ? (
            <>ย้ายแล้ว <b>{moved.size}</b> ชิ้น — ยังไม่บันทึก · <button type="button" className="link" onClick={discard}>ทิ้งการเปลี่ยนแปลง</button></>
          ) : (
            <>ลำดับตรงกับหน้าร้าน{lastSaved ? ` · บันทึกครั้งก่อน ${lastSaved}` : ""}</>
          )}
        </span>
        <span className="ob-spacer" />
        <button type="button" className="btn btn-primary" disabled={!dirty || pending} onClick={save} data-ob-save>
          {pending ? "กำลังบันทึก…" : dirty ? `บันทึกลำดับ (${moved.size})` : "บันทึกลำดับ"}
        </button>
      </div>
    </div>
  );
}
