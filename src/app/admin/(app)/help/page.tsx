// /admin/help — คู่มือการใช้งานหลังบ้าน: งานแต่ละอย่างทีละขั้น + ทางลัดไปหน้าจริง + คำถามที่พบบ่อย (เนื้อหาใน guides.ts)
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { FAQ, GUIDE_GROUPS } from "./guides";
import { HelpSearch } from "./HelpSearch";
import "../../lot3.css";

export default async function HelpPage() {
  const admin = await requireAdmin();
  const owner = admin.role === "OWNER";
  const groups = GUIDE_GROUPS.map((g) => ({ ...g, guides: g.guides.filter((x) => owner || !x.ownerOnly) })).filter((g) => g.guides.length);
  const total = groups.reduce((s, g) => s + g.guides.length, 0);

  return (
    <main className="main" id="page-help">
      <div className="page-head">
        <div>
          <h1>คู่มือการใช้งาน</h1>
          <p>วิธีทำงานแต่ละอย่างในหลังบ้านทีละขั้น ({total} หัวข้อ) — กดลิงก์สีส้มเพื่อไปหน้านั้นได้ทันที</p>
        </div>
      </div>

      <div className="hp-grid">
        <nav className="hp-toc box" aria-label="สารบัญคู่มือ">
          <HelpSearch />
          <ol>
            {groups.map((g) => (
              <li key={g.id} style={{ "--g": g.color } as React.CSSProperties}>
                <a href={`#${g.id}`}>{g.title}</a>
                <ol>{g.guides.map((x) => <li key={x.id}><a href={`#${x.id}`}>{x.title}</a></li>)}</ol>
              </li>
            ))}
            <li style={{ "--g": "#94A3B8" } as React.CSSProperties}><a href="#faq">คำถามที่พบบ่อย</a></li>
          </ol>
        </nav>

        <div className="hp-body">
          {groups.map((g) => (
            <section key={g.id} id={g.id} className="hp-group" data-group style={{ "--g": g.color } as React.CSSProperties}>
              <h2>{g.title}</h2>
              {g.guides.map((x) => (
                <article key={x.id} id={x.id} className="hp-card box" data-guide data-text={[x.title, x.when, ...x.steps, ...(x.tips ?? [])].join(" ").toLowerCase()}>
                  <details open={g.id === "daily" || undefined}>
                    <summary>
                      <h3>{x.title}</h3>
                      <span className="sub">ใช้เมื่อ: {x.when}</span>
                    </summary>
                    <ol className="hp-steps">{x.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                    {x.tips && <ul className="hp-tips">{x.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                    {x.links && (
                      <div className="hp-links">
                        {x.links.map((l) => <Link key={l.href} className="hp-go" href={l.href}>{l.label} →</Link>)}
                      </div>
                    )}
                  </details>
                </article>
              ))}
            </section>
          ))}

          <section id="faq" className="hp-group" data-group style={{ "--g": "#94A3B8" } as React.CSSProperties}>
            <h2>คำถามที่พบบ่อย</h2>
            {FAQ.map((f, i) => (
              <article key={i} className="hp-card box" data-guide data-text={`${f.q} ${f.a}`.toLowerCase()}>
                <details>
                  <summary><h3>{f.q}</h3></summary>
                  <p className="hp-a">{f.a}</p>
                </details>
              </article>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
