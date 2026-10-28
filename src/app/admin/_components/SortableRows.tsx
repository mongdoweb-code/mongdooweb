"use client";
// ลากวางเรียงแถวตาราง (เมาส์ / นิ้วบนจอสัมผัส / คีย์บอร์ด ↑ ↓ ที่ปุ่มจับ) แล้วบันทึกทันที
// แถว = <tr data-id> ที่เซิร์ฟเวอร์เรนเดอร์มา (ส่งเป็น children) · ปุ่มจับ = องค์ประกอบที่มี data-drag-handle
// groups (ถ้ามี) = กลุ่มของแต่ละแถว เช่น ปักหมุด/ไม่ปักหมุด — ลากข้ามกลุ่มไม่ได้
import { Children, isValidElement, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok?: string; error?: string };

export function SortableRows({
  ids,
  groups,
  action,
  start = 1,
  children,
}: {
  ids: string[];
  groups?: string[];
  action: (ids: string[]) => Promise<Result>;
  /** เลขลำดับของแถวแรก (หน้า 2 ขึ้นไปเริ่มต่อจากหน้าก่อน) */
  start?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(ids);
  const [synced, setSynced] = useState(ids);
  const [dragId, setDragId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Result>({});
  const [pending, startTransition] = useTransition();
  const body = useRef<HTMLTableSectionElement>(null);
  const live = useRef(order);
  useEffect(() => {
    live.current = order;
  }, [order]);

  // ข้อมูลใหม่จากเซิร์ฟเวอร์ (เปลี่ยนหน้า/ตัวกรอง/หลังบันทึก) → ใช้ลำดับนั้น
  if (synced.join() !== ids.join()) {
    setSynced(ids);
    setOrder(ids);
  }

  const groupOf = useCallback((id: string) => (groups ? groups[ids.indexOf(id)] : ""), [groups, ids]);

  const save = useCallback(
    (next: string[]) => {
      if (next.join() === ids.join()) return;
      startTransition(async () => {
        const r = await action(next);
        setMsg(r);
        if (r.error) setOrder(ids);
        router.refresh();
      });
    },
    [action, ids, router],
  );

  /** ย้าย id ไปตำแหน่ง to (จำกัดอยู่ในกลุ่มเดียวกัน) */
  const moveTo = useCallback(
    (list: string[], id: string, to: number) => {
      const g = groupOf(id);
      const same = list.map((x, i) => (groupOf(x) === g ? i : -1)).filter((i) => i >= 0);
      const lo = Math.min(...same);
      const hi = Math.max(...same);
      const t = Math.max(lo, Math.min(hi, to));
      const from = list.indexOf(id);
      if (t === from) return list;
      const next = list.filter((x) => x !== id);
      next.splice(t, 0, id);
      return next;
    },
    [groupOf],
  );

  // ลากด้วย pointer events (ใช้ได้ทั้งเมาส์และจอสัมผัส)
  const onPointerDown = (e: React.PointerEvent<HTMLTableSectionElement>) => {
    const handle = (e.target as Element).closest("[data-drag-handle]");
    const row = handle?.closest<HTMLTableRowElement>("tr[data-id]");
    if (!handle || !row || pending || e.button !== 0) return;
    e.preventDefault();
    const id = row.dataset.id!;
    const before = live.current;
    setDragId(id);
    setMsg({});
    row.classList.add("drag-row");
    document.body.classList.add("is-dragging");
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      const y = ev.clientY;
      if (y < 70) window.scrollBy(0, -14);
      else if (y > window.innerHeight - 70) window.scrollBy(0, 14);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rows = [...(body.current?.querySelectorAll<HTMLTableRowElement>("tr[data-id]") ?? [])];
        // ตำแหน่งใหม่ = จำนวนแถวอื่นที่จุดกึ่งกลางอยู่เหนือเมาส์
        let to = 0;
        for (const r of rows) {
          if (r.dataset.id === id) continue;
          const b = r.getBoundingClientRect();
          if (b.top + b.height / 2 < y) to++;
        }
        const next = moveTo(live.current, id, to);
        if (next !== live.current) {
          live.current = next;
          setOrder(next);
        }
      });
    };
    const onUp = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("is-dragging");
      row.classList.remove("drag-row");
      setDragId(null);
      if (live.current.join() !== before.join()) save(live.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // คีย์บอร์ด: โฟกัสปุ่มจับแล้วกด ↑ ↓ (Home/End = บนสุด/ล่างสุดของหน้านี้)
  const onKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    const handle = (e.target as Element).closest("[data-drag-handle]");
    const id = handle?.closest<HTMLTableRowElement>("tr[data-id]")?.dataset.id;
    if (!id || pending) return;
    const i = live.current.indexOf(id);
    const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? live.current.length - 1 : null;
    if (to == null) return;
    e.preventDefault();
    const next = moveTo(live.current, id, to);
    if (next === live.current) return;
    live.current = next;
    setOrder(next);
    save(next);
  };

  useEffect(() => () => document.body.classList.remove("is-dragging"), []);

  const byId = new Map<string, React.ReactNode>();
  Children.forEach(children, (c) => {
    if (isValidElement(c) && c.key != null) byId.set(String(c.key), c);
  });

  return (
    <>
      <tbody
        ref={body}
        className={`sortable${dragId ? " dragging" : ""}${pending ? " saving" : ""}`}
        style={{ counterReset: `pos ${start - 1}` }}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        data-drag={dragId ?? undefined}
      >
        {order.map((id) => byId.get(id))}
      </tbody>
      <caption className="sort-toast" aria-live="polite">
        {pending ? <span className="sort-msg">กำลังบันทึกลำดับ…</span> : msg.error ? <span className="sort-msg err">{msg.error}</span> : msg.ok ? <span className="sort-msg ok">✓ {msg.ok}</span> : null}
      </caption>
    </>
  );
}
