"use client";
// แถบเรียงสินค้า (ใช้ร่วมกันหน้าร้าน + หลังบ้าน):
//   [เรียงตาม ▾]  [↓↑ ทิศทาง]  [12 | 24 | 36 ต่อหน้า]  [⊞ ▦ ▩ ☰ มุมมอง]
// - เรียงตาม / ทิศทาง / ต่อหน้า = ลิงก์ธรรมดา (อยู่ใน URL → แชร์ลิงก์ได้ กดย้อนกลับได้)
// - มุมมอง = จำไว้ในคุกกี้ (เซิร์ฟเวอร์เรนเดอร์ถูกแบบตั้งแต่แรก ไม่กระพริบ)
//   ถ้าส่ง target มา = เปลี่ยน data-view ของรายการทันทีโดยไม่โหลดหน้าใหม่ (หน้าร้าน: เปลี่ยนแค่ CSS)
//   ถ้าไม่ส่ง = โหลดข้อมูลหน้าใหม่ (หลังบ้าน: ตาราง ↔ การ์ด ใช้ markup คนละแบบ)
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import "./sort-toolbar.css";

export type ToolbarOption = { value: string; label: string; href: string };
export type ViewIcon = "grid2" | "grid3" | "grid4" | "grid6" | "list" | "table";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const sq = (cols: number, rows: number) => {
  const gap = 2;
  const w = (20 - gap * (cols - 1)) / cols;
  const h = (20 - gap * (rows - 1)) / rows;
  const out: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out.push(<rect key={`${r}-${c}`} x={2 + c * (w + gap)} y={2 + r * (h + gap)} width={w} height={h} rx={0.8} />);
  return out;
};
const VIEW_ICONS: Record<ViewIcon, React.ReactNode> = {
  grid2: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{sq(2, 2)}</svg>,
  grid3: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{sq(3, 3)}</svg>,
  grid4: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{sq(4, 4)}</svg>,
  grid6: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{sq(5, 5)}</svg>,
  list: (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true">
      <path d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="4" cy="6" r="1.4" fill="currentColor" />
      <circle cx="4" cy="12" r="1.4" fill="currentColor" />
      <circle cx="4" cy="18" r="1.4" fill="currentColor" />
    </svg>
  ),
  table: (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 9h18M3 14.5h18M9 9v11" />
    </svg>
  ),
};

/** จำมุมมองไว้ 1 ปี (เซิร์ฟเวอร์อ่านค่าตอนเรนเดอร์ครั้งถัดไป) */
function saveCookie(name: string, value: string, path: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=${path}; max-age=31536000; samesite=lax`;
}

/** ไอคอนทิศทาง: ลูกศร + ขีดยาว→สั้น (มาก→น้อย) หรือ สั้น→ยาว (น้อย→มาก) */
function DirIcon({ desc }: { desc: boolean }) {
  return (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true">
      {desc ? <path d="M6 4v16m0 0-3-3m3 3 3-3" /> : <path d="M6 20V4m0 0L3 7m3-3 3 3" />}
      <path d={desc ? "M12 6h9M12 12h6M12 18h3" : "M12 6h3M12 12h6M12 18h9"} />
    </svg>
  );
}

function Nav({ spa, href, className, children, ...rest }: { spa?: boolean; href: string; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return spa ? (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  );
}

/** เมนูเรียงตาม: ปุ่ม "เรียงตาม ค่าที่เลือก ▾" + รายการลิงก์ (↑↓ เลื่อน, Esc ปิด, คลิกนอกเมนูปิด) */
function SortMenu({ label, value, options, spa }: { label: string; value: string; options: ToolbarOption[]; spa?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const cur = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    // โฟกัสตัวที่เลือกอยู่ เพื่อกด ↑↓ ต่อได้ทันที
    box.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>(".stb-opt") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const n = e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
      items[n]?.focus();
    } else if (e.key === "Tab" && open) setOpen(false);
  };

  return (
    <div className="stb-sort" ref={box} onKeyDown={onKey}>
      <button ref={btn} type="button" className="stb-sort-btn" aria-haspopup="true" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="stb-sort-lbl">{label}</span> <b>{cur?.label}</b>
        <svg className="stb-caret" viewBox="0 0 24 24" {...P} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <ul id={id} className="stb-menu" hidden={!open}>
        {options.map((o) => (
          <li key={o.value}>
            <Nav spa={spa} href={o.href} className="stb-opt" aria-current={o.value === value ? "true" : undefined} rel="nofollow" onClick={() => setOpen(false)}>
              <span className="stb-sort-lbl">{label}</span> <b>{o.label}</b>
            </Nav>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SortToolbar({
  label = "เรียงตาม",
  sort,
  dir,
  per,
  view,
  spa,
  className,
}: {
  label?: string;
  sort: { value: string; options: ToolbarOption[] };
  /** ปุ่มสลับทิศทาง — disabled = การเรียงนี้ไม่มีทิศ (เช่น "แนะนำ") */
  dir?: { desc: boolean; href: string; title: string; disabled?: boolean };
  per?: { value: number; options: { n: number; href: string }[]; label?: string };
  view?: {
    value: string;
    options: { value: string; label: string; icon: ViewIcon; /** ซ่อนบนจอเล็ก */ wideOnly?: boolean }[];
    cookie: string;
    cookiePath?: string;
    /** selector ของรายการที่จะเปลี่ยน data-view ทันที (ไม่ส่ง = โหลดหน้าใหม่) */
    target?: string;
  };
  /** true = ใช้ next/link (หลังบ้าน) · false = ลิงก์ธรรมดา (หน้าร้าน: สคริปต์ของหน้าต้องโหลดใหม่) */
  spa?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [cur, setCur] = useState(view?.value ?? "");
  const [pending, start] = useTransition();
  // ค่าจากเซิร์ฟเวอร์เปลี่ยน (เช่น เปิดอีกแท็บ) → ตามค่านั้น
  const [synced, setSynced] = useState(view?.value);
  if (view && synced !== view.value) {
    setSynced(view.value);
    setCur(view.value);
  }

  const pickView = (v: string) => {
    if (!view || v === cur) return;
    setCur(v);
    saveCookie(view.cookie, v, view.cookiePath ?? "/");
    if (view.target) document.querySelectorAll<HTMLElement>(view.target).forEach((el) => (el.dataset.view = v));
    else start(() => router.refresh());
  };

  return (
    <div className={`stb${className ? ` ${className}` : ""}${pending ? " stb-busy" : ""}`}>
      <SortMenu label={label} value={sort.value} options={sort.options} spa={spa} />
      {dir &&
        (dir.disabled ? (
          <span className="stb-btn stb-dir" aria-disabled="true" title={dir.title}>
            <DirIcon desc={dir.desc} />
          </span>
        ) : (
          <Nav spa={spa} href={dir.href} className="stb-btn stb-dir" rel="nofollow" aria-label={dir.title} title={dir.title}>
            <DirIcon desc={dir.desc} />
          </Nav>
        ))}
      {per && (
        <div className="stb-seg stb-per" role="group" aria-label={per.label ?? "จำนวนต่อหน้า"}>
          {per.options.map((o) => (
            <Nav
              key={o.n}
              spa={spa}
              href={o.href}
              className="stb-btn"
              rel="nofollow"
              aria-current={o.n === per.value ? "true" : undefined}
              aria-label={`แสดง ${o.n} รายการต่อหน้า`}
              title={`แสดง ${o.n} รายการต่อหน้า`}
            >
              {o.n}
            </Nav>
          ))}
        </div>
      )}
      {view && (
        <div className="stb-seg stb-views" role="group" aria-label="มุมมอง">
          {view.options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`stb-btn${o.wideOnly ? " stb-wide" : ""}`}
              aria-pressed={o.value === cur}
              aria-label={o.label}
             
              title={o.label}
              disabled={pending}
              onClick={() => pickView(o.value)}
            >
              {VIEW_ICONS[o.icon]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
