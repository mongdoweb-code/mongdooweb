// หัวคอลัมน์ที่กดเรียงได้ (▲▼) — ใช้ร่วมกันทุกตาราง: กดคอลัมน์เดิม = สลับทิศ
import Link from "next/link";

export function SortTh({ label, on, desc, href, title, className }: { label: string; on: boolean; desc: boolean; href: string; title?: string; className?: string }) {
  return (
    <th className={className} aria-sort={on ? (desc ? "descending" : "ascending") : "none"}>
      <Link className={`th-sort${on ? " on" : ""}`} href={href} title={title ?? `เรียงตาม${label}`}>
        {label}
        <span className="th-arrows" aria-hidden="true">
          <i className={on && !desc ? "on" : ""} />
          <i className={on && desc ? "on" : ""} />
        </span>
      </Link>
    </th>
  );
}
