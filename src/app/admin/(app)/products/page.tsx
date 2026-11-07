// /admin/products — รายการสินค้า: ค้นหา กรองตามหมวด/สถานะ · ลากเรียงลำดับหน้าร้าน · ปักหมุด · เรียงตามคอลัมน์ · แบ่งหน้า
import Link from "next/link";
import { cookies } from "next/headers";
import { SortToolbar } from "@/components/sort-toolbar/SortToolbar";
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
import { InlineCell } from "../../_components/InlineCell";
import { QuickEditProduct, type QuickProduct } from "./QuickEditProduct";
import { quickField, quickSaveProduct } from "./quick-actions";
import "../../lot3.css";

const STATUS = { all: "ทั้งหมด", pinned: "ปักหมุด", active: "เปิดขาย", inactive: "ปิดขาย", out: "สินค้าหมด", inquire: "สอบถามราคา", low: "สต็อกใกล้หมด" } as const;
type Status = keyof typeof STATUS;
// แถบเรียงเดียวกับหน้าร้าน + "วันที่เพิ่ม" (และคอลัมน์ของตาราง: หมวด สต็อก แก้ไขล่าสุด)
const SORTS = { order: "แนะนำ (ลำดับหน้าร้าน)", name: "ชื่อสินค้า", price: "ราคา", created: "วันที่เพิ่ม", best: "ขายดี", rating: "คะแนนรีวิว", category: "หมวด", stock: "สต็อก", updated: "แก้ไขล่าสุด" } as const;
type SortKey = keyof typeof SORTS;
const DEF_DESC: Record<SortKey, boolean> = { order: false, name: false, price: false, created: true, best: true, rating: true, category: false, stock: true, updated: true };
const PER = [20, 50, 100] as const;
const VIEW_COOKIE = "mdw_admin_pview";
const VIEWS = [
  { value: "table", label: "ตาราง", icon: "table" as const },
  { value: "cards", label: "การ์ด", icon: "cards" as const },
  { value: "small", label: "การ์ดเล็ก", icon: "small" as const },
];
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
  const desc = one(sp.dir) === "desc" ? true : one(sp.dir) === "asc" ? false : DEF_DESC[sortKey];
  const savedView = (await cookies()).get(VIEW_COOKIE)?.value ?? "";
  const view = VIEWS.some((v) => v.value === savedView) ? savedView : "table";
  const cards = view !== "table";
  const byOrder = sortKey === "order" && !desc && !cards; // ลากเรียงได้เฉพาะ "ลำดับหน้าร้าน" ในมุมมองตาราง
  const per = (PER as readonly number[]).includes(readPer(sp.per, 20)) ? readPer(sp.per, 20) : 20;
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
    created: [{ createdAt: d }],
    best: PRODUCT_ORDER, // เรียงต่อด้วยยอดขายด้านล่าง
    rating: PRODUCT_ORDER,
    category: [{ category: { sortOrder: d } }, ...PRODUCT_ORDER],
    price: [{ priceSatang: d }, { name: "asc" }],
    stock: [{ trackStock: "desc" }, { stock: d }, { name: "asc" }],
    updated: [{ updatedAt: d }],
  };
  const total = await prisma.product.count({ where });
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  // ราคา / ขายดี / คะแนนรีวิว: เรียงทั้งชุดที่กรองแล้ว (สินค้า "สอบถามราคา" และสินค้าที่ยังไม่มีรีวิว อยู่ท้ายเสมอ) แล้วจึงแบ่งหน้า
  const pageIds = ["price", "best", "rating"].includes(sortKey) ? await sortedIds(sortKey, desc, where, (page - 1) * per, per) : null;
  const [rows, cats, counts, pinnedCount] = await Promise.all([
    pageIds
      ? prisma.product
          .findMany({ where: { id: { in: pageIds } }, include: { category: { select: { nameTh: true } } } })
          .then((list) => pageIds.map((id) => list.find((p) => p.id === id)!).filter(Boolean))
      : prisma.product.findMany({ where, orderBy: orderBy[sortKey], skip: (page - 1) * per, take: per, include: { category: { select: { nameTh: true } } } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true } }),
    prisma.product.groupBy({ by: ["isActive"], where: { isService: false }, _count: { _all: true } }),
    prisma.product.count({ where: { isService: false, isPinned: true } }),
  ]);
  const activeCount = counts.find((c) => c.isActive)?._count._all ?? 0;
  const base = { q, cat, status: status === "all" ? "" : status, sort: sortKey === "order" ? "" : sortKey, dir: desc === DEF_DESC[sortKey] ? "" : desc ? "desc" : "asc", per: per === 20 ? "" : String(per) };
  const qs = (patch: Record<string, string>) => {
    const v = new URLSearchParams(Object.entries({ ...base, ...patch }).filter(([, x]) => x));
    const s = v.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };
  // คลิกหัวคอลัมน์: คอลัมน์เดิม = สลับทิศ · คอลัมน์ใหม่ = สต็อก/แก้ไขล่าสุดเริ่มมาก→น้อย อื่นๆ น้อย→มาก
  const sortHref = (k: SortKey, nextDesc: boolean) => qs({ sort: k === "order" ? "" : k, dir: nextDesc === DEF_DESC[k] ? "" : nextDesc ? "desc" : "asc", page: "" });
  const th = (k: SortKey, label: string, className?: string) => {
    const on = sortKey === k;
    return <SortTh key={k} label={label} on={on} desc={desc} className={className} href={sortHref(k, on ? !desc : DEF_DESC[k])} />;
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

  // ข้อมูลสำหรับแผงแก้ไขด่วน (ส่งผ่าน data-qe-open — ไม่ต้องมี client component ทุกแถว)
  const quick = (p: (typeof rows)[number], img: string | null): QuickProduct => ({
    kind: "product", id: p.id, name: p.name, sku: p.sku, categoryId: p.categoryId, slug: p.slug, img,
    price: p.priceSatang ? String(p.priceSatang / 100) : "", compareAt: p.compareAtSatang ? String(p.compareAtSatang / 100) : "",
    trackStock: p.trackStock, stock: p.stock, inStock: p.inStock, isActive: p.isActive, isBestSeller: p.isBestSeller, badge: p.badge ?? "",
  });
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
        <td className="p-name">
          <a className="row-link" href={`/admin/products/${p.id}`}>
            <b>{p.name}</b>
          </a>
          <div className="row-quick">
            <span className="sub">{p.sku}{p.isBestSeller ? " · ขายดี" : ""}</span>
            {/* เมนูจัดการรวดเร็ว (แสดงเมื่อชี้แถว / แสดงตลอดบนจอสัมผัส) */}
            <span className="rq-links">
              <button type="button" className="rq rq-main" data-qe-open={JSON.stringify(quick(p, img))}>⚡ แก้ไขด่วน</button>
              <a className="rq" href={`/admin/products/${p.id}`}>แก้ไข</a>
              {p.isActive && <a className="rq" href={`/product/${p.slug}`} target="_blank" rel="noopener">ดูหน้าร้าน</a>}
              {p.trackStock && <a className="rq" href={`/admin/stock/${p.id}`}>ประวัติสต็อก</a>}
            </span>
          </div>
        </td>
        <td className="sub p-cat" style={{ fontSize: 13 }}>{p.category.nameTh}</td>
        <td className="r num">
          <InlineCell
            id={p.id} field="price" action={quickField} label={`ราคาขาย ${p.sku}`} value={p.priceSatang ? String(p.priceSatang / 100) : ""} placeholder="0 = สอบถามราคา"
            display={p.priceSatang ? bahtText(p.priceSatang) : <span className="chip warn">สอบถามราคา</span>}
          />
          {p.compareAtSatang ? <span className="sub"><s>{bahtText(p.compareAtSatang)}</s></span> : null}
          {p.salePriceSatang ? (
            <span className={`chip ${saleActive(p) ? "ok" : "warn"}`} title={p.saleEndsAt ? `ถึง ${p.saleEndsAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : undefined}>
              ลด {bahtText(p.salePriceSatang)}{saleActive(p) ? "" : p.saleEndsAt && p.saleEndsAt <= new Date() ? " (หมดแล้ว)" : " (ตั้งเวลา)"}
            </span>
          ) : null}
        </td>
        <td className="r num">
          {p.trackStock ? (
            <InlineCell id={p.id} field="stock" action={quickField} label={`สต็อก ${p.sku}`} value={String(p.stock)} inputMode="numeric" className={p.stock <= T ? "ic-warn" : ""} display={p.stock} />
          ) : (
            <InlineCell id={p.id} field="stock" action={quickField} label={`สต็อก ${p.sku}`} value="" inputMode="numeric" placeholder="จำนวน" hint="ใส่ตัวเลข = เริ่มนับสต็อก" display={<span className="sub">ไม่นับ</span>} />
          )}
        </td>
        <td>
          <div className="st-cell">
            {/* สวิตช์เปิด/ปิดขาย — กดแล้วบันทึกทันที */}
            <form action={toggleProduct}>
              <input type="hidden" name="id" value={p.id} />
              <button className={`sw${p.isActive ? " on" : ""}`} type="submit" role="switch" aria-checked={p.isActive} aria-label={`เปิดขายบนหน้าร้าน ${p.sku}`} data-tip={p.isActive ? "เปิดขายอยู่ — กดเพื่อปิดขาย" : "ปิดขายอยู่ — กดเพื่อเปิดขาย"}>
                <span className="sw-knob" aria-hidden="true" />
              </button>
            </form>
            <span className={`sw-lbl${p.isActive ? " on" : ""}`} aria-hidden="true">{p.isActive ? "เปิดขาย" : "ปิดขาย"}</span>
            {out && <span className="chip bad">หมด</span>}
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

  // มุมมองการ์ด / การ์ดเล็ก: แก้ราคา-สต็อกในการ์ด · ปักหมุด · ⤒⤓ ย้ายไปบนสุด/ล่างสุดของร้าน · เปิด/ปิดขาย · ปุ่มจัดการ
  const cardList = rows.map((p) => {
    const img = mediaUrl(p.images[0], "sm");
    const out = p.trackStock ? p.stock <= 0 : !p.inStock;
    return (
      <article key={p.id} className={`pcard${p.isActive ? "" : " off"}${p.isPinned ? " pin" : ""}`} data-id={p.id}>
        <div className="pcard-top">
          <input type="checkbox" name="ids" value={p.id} form="bulkForm" aria-label={`เลือก ${p.sku}`} />
          <form action={togglePin}>
            <input type="hidden" name="id" value={p.id} />
            <button className={`pin-btn${p.isPinned ? " on" : ""}`} aria-pressed={p.isPinned} aria-label={`${p.isPinned ? "เลิกปักหมุด" : "ปักหมุด"} ${p.sku}`} data-tip={p.isPinned ? "เลิกปักหมุด" : "ปักหมุด (ขึ้นบนสุด)"}>
              {Icons.star}
            </button>
          </form>
          <span className="pcard-edge">{mv(p.id, p.sku, "top")}{mv(p.id, p.sku, "bottom")}</span>
        </div>
        <a className="pcard-img" href={`/admin/products/${p.id}`} tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img ? <img src={img} alt="" loading="lazy" /> : <span className="pcard-ph" />}
          {out && <span className="chip bad pcard-out">หมด</span>}
        </a>
        <div className="pcard-body">
          <a className="pcard-name" href={`/admin/products/${p.id}`}>{p.name}</a>
          <span className="sub">{p.sku} · {p.category.nameTh}</span>
          <div className="pcard-nums">
            <label className="pcard-f">
              <span>ราคา</span>
              <InlineCell
                id={p.id} field="price" action={quickField} label={`ราคาขาย ${p.sku}`} value={p.priceSatang ? String(p.priceSatang / 100) : ""} placeholder="0 = สอบถามราคา"
                display={p.priceSatang ? bahtText(p.priceSatang) : <span className="chip warn">สอบถามราคา</span>}
              />
            </label>
            <label className="pcard-f">
              <span>สต็อก</span>
              {p.trackStock ? (
                <InlineCell id={p.id} field="stock" action={quickField} label={`สต็อก ${p.sku}`} value={String(p.stock)} inputMode="numeric" className={p.stock <= T ? "ic-warn" : ""} display={p.stock} />
              ) : (
                <InlineCell id={p.id} field="stock" action={quickField} label={`สต็อก ${p.sku}`} value="" inputMode="numeric" placeholder="จำนวน" hint="ใส่ตัวเลข = เริ่มนับสต็อก" display={<span className="sub">ไม่นับ</span>} />
              )}
            </label>
          </div>
          <div className="pcard-foot">
            <form action={toggleProduct}>
              <input type="hidden" name="id" value={p.id} />
              <button className={`sw${p.isActive ? " on" : ""}`} type="submit" role="switch" aria-checked={p.isActive} aria-label={`เปิดขายบนหน้าร้าน ${p.sku}`} data-tip={p.isActive ? "เปิดขายอยู่ — กดเพื่อปิดขาย" : "ปิดขายอยู่ — กดเพื่อเปิดขาย"}>
                <span className="sw-knob" aria-hidden="true" />
              </button>
            </form>
            <RowActions
              name={p.sku}
              before={<button type="button" className="ra ra-dup" data-qe-open={JSON.stringify(quick(p, mediaUrl(p.images[0], "sm")))} data-tip="แก้ไขด่วน" aria-label={`แก้ไขด่วน ${p.sku}`}>⚡</button>}
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
          </div>
        </div>
      </article>
    );
  });
  const flip = !desc;

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
        <div className="ptools">
          <SortToolbar
            sort={{ label: "เรียงตาม", options: (Object.keys(SORTS) as SortKey[]).map((k) => ({ value: k, label: SORTS[k], on: k === sortKey, href: sortHref(k, DEF_DESC[k]) })) }}
            dir={{ desc, href: sortHref(sortKey, flip) }}
            per={{ label: "จำนวนต่อหน้า", options: PER.map((n) => ({ n, on: n === per, href: qs({ per: n === 20 ? "" : String(n), page: "" }) })) }}
            views={{ value: view, cookie: VIEW_COOKIE, mode: "refresh", options: VIEWS }}
          />
        </div>
        {cards && sortKey === "order" && !desc ? (
          <p className="sort-hint" role="note">
            <span className="drag-ico" aria-hidden="true">{Icons.grip}</span>
            ลากจัดลำดับทีละตำแหน่งทำได้เฉพาะมุมมองตาราง — ในมุมมองการ์ดใช้ ★ ปักหมุด หรือ ⤒ ⤓ ย้ายไปบนสุด/ล่างสุดของร้าน
          </p>
        ) : byOrder ? (
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
        {cards ? (
          <div className={`pcards pcards-${view}`}>{cardList}</div>
        ) : (
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
        )}
        {!rows.length && <div className="empty"><b>ไม่พบสินค้า</b>ลองเปลี่ยนคำค้นหรือตัวกรอง</div>}
        <QuickEditProduct categories={cats.map((c) => ({ id: c.id, name: c.nameTh }))} action={quickSaveProduct} />
        <Pagination page={page} pages={pages} total={total} shown={rows.length} per={per} perOptions={PER} href={(n, pp) => qs({ page: n > 1 ? String(n) : "", per: pp === 20 ? "" : String(pp) })} />
      </section>
    </main>
  );
}

/** id ของสินค้าในหน้านี้ เมื่อเรียงตามราคา / ขายดี / คะแนนรีวิว (ค่าว่าง = สอบถามราคา / ยังไม่มีรีวิว อยู่ท้ายเสมอ) */
async function sortedIds(k: SortKey, desc: boolean, where: Prisma.ProductWhereInput, skip: number, take: number) {
  const list = await prisma.product.findMany({ where, orderBy: PRODUCT_ORDER, select: { id: true, priceSatang: true } });
  const ids = list.map((p) => p.id);
  let val: Map<string, number | null>;
  if (k === "price") val = new Map(list.map((p) => [p.id, p.priceSatang > 0 ? p.priceSatang : null]));
  else if (k === "best") {
    const sold = await prisma.orderItem.groupBy({ by: ["productId"], where: { productId: { in: ids }, order: { status: { in: ["PAID", "SHIPPED"] } } }, _sum: { qty: true } });
    const m = new Map(sold.map((r) => [r.productId!, r._sum.qty ?? 0]));
    val = new Map(ids.map((id) => [id, m.get(id) ?? 0]));
  } else {
    const rated = await prisma.review.groupBy({ by: ["productId"], where: { productId: { in: ids }, status: "APPROVED" }, _avg: { rating: true } });
    const m = new Map(rated.map((r) => [r.productId, r._avg.rating ?? null]));
    val = new Map(ids.map((id) => [id, m.get(id) ?? null]));
  }
  const pos = new Map(ids.map((id, i) => [id, i]));
  return [...ids]
    .sort((a, b) => {
      const x = val.get(a) ?? null, y = val.get(b) ?? null;
      if (x === null || y === null) return x === y ? pos.get(a)! - pos.get(b)! : x === null ? 1 : -1;
      return (desc ? y - x : x - y) || pos.get(a)! - pos.get(b)!;
    })
    .slice(skip, skip + take);
}
