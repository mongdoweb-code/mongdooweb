// /admin/products — รายการสินค้า: ค้นหา กรองตามหมวด/สถานะ · ลากเรียงลำดับหน้าร้าน · ปักหมุด · เรียงตามคอลัมน์ · แบ่งหน้า
import Link from "next/link";
import type { Prisma } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { bahtText } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { saleActive } from "@/lib/pricing";
import { PRODUCT_ORDER } from "@/lib/storefront";
import { Pagination, readPer } from "../../_components/Pagination";
import { DragHandle, Icons, RowActions } from "../../_components/RowActions";
import { SortableRows } from "../../_components/SortableRows";
import { SortTh } from "../../_components/SortTh";
import { deleteProduct, duplicateProduct, moveProduct, saveProductOrder, toggleProduct, togglePin } from "./actions";
import { BulkBar } from "./BulkBar";
import "../../lot3.css";

const STATUS = { all: "ทั้งหมด", pinned: "ปักหมุด", active: "เปิดขาย", inactive: "ปิดขาย", out: "สินค้าหมด", inquire: "สอบถามราคา", low: "สต็อกใกล้หมด" } as const;
type Status = keyof typeof STATUS;
const SORTS = { order: "ลำดับหน้าร้าน", name: "ชื่อสินค้า", category: "หมวด", price: "ราคา", stock: "สต็อก", updated: "แก้ไขล่าสุด" } as const;
type SortKey = keyof typeof SORTS;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProductsAdminPage({ searchParams }: PageProps<"/admin/products">) {
  const admin = await requireAdmin();
  const owner = admin.role === "OWNER";
  const sp = await searchParams;
  const T = (await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { lowStockThreshold: true } }))?.lowStockThreshold ?? 5;
  const q = one(sp.q).trim().slice(0, 80);
  const cat = one(sp.cat);
  const status: Status = one(sp.status) in STATUS ? (one(sp.status) as Status) : "all";
  const sortKey: SortKey = one(sp.sort) in SORTS ? (one(sp.sort) as SortKey) : "order";
  const desc = one(sp.dir) === "desc";
  const byOrder = sortKey === "order" && !desc; // ลากเรียงได้เฉพาะมุมมอง "ลำดับหน้าร้าน"
  const per = readPer(sp.per, 20);
  const statusWhere: Record<Status, Prisma.ProductWhereInput> = {
    all: {},
    pinned: { isPinned: true },
    active: { isActive: true },
    inactive: { isActive: false },
    out: { OR: [{ trackStock: true, stock: { lte: 0 } }, { trackStock: false, inStock: false }] },
    inquire: { priceSatang: 0 },
    low: { trackStock: true, stock: { lte: T } },
  };
  const where: Prisma.ProductWhereInput = {
    isService: false,
    AND: [
      statusWhere[status],
      cat ? { categoryId: cat } : {},
      q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { keywords: { contains: q, mode: "insensitive" } }] } : {},
    ],
  };
  const d = desc ? "desc" : "asc";
  const orderBy: Record<SortKey, Prisma.ProductOrderByWithRelationInput[]> = {
    order: desc ? [{ isPinned: "asc" }, { sortOrder: "desc" }, { createdAt: "desc" }] : PRODUCT_ORDER,
    name: [{ name: d }],
    category: [{ category: { sortOrder: d } }, ...PRODUCT_ORDER],
    price: [{ priceSatang: d }, { name: "asc" }],
    stock: [{ trackStock: "desc" }, { stock: d }, { name: "asc" }],
    updated: [{ updatedAt: d }],
  };
  const total = await prisma.product.count({ where });
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const [rows, cats, counts, pinnedCount] = await Promise.all([
    prisma.product.findMany({ where, orderBy: orderBy[sortKey], skip: (page - 1) * per, take: per, include: { category: { select: { nameTh: true } } } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true } }),
    prisma.product.groupBy({ by: ["isActive"], where: { isService: false }, _count: { _all: true } }),
    prisma.product.count({ where: { isService: false, isPinned: true } }),
  ]);
  const activeCount = counts.find((c) => c.isActive)?._count._all ?? 0;
  const base = { q, cat, status: status === "all" ? "" : status, sort: sortKey === "order" ? "" : sortKey, dir: desc ? "desc" : "", per: per === 20 ? "" : String(per) };
  const qs = (patch: Record<string, string>) => {
    const v = new URLSearchParams(Object.entries({ ...base, ...patch }).filter(([, x]) => x));
    const s = v.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };
  // คลิกหัวคอลัมน์: คอลัมน์เดิม = สลับทิศ · คอลัมน์ใหม่ = สต็อก/แก้ไขล่าสุดเริ่มมาก→น้อย อื่นๆ น้อย→มาก
  const th = (k: SortKey, label: string, className?: string) => {
    const on = sortKey === k;
    const nextDesc = on ? !desc : k === "stock" || k === "updated";
    return <SortTh key={k} label={label} on={on} desc={desc} className={className} href={qs({ sort: k === "order" && !nextDesc ? "" : k, dir: nextDesc ? "desc" : "", page: "" })} />;
  };
  const mv = (id: string, sku: string, edge: "top" | "bottom") => (
    <form action={moveProduct}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="edge" value={edge} />
      <button className="mini-btn" aria-label={`${edge === "top" ? "ไปบนสุด" : "ไปล่างสุด"} ${sku}`} data-tip={edge === "top" ? "ไปบนสุดของร้าน" : "ไปล่างสุดของร้าน"}>
        {edge === "top" ? Icons.top : Icons.bottom}
      </button>
    </form>
  );

  const body = rows.map((p) => {
    const img = mediaUrl(p.images[0], "sm");
    const out = p.trackStock ? p.stock <= 0 : !p.inStock;
    return (
      <tr key={p.id} data-id={p.id} className={`${p.isActive ? "" : "row-off"}${p.isPinned ? " row-pin" : ""}`}>
        <td><input type="checkbox" name="ids" value={p.id} form="bulkForm" aria-label={`เลือก ${p.sku}`} /></td>
        {byOrder && (
          <td className="col-drag">
            <div className="drag-cell">
              <DragHandle label={p.sku} />
              <span className="pos num" aria-hidden="true" />
              <span className="edge-acts">{mv(p.id, p.sku, "top")}{mv(p.id, p.sku, "bottom")}</span>
            </div>
          </td>
        )}
        <td className="col-pin">
          <form action={togglePin}>
            <input type="hidden" name="id" value={p.id} />
            <button className={`pin-btn${p.isPinned ? " on" : ""}`} aria-pressed={p.isPinned} aria-label={`${p.isPinned ? "เลิกปักหมุด" : "ปักหมุด"} ${p.sku}`} data-tip={p.isPinned ? "เลิกปักหมุด" : "ปักหมุด (ขึ้นบนสุด)"}>
              {Icons.star}
            </button>
          </form>
        </td>
        <td>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img ? <img className="pthumb" src={img} alt="" loading="lazy" /> : <span className="pthumb" />}
        </td>
        <td>
          <a className="row-link" href={`/admin/products/${p.id}`}>
            <b>{p.name}</b>
            <span className="sub">{p.sku}{p.isBestSeller ? " · ขายดี" : ""}</span>
          </a>
        </td>
        <td className="sub" style={{ fontSize: 13 }}>{p.category.nameTh}</td>
        <td className="r num">
          {p.priceSatang ? bahtText(p.priceSatang) : <span className="chip warn">สอบถามราคา</span>}
          {p.compareAtSatang ? <span className="sub"><s>{bahtText(p.compareAtSatang)}</s></span> : null}
          {p.salePriceSatang ? (
            <span className={`chip ${saleActive(p) ? "ok" : "warn"}`} title={p.saleEndsAt ? `ถึง ${p.saleEndsAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : undefined}>
              ลด {bahtText(p.salePriceSatang)}{saleActive(p) ? "" : p.saleEndsAt && p.saleEndsAt <= new Date() ? " (หมดแล้ว)" : " (ตั้งเวลา)"}
            </span>
          ) : null}
        </td>
        <td className="r num">{p.trackStock ? <Link href={`/admin/stock/${p.id}`} className={p.stock <= T ? "chip warn" : "link"} title="ประวัติ/ปรับสต็อก">{p.stock}</Link> : <span className="sub">ไม่นับ</span>}</td>
        <td>
          <div className="st-cell">
            {p.isActive ? <span className="st st-SHIPPED">เปิดขาย</span> : <span className="st st-CANCELLED">ปิดขาย</span>}
            {out && <span className="chip bad">หมด</span>}
            <form action={toggleProduct}>
              <input type="hidden" name="id" value={p.id} />
              <button className="st-toggle" type="submit">{p.isActive ? "ปิดขาย" : "เปิดขาย"}</button>
            </form>
          </div>
        </td>
        <td className="r">
          <RowActions
            name={p.sku}
            dup={{ action: duplicateProduct, id: p.id, tip: "ทำสำเนาสินค้า" }}
            viewHref={`/product/${p.slug}`}
            viewDisabled={p.isActive ? undefined : "ปิดขายอยู่ — ไม่แสดงหน้าร้าน"}
            editHref={`/admin/products/${p.id}`}
            del={{
              action: deleteProduct,
              id: p.id,
              title: "ลบสินค้านี้?",
              body: `${p.sku} — ${p.name} · ถ้าเคยอยู่ในคำสั่งซื้อหรือเอกสาร ระบบจะปิดขายแทนการลบ (เก็บประวัติไว้)`,
              label: "ลบสินค้า",
              disabled: owner ? undefined : "ลบได้เฉพาะเจ้าของร้าน",
            }}
          />
        </td>
      </tr>
    );
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>สินค้า</h1>
          <p>เปิดขาย {activeCount} รายการ · ทั้งหมด {counts.reduce((a, c) => a + c._count._all, 0)} รายการ{pinnedCount ? ` · ปักหมุด ${pinnedCount}` : ""}</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href="/admin/products/variants">ตัวเลือกสินค้า</Link>
          <Link className="btn btn-outline" href="/admin/products/sale">ลดราคาตามเวลา</Link>
          <a className="btn btn-outline" href="/admin/products/export" download>ส่งออก CSV</a>
          {owner && <Link className="btn btn-outline" href="/admin/products/import">นำเข้า CSV</Link>}
          <Link className="btn btn-primary" href="/admin/products/new">+ เพิ่มสินค้า</Link>
        </div>
      </div>
      {sp.deleted === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ลบ/ปิดขายสินค้าแล้ว</div>}

      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {(Object.keys(STATUS) as Status[]).map((k) => (
              <a key={k} className={`tab ${status === k ? "on" : ""}`} role="tab" aria-selected={status === k} href={qs({ status: k === "all" ? "" : k, page: "" })}>
                {k === "pinned" && <span className="tab-star" aria-hidden="true">★</span>}
                {STATUS[k]}
                {k === "pinned" && pinnedCount ? <span className="cnt">{pinnedCount}</span> : null}
              </a>
            ))}
          </div>
        </div>
        <form className="toolbar2" action="/admin/products">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          {base.sort && <input type="hidden" name="sort" value={base.sort} />}
          {base.dir && <input type="hidden" name="dir" value={base.dir} />}
          {base.per && <input type="hidden" name="per" value={base.per} />}
          <label className="search" style={{ flex: 1, minWidth: 220 }}>
            <span className="sr-only">ค้นหาสินค้า</span>
            <input name="q" type="search" defaultValue={q} placeholder="ค้นหาชื่อ, รหัสสินค้า, คำค้น" />
          </label>
          <label className="sr-only" htmlFor="cat">หมวด</label>
          <select id="cat" name="cat" defaultValue={cat} className="sel">
            <option value="">ทุกหมวด</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.nameTh}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" type="submit">ค้นหา</button>
        </form>
        {byOrder ? (
          <p className="sort-hint">
            <span className="drag-ico" aria-hidden="true">{Icons.grip}</span>
            ลากที่ปุ่มจับเพื่อสลับตำแหน่ง (บันทึกทันที · หน้าร้านเรียงตามนี้ในลำดับ &quot;แนะนำ&quot;) · ★ = ปักหมุดไว้บนสุด
            {(q || cat || status !== "all") && <> · ตอนนี้กรองอยู่ — ลากสลับเฉพาะสินค้าที่เห็น ตำแหน่งสินค้าอื่นไม่ขยับ</>}
          </p>
        ) : (
          <div className="sort-bar" role="status">
            <span>กำลังดูแบบเรียงตาม <b>{SORTS[sortKey]}</b> ({desc ? "มาก → น้อย / ฮ → ก" : "น้อย → มาก / ก → ฮ"}) · ลำดับหน้าร้านไม่เปลี่ยน</span>
            <span className="sort-bar-acts"><Link className="btn btn-outline btn-sm" href={qs({ sort: "", dir: "", page: "" })}>กลับไปลากจัดลำดับ</Link></span>
          </div>
        )}
        <BulkBar categories={cats.map((c) => ({ id: c.id, name: c.nameTh }))} />
        <div className="tbl-wrap">
          <table className="tbl prod-tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" id="bulkAll" aria-label="เลือกทั้งหมดในหน้านี้" /></th>
                {byOrder && th("order", "ลำดับ", "col-drag")}
                <th className="col-pin"><span className="sr-only">ปักหมุด</span><span aria-hidden="true">★</span></th>
                <th style={{ width: 64 }}>รูป</th>
                {th("name", "สินค้า")}
                {th("category", "หมวด")}
                {th("price", "ราคา", "r")}
                {th("stock", "สต็อก", "r")}
                <th>สถานะ</th>
                <th className="r col-acts">การดำเนินการ</th>
              </tr>
            </thead>
            {byOrder && rows.length > 1 ? (
              <SortableRows ids={rows.map((p) => p.id)} groups={rows.map((p) => (p.isPinned ? "pin" : ""))} action={saveProductOrder} start={(page - 1) * per + 1}>
                {body}
              </SortableRows>
            ) : (
              <tbody style={{ counterReset: `pos ${(page - 1) * per}` }}>{body}</tbody>
            )}
          </table>
        </div>
        {!rows.length && <div className="empty"><b>ไม่พบสินค้า</b>ลองเปลี่ยนคำค้นหรือตัวกรอง</div>}
        <Pagination page={page} pages={pages} total={total} shown={rows.length} per={per} href={(n, pp) => qs({ page: n > 1 ? String(n) : "", per: pp === 20 ? "" : String(pp) })} />
      </section>
    </main>
  );
}
