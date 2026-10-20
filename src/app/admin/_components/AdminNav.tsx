"use client";
// เมนูด้านข้างหลังบ้าน — ไฮไลต์เมนูของหน้าปัจจุบัน
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number; group?: string; external?: boolean; ownerOnly?: boolean };

export function AdminNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  return (
    <nav>
      {items.map((it, i) => {
        const prevGroup = items.slice(0, i).reverse().find((x) => x.group)?.group;
        const head = it.group && it.group !== prevGroup ? (it.group === "—" ? <div key={`g-${it.href}`} className="nav-sep" role="separator" /> : <div key={`g-${it.href}`} className="nav-grp">{it.group}</div>) : null;
        const on = !it.external && active(it.href);
        const body = (
          <>
            {it.icon}
            {it.label} {it.badge ? <span className="badge">{it.badge}</span> : null}
          </>
        );
        return (
          <span key={it.href} style={{ display: "contents" }}>
            {head}
            {it.external ? (
              <a className="nav-i" href={it.href} target="_blank" rel="noopener">
                {body}
              </a>
            ) : (
              <Link className={`nav-i${on ? " on" : ""}`} href={it.href} aria-current={on ? "page" : undefined} onClick={() => document.getElementById("side")?.classList.remove("open")}>
                {body}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
