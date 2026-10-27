"use client";
// แถบเครื่องมือด้านบนของหลังบ้าน: ค้นหาทั้งระบบ (Ctrl+K หรือ /) + กระดิ่งแจ้งเตือน (ตัวเลขยังไม่อ่าน อัปเดตทุก 60 วินาที)
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { markAllReadAction } from "../(app)/notifications/actions";

type Hit = { group: string; title: string; detail: string; href: string };
type Notif = { id: string; kind: string; title: string; detail: string; at: string; href: string; unread: boolean };

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const term = q.trim();
    const my = ++seq.current;
    if (term.length < 2) return;
    // หน่วง 200 ms หลังพิมพ์ (debounce) และทิ้งคำตอบเก่าที่มาช้ากว่าคำตอบใหม่
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/admin/global-search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = r.ok ? ((await r.json()) as { hits: Hit[] }) : { hits: [] };
        if (my === seq.current) { setHits(j.hits); setSel(0); }
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const list = q.trim().length < 2 ? [] : hits;
  const go = (h: Hit | undefined) => {
    if (!h) return;
    onClose();
    router.push(h.href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(list[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  useEffect(() => {
    document.getElementById(`gs-opt-${sel}`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return (
    <div className="gs-wrap" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gs-dlg" role="dialog" aria-modal="true" aria-label="ค้นหาทั้งระบบ">
        <div className="gs-in">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={input} id="gsInput" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoComplete="off" spellCheck={false}
            placeholder="ค้นหาเลขคำสั่งซื้อ เบอร์โทร ชื่อลูกค้า เลขเอกสาร รหัสสินค้า…" aria-label="คำค้น"
            role="combobox" aria-expanded={list.length > 0} aria-controls="gsList" aria-activedescendant={list.length ? `gs-opt-${sel}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="gs-res" id="gsList" role="listbox" aria-label="ผลการค้นหา">
          {list.map((h, i) => {
            const head = i === 0 || list[i - 1].group !== h.group ? h.group : null;
            return (
              <div key={`${h.href}-${i}`}>
                {head && <div className="gs-grp" role="presentation">{head}</div>}
                <a
                  id={`gs-opt-${i}`} role="option" aria-selected={i === sel} href={h.href} className={i === sel ? "on" : ""}
                  onMouseMove={() => setSel(i)} onClick={(e) => { e.preventDefault(); go(h); }}
                >
                  <b>{h.title}</b><small>{h.detail}</small>
                </a>
              </div>
            );
          })}
          {q.trim().length >= 2 && !busy && !list.length && <p className="gs-empty">ไม่พบรายการที่ตรงกับ “{q.trim()}”</p>}
          {q.trim().length < 2 && <p className="gs-empty">พิมพ์อย่างน้อย 2 ตัวอักษร · ↑↓ เลือก · Enter เปิด</p>}
          {busy && <p className="gs-empty" aria-live="polite">กำลังค้นหา…</p>}
        </div>
      </div>
    </div>
  );
}

function Bell() {
  const path = usePathname();
  const [unread, setUnread] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/admin/notifications/count", { cache: "no-store" });
      if (r.ok) setUnread(((await r.json()) as { unread: number }).unread);
    } catch {
      /* ออฟไลน์ชั่วคราว — ลองใหม่รอบหน้า */
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- เรียกครั้งแรกทันที แล้วทุก 60 วินาทีเมื่อหน้าแสดงอยู่
    void poll();
    const t = setInterval(() => { if (document.visibilityState === "visible") void poll(); }, 60_000);
    const vis = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [poll, path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const r = await fetch("/admin/notifications/feed", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { items: Notif[]; unread: number };
        setItems(j.items);
        setUnread(j.unread);
      }
    }
  };
  const readAll = async () => {
    await markAllReadAction();
    setUnread(0);
    setItems((l) => l?.map((x) => ({ ...x, unread: false })) ?? null);
  };
  const n = unread ?? 0;
  return (
    <div className="bell" ref={box}>
      <button type="button" className="bell-btn" id="bellBtn" onClick={toggle} aria-expanded={open} aria-haspopup="true" aria-label={n ? `การแจ้งเตือน ยังไม่อ่าน ${n} รายการ` : "การแจ้งเตือน"}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        {n > 0 && <span className="bell-n" id="bellCount">{n > 99 ? "99+" : n}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="region" aria-label="การแจ้งเตือนล่าสุด">
          <div className="bell-h">
            <b>การแจ้งเตือน</b>
            <button type="button" className="link" onClick={readAll} disabled={!n} id="bellReadAll">อ่านแล้วทั้งหมด</button>
          </div>
          {items === null ? <p className="gs-empty">กำลังโหลด…</p> : items.length ? (
            <ul>
              {items.map((it) => (
                <li key={it.id} className={it.unread ? "unread" : ""}>
                  <Link href={it.href} onClick={() => setOpen(false)}><b>{it.title}</b><small>{it.detail}</small></Link>
                </li>
              ))}
            </ul>
          ) : <p className="gs-empty">ยังไม่มีการแจ้งเตือน</p>}
          <Link className="bell-all" href="/admin/notifications" onClick={() => setOpen(false)}>ดูทั้งหมด →</Link>
        </div>
      )}
    </div>
  );
}

export function TopTools() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); }
      else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) { e.preventDefault(); setOpen(true); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="gtools">
      <button type="button" className="gs-btn" id="gsOpen" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span>ค้นหาทั้งระบบ…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <Bell />
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
