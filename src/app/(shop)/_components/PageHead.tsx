// หัวหน้าเพจย่อย: breadcrumb + eyebrow + หัวข้อ (สไตล์เดียวกับหัว section ในหน้าแรก)
// selfHref = path ของหน้านี้ → ใส่ BreadcrumbList JSON-LD ที่สร้างจาก crumbs ชุดเดียวกับที่มองเห็น (URL เต็ม)
import { absUrl, jsonForScript } from "@/lib/storefront";

type Crumb = { label: string; href?: string };

export function breadcrumbLd(crumbs: Crumb[], selfHref: string) {
  const all = [{ label: "หน้าแรก", href: "/" }, ...crumbs];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: absUrl(i === all.length - 1 ? selfHref : (c.href ?? selfHref)),
    })),
  };
}

export function PageHead({
  crumbs,
  eyebrow,
  title,
  sub,
  selfHref,
}: {
  crumbs: Crumb[];
  eyebrow?: string;
  title: string;
  sub?: React.ReactNode;
  selfHref?: string;
}) {
  return (
    <div className="pg-head">
      <div className="container">
        <nav className="crumbs" aria-label="เส้นทาง">
          <ol>
            <li>
              <a href="/">หน้าแรก</a>
            </li>
            {crumbs.map((c, i) => (
              <li key={`${i}-${c.label}`}>
                {c.href && i < crumbs.length - 1 ? <a href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        {title && <h1 className="sec-title">{title}</h1>}
        {sub && <p className="sec-sub">{sub}</p>}
        {selfHref && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(breadcrumbLd(crumbs, selfHref)) }} />
        )}
      </div>
    </div>
  );
}
