// หัวหน้าเพจย่อย: breadcrumb + eyebrow + หัวข้อ (สไตล์เดียวกับหัว section ในหน้าแรก)
type Crumb = { label: string; href?: string };

export function PageHead({
  crumbs,
  eyebrow,
  title,
  sub,
}: {
  crumbs: Crumb[];
  eyebrow?: string;
  title: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="pg-head">
      <div className="container">
        <nav className="crumbs" aria-label="เส้นทาง">
          <ol>
            <li>
              <a href="/">หน้าแรก</a>
            </li>
            {crumbs.map((c) => (
              <li key={c.label}>{c.href ? <a href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}</li>
            ))}
          </ol>
        </nav>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        {title && <h1 className="sec-title">{title}</h1>}
        {sub && <p className="sec-sub">{sub}</p>}
      </div>
    </div>
  );
}
