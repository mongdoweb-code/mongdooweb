// /admin/home/popular — หมวดยอดนิยมหน้าแรก: เลือกหมวด เรียงลำดับ สีพื้นรูป และลิงก์ย่อย (สูงสุด 5 ต่อการ์ด)
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { parseHomeSections } from "@/lib/home";
import { parsePopular } from "@/lib/popular-cats";
import { prisma } from "@/lib/prisma";
import { COLOR_FILTERS, USE_FILTERS, getShopData } from "@/lib/storefront";
import { getPopularCards } from "@/lib/home-data";
import { savePopular } from "../actions";
import { PopularEditor, type CatOpt } from "./PopularEditor";
import "../../_lot10/lot10.css";

export const instant = false;

export default async function PopularAdminPage() {
  await requireAdmin();
  const [s, { categories }, live] = await Promise.all([
    prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { popularCats: true, homeSections: true } }),
    getShopData(),
    getPopularCards(),
  ]);
  const cfg = parsePopular(s?.popularCats);
  const section = parseHomeSections(s?.homeSections).find((x) => x.key === "popular");
  // ลิงก์แนะนำของแต่ละหมวด: คำยอดนิยมที่เจอสินค้าจริง + ตัวกรองสี/การใช้งาน + เรียงขายดี/มาใหม่
  const cats: CatOpt[] = categories
    .filter((c) => c.count > 0)
    .map((c) => {
      const base = `/category/${encodeURIComponent(c.slug)}`;
      const sug = [
        ...(c.tags ?? []).map((t) => ({ label: t.t, href: t.h })),
        ...Object.entries(COLOR_FILTERS).map(([k, l]) => ({ label: l, href: `${base}?color=${k}` })),
        ...Object.entries(USE_FILTERS).map(([k, l]) => ({ label: `ใช้กับ${l}`, href: `${base}?use=${k}` })),
        { label: "ขายดี", href: `${base}?sort=best` },
        { label: "มาใหม่", href: `${base}?sort=new` },
        { label: "มีของพร้อมส่ง", href: `${base}?stock=in` },
      ];
      const seen = new Set<string>();
      return { slug: c.slug, th: c.th, img: c.img ?? null, count: c.count, visible: c.visible, sug: sug.filter((x) => !seen.has(x.href) && seen.add(x.href)) };
    });
  // ยังไม่ได้ตั้ง = เริ่มจากที่ระบบเลือกให้ตอนนี้ (แก้ต่อได้เลย)
  const initial = cfg.items.length
    ? cfg
    : { title: live.title, items: live.cards.map((c, i) => ({ cat: c.slug, bg: (["cream", "peach", "rose", "sand", "lemon", "mint", "sky", "lavender"] as const)[i % 8], links: c.links })) };

  return (
    <main className="main" id="page-popular">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/home">← หน้าแรกและความน่าเชื่อถือ</Link></p>
          <h1>หมวดยอดนิยม (หน้าแรก)</h1>
          <p>การ์ดหมวดพร้อมลิงก์ย่อยบนหน้าแรก — เลือกหมวด เรียงลำดับ สีพื้นรูป และลิงก์ (สูงสุด 5 ต่อการ์ด) · รูปใช้รูปหมวด (อัปโหลดที่ หมวดหมู่สินค้า) หรือรูปสินค้าตัวแรก</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/#pc-h" target="_blank" rel="noopener">ดูบนหน้าแรก</a>
        </div>
      </div>
      {section && !section.show && (
        <div className="l10-err" role="status" style={{ marginBottom: 12 }}>
          ส่วนนี้ถูกซ่อนอยู่ในหน้าแรก — เปิดได้ที่ <Link className="link" href="/admin/home">ลำดับส่วนของหน้าแรก</Link>
        </div>
      )}
      {!cfg.items.length && (
        <div className="login-info" role="status" style={{ marginBottom: 12 }}>
          ตอนนี้ระบบเลือกหมวดให้อัตโนมัติ ({live.cards.length} หมวดที่แสดงบนหน้าแรก) — แก้ด้านล่างแล้วกดบันทึกเพื่อกำหนดเอง
        </div>
      )}
      <PopularEditor initial={initial} cats={cats} custom={cfg.items.length > 0} action={savePopular} />
    </main>
  );
}
