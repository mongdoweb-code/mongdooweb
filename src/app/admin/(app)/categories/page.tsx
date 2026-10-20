// /admin/categories — หมวดหมู่สินค้า: ลำดับ, แสดงหน้าแรก, แก้ไข, ย้อนกลับเวอร์ชัน
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listVersions } from "@/lib/content-version";
import { CATEGORY_ICONS } from "@/lib/icons";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { deleteCategory, moveCategory, rollbackCategories } from "./actions";
import { CategoryForm, type CatValues } from "./CategoryForm";

const GROUP = { WATER: "งานน้ำ", OUTDOOR: "สวนและภายนอก", BUILDING: "อาคารและภายใน", DECO: "อุปกรณ์และตกแต่ง" } as const;
const Ico = ({ k }: { k: string | null }) => (
  <svg className="cat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CATEGORY_ICONS[k ?? "deco"] ?? CATEGORY_ICONS.deco }} />
);

export default async function CategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  await requireAdmin();
  const sp = await searchParams;
  const edit = typeof sp.edit === "string" ? sp.edit : null;
  const [cats, versions] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: { where: { isActive: true } } } } } }),
    listVersions("CATEGORIES", 8),
  ]);
  const cur = edit && edit !== "new" ? cats.find((c) => c.id === edit) : null;
  const v: CatValues | null = cur
    ? { id: cur.id, nameTh: cur.nameTh, nameEn: cur.nameEn, slug: cur.slug, legacySlug: cur.legacySlug ?? "", icon: cur.icon ?? "deco", group: cur.group, popular: cur.popular.join(", "), description: cur.description ?? "", showOnHome: cur.showOnHome, isActive: cur.isActive }
    : edit === "new"
      ? { id: "", nameTh: "", nameEn: "", slug: "", legacySlug: "", icon: "deco", group: "DECO", popular: "", description: "", showOnHome: true, isActive: true }
      : null;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>หมวดหมู่สินค้า</h1>
          <p>ลำดับในหน้านี้ = ลำดับในเมนูและการ์ดหมวดของหน้าแรก · แก้แล้วหน้าร้านเปลี่ยนทันที</p>
        </div>
        <div className="head-actions"><Link className="btn btn-primary" href="/admin/categories?edit=new">+ เพิ่มหมวด</Link></div>
      </div>
      {sp.saved === "1" && <div className="login-info" role="status">เพิ่มหมวดแล้ว</div>}
      {sp.deleted === "1" && <div className="login-info" role="status">ลบหมวดแล้ว</div>}
      {sp.rolledback === "1" && <div className="login-info" role="status">ย้อนกลับเวอร์ชันแล้ว</div>}
      {sp.err === "has-products" && <div className="login-err" role="alert">ลบไม่ได้ เพราะยังมีสินค้าในหมวดนี้ — ย้ายสินค้าไปหมวดอื่นหรือปิดหมวดแทน</div>}

      <div className={v ? "pform-grid" : ""}>
        <section className="panel">
          <table className="tbl">
            <thead><tr><th style={{ width: 70 }}>ลำดับ</th><th>หมวด</th><th>กลุ่ม</th><th className="r">สินค้า</th><th>แสดงผล</th><th /></tr></thead>
            <tbody>
              {cats.map((c, i) => (
                <tr key={c.id} className={`${c.id === edit ? "sel" : ""} ${c.isActive ? "" : "row-off"}`}>
                  <td>
                    <div className="mv">
                      <form action={moveCategory}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="dir" value="up" /><button className="icon-btn sm" disabled={i === 0} aria-label={`เลื่อน ${c.nameTh} ขึ้น`}>↑</button></form>
                      <form action={moveCategory}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="dir" value="down" /><button className="icon-btn sm" disabled={i === cats.length - 1} aria-label={`เลื่อน ${c.nameTh} ลง`}>↓</button></form>
                    </div>
                  </td>
                  <td>
                    <Link className="row-link cat-cell" href={`/admin/categories?edit=${c.id}`}>
                      <Ico k={c.icon} />
                      <span><b>{c.nameTh}</b><span className="sub">{c.nameEn} · /category/{c.slug}</span></span>
                    </Link>
                  </td>
                  <td className="sub" style={{ fontSize: 13 }}>{GROUP[c.group]}</td>
                  <td className="r num">{c._count.products}</td>
                  <td>
                    {!c.isActive ? <span className="st st-CANCELLED">ปิดหมวด</span> : c.showOnHome ? <span className="st st-SHIPPED">หน้าแรก</span> : <span className="st st-AWAITING_SLIP">เฉพาะหน้าหมวด</span>}
                  </td>
                  <td className="r"><a className="link" href={`/category/${c.slug}`} target="_blank" rel="noopener">ดู</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {v && (
          <div className="d-col">
            <CategoryForm key={v.id || "new"} v={v} icons={CATEGORY_ICONS} />
            {v.id && (
              <form action={deleteCategory} className="box">
                <input type="hidden" name="id" value={v.id} />
                <h3>ลบหมวด</h3>
                <p className="sub">ลบได้เฉพาะหมวดที่ไม่มีสินค้าแล้ว</p>
                <div><ConfirmSubmit className="btn btn-danger btn-sm" title="ลบหมวดนี้?" body={v.nameTh} confirmLabel="ลบหมวด">ลบหมวด</ConfirmSubmit></div>
              </form>
            )}
          </div>
        )}
      </div>

      {versions.length > 1 && (
        <section className="box" style={{ marginTop: 16, maxWidth: 760 }}>
          <h3>ประวัติการแก้ไข (ย้อนกลับได้)</h3>
          <ul className="ver-list">
            {versions.slice(1).map((ver) => (
              <li key={ver.id}>
                <span>{ver.publishedAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })} · {ver.publishedBy ?? "—"}</span>
                <form action={rollbackCategories}>
                  <input type="hidden" name="versionId" value={ver.id} />
                  <ConfirmSubmit className="btn btn-outline btn-sm" title="ย้อนกลับหมวดหมู่?" body="ชื่อ ลำดับ ไอคอน และการแสดงผลของหมวดจะกลับเป็นค่าเดิม ณ เวลานั้น" confirmLabel="ย้อนกลับ">ย้อนกลับเป็นเวอร์ชันนี้</ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
