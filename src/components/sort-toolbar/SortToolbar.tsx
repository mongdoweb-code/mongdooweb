"use client";
// แถบเรียงสินค้า (ใช้ร่วมกันทั้งหน้าร้านและหลังบ้าน): เรียงตาม ▾ · สลับทิศ ↑↓ · จำนวนต่อหน้า · มุมมอง
// ลิงก์ทุกปุ่มคำนวณที่ server (คงตัวกรองอื่นใน URL) — ส่วนนี้ดูแลแค่เมนูเปิด/ปิด และการจำมุมมองไว้ในคุกกี้
// มุมมอง: mode "attr" = เปลี่ยน data-view ของรายการทันที (หน้าร้าน) · "refresh" = ให้ server วาดใหม่ (หลังบ้าน: ตาราง ↔ การ์ด)
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import "./sort-toolbar.css";

export type ViewIcon = "g2" | "g3" | "g4" | "list" | "table" | "cards" | "small";
export type SortToolbarProps = {
  sort: { label: string; options: { value: string; label: string; href: string; on: boolean }[] };
  /** null = ซ่อนปุ่ม · disabled = แสดงจางพร้อมเหตุผล */
  dir: { desc: boolean; href: string | null; disabled?: string } | null;
  per: { label?: string; options: { n: number; href: string; on: boolean }[] };
  views: {
    value: string;
    cookie: string;
    mode: "attr" | "refresh";
    /** selector ของรายการที่จะเปลี่ยน data-view (mode "attr") */
    target?: string;
    options: { value: string; label: string; icon: ViewIcon; desktopOnly?: boolean }[];
  };
};

const ICON: Record<ViewIcon, React.ReactNode> = {
  g2: <><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></>,
  g3: <>{[4, 10, 16].flatMap((y) => [4, 10, 16].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" />))}</>,
  g4: <>{[4, 8.5, 13, 17.5].flatMap((y) => [4, 8.5, 13, 17.5].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="2.6" height="2.6" />))}</>,
  list: <><rect x="4" y="5" width="3" height="3" /><rect x="4" y="10.5" width="3" height="3" /><rect x="4" y="16" width="3" height="3" /><path d="M10 6.5h10M10 12h10M10 17.5h10" fill="none" stroke="currentColor" strokeWidth="1.8" /></>,
  table: <path d="M4 5h16v14H4zM4 10h16M4 14.5h16M9.5 5v14" fill="none" stroke="currentColor" strokeWidth="1.7" />,
  cards: <><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></>,
  small: <>{[4, 10, 16].flatMap((y) => [4, 10, 16].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" />))}</>,
};

export function SortToolbar({ sort, dir, per, views }: SortToolbarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(views.value);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = sort.options.find((o) => o.on) ?? sort.options[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btn.current?.focus(); }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    // โฟกัสตัวที่เลือกอยู่เมื่อเปิดเมนู
    box.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [open]);

  // ลูกศรขึ้น/ลง เลื่อนในเมนู
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[n]?.focus();
  };

  const pickView = (v: string) => {
    setView(v);
    saveCookie(views.cookie, v);
    if (views.mode === "attr" && views.target) document.querySelectorAll<HTMLElement>(views.target).forEach((el) => (el.dataset.view = v));
    else router.refresh();
  };

  return (
    <div className="stb" role="group" aria-label="การแสดงผลรายการ">
      <div className="stb-sort" ref={box}>
        <button
          ref={btn}
          type="button"
          className="stb-sel"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((x) => !x)}
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}
        >
          <span className="stb-k">{sort.label}</span>
          <b className="stb-v">{current?.label}</b>
          <span className="stb-chev" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d={open ? "m7 14 5-5 5 5" : "m7 10 5 5 5-5"} /></svg>
          </span>
        </button>
        {open && (
          <div className="stb-menu" id={menuId} role="menu" aria-label={sort.label} onKeyDown={onMenuKey}>
            {sort.options.map((o) => (
              <a key={o.value || "default"} role="menuitemradio" aria-checked={o.on} className={o.on ? "on" : ""} href={o.href} rel="nofollow">
                <span className="stb-k">{sort.label}</span> <b className="stb-v">{o.label}</b>
              </a>
            ))}
          </div>
        )}
      </div>

      {dir &&
        (dir.href && !dir.disabled ? (
          <a className="stb-btn stb-dir" href={dir.href} rel="nofollow" data-dir={dir.desc ? "desc" : "asc"} aria-label={dir.desc ? "เรียงจากมากไปน้อย — กดเพื่อสลับเป็นน้อยไปมาก" : "เรียงจากน้อยไปมาก — กดเพื่อสลับเป็นมากไปน้อย"} title={dir.desc ? "มาก → น้อย" : "น้อย → มาก"}>
            <DirIcon desc={dir.desc} />
          </a>
        ) : (
          <span className="stb-btn stb-dir stb-off" title={dir.disabled}>
            <DirIcon desc={dir.desc} />
            <span className="sr-only">สลับทิศทางการเรียง (ใช้ไม่ได้: {dir.disabled})</span>
          </span>
        ))}

      <div className="stb-seg stb-per" role="group" aria-label={per.label ?? "จำนวนต่อหน้า"}>
        {per.options.map((o) => (
          <a key={o.n} className={o.on ? "on" : ""} href={o.href} rel="nofollow" aria-current={o.on ? "true" : undefined} aria-label={`แสดง ${o.n} รายการต่อหน้า`}>
            {o.n}
          </a>
        ))}
      </div>

      <div className="stb-seg stb-view" role="group" aria-label="มุมมอง">
        {views.options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`${o.value === view ? "on" : ""}${o.desktopOnly ? " stb-desk" : ""}`}
            aria-pressed={o.value === view}
            aria-label={`มุมมอง${o.label}`}
            title={o.label}
            data-view-btn={o.value}
            onClick={() => o.value !== view && pickView(o.value)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[o.icon]}</svg>
          </button>
        ))}
      </div>
    </div>
  );
}

/** จำมุมมองไว้ 1 ปี (server อ่านคุกกี้นี้ตอนวาดหน้าครั้งถัดไป) */
function saveCookie(name: string, v: string) {
  try {
    document.cookie = `${name}=${encodeURIComponent(v)}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}

function DirIcon({ desc }: { desc: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {desc ? <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5" /> : <path d="M7 20V4M3.5 7.5 7 4l3.5 3.5" />}
      {desc ? <path d="M13 6h8M13 11h6M13 16h4" /> : <path d="M13 6h4M13 11h6M13 16h8" />}
    </svg>
  );
}
