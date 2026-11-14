// /admin/login — หน้าเข้าสู่ระบบ: ซ้าย = โซนการตลาด + แอนิเมชันแสง LED · ขวา = ต้อนรับ + ฟอร์ม + หมวด/สินค้าแนะนำ
// ล็อกอินอยู่แล้วให้ไปหน้าคำสั่งซื้อ (ยกเว้น ?preview=1 = ตัวอย่างจากหน้าตั้งค่า) · มีขั้นตอนรอรหัส 2 ขั้นค้างอยู่ให้แสดงช่องกรอกรหัสต่อ
// เนื้อหาตั้งค่าที่ /admin/settings/login (ShopSetting.loginPage) — หน้านี้เปิดได้โดยไม่ล็อกอิน จึงแสดงเฉพาะข้อมูลที่เผยแพร่ได้
import { redirect } from "next/navigation";
import { getCurrentAdmin, pendingTwoFactor } from "@/lib/auth";
import { parseLoginPage, splitGlow } from "@/lib/login-page";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getShopData } from "@/lib/storefront";
import { LoginForm } from "./LoginForm";
import { ThemeToggle } from "../_components/ThemeToggle";
import { HeroGallery, HeroStats } from "./LoginHero";
import "./login.css";

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  const preview = sp.preview === "1";
  const admin = await getCurrentAdmin();
  if (admin && !preview) redirect("/admin");
  const idle = sp.idle === "1";
  const [pending, setting] = await Promise.all([pendingTwoFactor(), prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { loginPage: true } }).catch(() => null)]);
  const c = parseLoginPage(setting?.loginPage);

  // รูปในกรอบ: รูปที่อัปโหลด → ไม่มีให้ใช้รูปผลงานติดตั้งล่าสุด (ตั้งค่าได้)
  let slides: { src: string; title: string }[] = c.images.map((k) => ({ src: mediaUrl(k)!, title: c.caption }));
  if (!slides.length && c.useProjects) {
    const projects = await prisma.project
      .findMany({ where: { isPublished: true, images: { isEmpty: false } }, orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }], take: 4, select: { title: true, images: true } })
      .catch(() => []);
    slides = projects.map((p) => ({ src: mediaUrl(p.images[0])!, title: p.title }));
  }

  // หมวด/สินค้าแนะนำจากข้อมูลหน้าร้าน (แคชเดียวกับหน้าร้าน) — ฐานข้อมูลมีปัญหาก็ยังเข้าสู่ระบบได้
  let cats: { slug: string; name: string; img?: string; count: number }[] = [];
  let prods: { slug: string; name: string; img?: string; price: number }[] = [];
  if (c.showCategories || c.showProducts) {
    const data = await getShopData().catch(() => null);
    if (data) {
      if (c.showCategories) cats = data.categories.filter((x) => x.visible && x.count > 0).sort((a, b) => a.order - b.order).slice(0, c.catCount).map((x) => ({ slug: x.slug, name: x.th, img: x.img, count: x.count }));
      const priced = data.catalog.filter((p) => p.price > 0 && p.img && p.inStock);
      if (c.showProducts) prods = [...priced.filter((p) => p.best), ...priced.filter((p) => !p.best)].slice(0, c.productCount).map((p) => ({ slug: p.id, name: p.name, img: p.img, price: p.price }));
    }
  }

  return (
    <div className={`lg lg-${c.theme}${c.animate ? " lg-anim" : ""}`} data-preview={preview ? "" : undefined}>
      {preview && sp.frame !== "1" && <div className="lg-preview" role="status">ตัวอย่างหน้าเข้าสู่ระบบ (คุณล็อกอินอยู่) — ปิดแท็บนี้เพื่อกลับไปตั้งค่า</div>}
      <section className="lg-hero" aria-labelledby="lgHead">
        <div className="lg-fx" aria-hidden="true">
          <i className="lg-beam b1" />
          <i className="lg-beam b2" />
          <i className="lg-orb" />
          <i className="lg-grid" />
          <span className="lg-parts">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.73) % 9}s`, animationDuration: `${7 + (i % 5) * 1.6}s`, ["--s" as string]: `${2 + (i % 3)}px` }} />)}</span>
        </div>
        <div className="lg-hero-in">
          {c.eyebrow && <span className="lg-eyebrow"><i aria-hidden="true" />{c.eyebrow}</span>}
          <h2 id="lgHead" className="lg-head">
            {splitGlow(c.headline, c.glow).map((p, i) => (p.glow ? <span key={i} className="lg-glow">{p.text}</span> : <span key={i}>{p.text}</span>))}
          </h2>
          {c.sub && <p className="lg-sub">{c.sub}</p>}
          {c.highlights.length > 0 && (
            <ul className="lg-hl">
              {c.highlights.map((h) => (
                <li key={h}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5 4.8 13.4a.6.6 0 0 0 .5 1h5.4l-1.4 7.1c-.1.6.7.9 1 .4l8.4-10.9a.6.6 0 0 0-.5-1h-5.4l1.4-7.1c.1-.6-.7-.9-1-.4Z" fill="currentColor" /></svg>{h}</li>
              ))}
            </ul>
          )}
          {c.stats.length > 0 && <HeroStats stats={c.stats} animate={c.animate} />}
          {slides.length > 0 && <HeroGallery slides={slides} caption={c.caption} animate={c.animate} />}
        </div>
        <div className="lg-strip" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>
      </section>

      <main className="lg-side">
        <ThemeToggle className="lg-thm" />
        <div className="lg-side-in">
          <LoginForm idle={idle} pending2fa={pending?.username} welcome={c.welcome} welcomeSub={c.welcomeSub} notice={c.notice} />
          {(cats.length > 0 || prods.length > 0) && (
            <div className="lg-explore">
              {cats.length > 0 && (
                <section aria-labelledby="lgCats">
                  <h3 id="lgCats">หมวดสินค้าของร้าน</h3>
                  <ul className="lg-cats">
                    {cats.map((x) => (
                      <li key={x.slug}>
                        <a href={`/category/${encodeURIComponent(x.slug)}`} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {x.img ? <img src={x.img} alt="" width={28} height={28} loading="lazy" /> : <i aria-hidden="true" />}
                          <span>{x.name}</span><em>{x.count}</em>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {prods.length > 0 && (
                <section aria-labelledby="lgProds">
                  <h3 id="lgProds">สินค้าแนะนำ</h3>
                  <ul className="lg-prods">
                    {prods.map((p) => (
                      <li key={p.slug}>
                        <a href={`/product/${encodeURIComponent(p.slug)}`} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.img && <img src={p.img} alt="" width={52} height={52} loading="lazy" />}
                          <span><b>{p.name}</b><small>{baht(p.price)}</small></span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
          <footer className="lg-foot">
            <a href="/" target="_blank" rel="noopener">ไปหน้าร้าน ↗</a>
            <span>© {new Date().getFullYear()} มองดูเว็บ</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
