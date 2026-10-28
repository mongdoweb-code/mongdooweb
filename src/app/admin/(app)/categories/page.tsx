// /admin/categories — หมวดหมู่สินค้า: ลำดับ, แสดงหน้าแรก, แก้ไข, ย้อนกลับเวอร์ชัน
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listVersions } from "@/lib/content-version";
import { CATEGORY_ICONS } from "@/lib/icons";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { applyCategorySort, deleteCategory, moveCategory, rollbackCategories } from "./actions";
import { CAT_SORT_LABEL, isCatSortKey, sortCategories, type CatSortKey } from "./sort";
import { CategoryForm, type CatValues } from "./CategoryForm";

const GROUP = { WATER: "งานน้ำ", OUTDOOR: "สวนและภายนอก", BUILDING: "อาคารและภายใน", DECO: "อุปกรณ์และตกแต่ง" } as const;
const Ico = ({ k }: { k: string | null }) => (
  <svg className="cat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CATEGORY_ICONS[k ?? "deco"] ?? CATEGORY_ICONS.deco }} />
);

export default async function CategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  const owner = (await requireAdmin()).role === "OWNER";
  const sp = await searchParams;
  const edit = typeof sp.edit === "string" ? sp.edit : null;
  const [cats, versions] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: { where: { isActive: true } } } } } }),
    listVersions("CATEGORIES", 8),
  ]);
  // เรียงตาราง: ?sort=order|name|group|count&dir=asc|desc — "order" = ลำดับหน้าร้าน (ปุ่มเลื่อนใช้ได้เฉพาะมุมมองนี้)
  const sortKey: CatSortKey = typeof sp.sort === "string" && isCatSortKey(sp.sort) ? sp.sort : "order";
  const desc = sp.dir === "desc";
  const byOrder = sortKey === "order" && !desc;
  const rows = sortCategories(cats, sortKey, desc);
  const qs = (k: CatSortKey, d: boolean) => {
    const p = new URLSearchParams();
    if (k !== "order" || d) p.set("sort", k);
    if (d) p.set("dir", "desc");
    if (edit) p.set("edit", edit);
    const s = p.toString();
    return `/admin/categories${s ? `?${s}` : ""}`;
  };
  // คลิกหัวคอลัมน์: คอลัมน์เดิม = สลับทิศ · คอลัมน์ใหม่ = จำนวนสินค้าเริ่มมาก→น้อย อื่นๆ เริ่มน้อย→มาก
  const head = (k: CatSortKey, label: string, cls = "") => {
    const on = sortKey === k;
    const nextDesc = on ? !desc : k === "count";
    return (
      <th className={cls} aria-sort={on ? (desc ? "descending" : "ascending") : "none"}>
        <Link className={`th-sort${on ? " on" : ""}`} href={qs(k, nextDesc)} title={`เรียงตาม${CAT_SORT_LABEL[k]}`}>
          {label}
          <span className="th-arrows" aria-hidden="true"><i className={on && !desc ? "on" : ""}>▲</i><i className={on && desc ? "on" : ""}>▼</i></span>
        </Link>
      </th>
    );
  };
  const mv = (c: (typeof cats)[number], dir: string, label: string, sym: string, disabled: boolean) => (
    <form action={moveCategory}>
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="dir" value={dir} />
      <button className="icon-btn sm" disabled={disabled} aria-label={`${label} ${c.nameTh}`} title={label}>{sym}</button>
    </form>
  );
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
      {sp.sorted === "1" && <div className="login-info" role="status">บันทึกลำดับใหม่แล้ว — เมนูและการ์ดหมวดหน้าแรกเรียงตามนี้</div>}
      {!byOrder && (
        <div className="sort-bar" role="status">
          <span>กำลังดูแบบเรียงตาม <b>{CAT_SORT_LABEL[sortKey]}</b> ({desc ? (sortKey === "count" ? "มาก → น้อย" : "ย้อนกลับ") : sortKey === "count" ? "น้อย → มาก" : "ก → ฮ"}) · ลำดับหน้าร้านยังไม่เปลี่ยน</span>
          <span className="sort-bar-acts">
            {sortKey !== "order" && (
              <form action={applyCategorySort}>
                <input type="hidden" name="sort" value={sortKey} />
                <input type="hidden" name="dir" value={desc ? "desc" : "asc"} />
                <ConfirmSubmit className="btn btn-primary btn-sm" title="ใช้ลำดับนี้กับหน้าร้าน?" body={`เมนูและการ์ดหมวดหน้าแรกจะเรียงตาม${CAT_SORT_LABEL[sortKey]} · ย้อนกลับได้จากประวัติการแก้ไขด้านล่าง`} confirmLabel="ใช้ลำดับนี้">ใช้ลำดับนี้กับหน้าร้าน</ConfirmSubmit>
              </form>
            )}
            <Link className="btn btn-outline btn-sm" href={qs("order", false)}>กลับไปจัดลำดับเอง</Link>
          </span>
        </div>
      )}
      {sp.err === "has-products" && <div className="login-err" role="alert">ลบไม่ได้ เพราะยังมีสินค้าในหมวดนี้ — ย้ายสินค้าไปหมวดอื่นหรือปิดหมวดแทน</div>}

      <div className={v ? "pform-grid" : ""}>
        <section className="panel">
          <table className="tbl">
            <thead>
              <tr>
                {head("order", "ลำดับ", "col-order")}
                {head("name", "หมวด")}
                {head("group", "กลุ่ม")}
                {head("count", "สินค้า", "r")}
                <th>แสดงผล</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id} className={`${c.id === edit ? "sel" : ""} ${c.isActive ? "" : "row-off"}`}>
                  <td>
                    {byOrder ? (
                      <div className="mv">
                        <span className="mv-no num" aria-hidden="true">{i + 1}</span>
                        {mv(c, "top", "ไปบนสุด", "⤒", i === 0)}
                        {mv(c, "up", "เลื่อนขึ้น", "↑", i === 0)}
                        {mv(c, "down", "เลื่อนลง", "↓", i === rows.length - 1)}
                        {mv(c, "bottom", "ไปล่างสุด", "⤓", i === rows.length - 1)}
                      </div>
                    ) : (
                      <span className="mv-no num" title="ลำดับหน้าร้านปัจจุบัน">#{cats.indexOf(c) + 1}</span>
                    )}
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
            {v.id && owner && (
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
