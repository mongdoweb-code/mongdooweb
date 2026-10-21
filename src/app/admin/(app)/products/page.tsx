// /admin/products — รายการสินค้า ค้นหา กรองตามหมวด/สถานะ แบ่งหน้า
import Link from "next/link";
import type { Prisma } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { bahtText } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { toggleProduct } from "./actions";
import "../../lot3.css";

const STATUS = { all: "ทั้งหมด", active: "เปิดขาย", inactive: "ปิดขาย", out: "สินค้าหมด", inquire: "สอบถามราคา", low: "สต็อกใกล้หมด" } as const;
type Status = keyof typeof STATUS;
const PER = 30;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProductsAdminPage({ searchParams }: PageProps<"/admin/products">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const T = (await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { lowStockThreshold: true } }))?.lowStockThreshold ?? 5;
  const q = one(sp.q).trim().slice(0, 80);
  const cat = one(sp.cat);
  const status: Status = one(sp.status) in STATUS ? (one(sp.status) as Status) : "all";
  const statusWhere: Record<Status, Prisma.ProductWhereInput> = {
    all: {},
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
  const total = await prisma.product.count({ where });
  const pages = Math.max(1, Math.ceil(total / PER));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const [rows, cats, counts] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PER,
      take: PER,
      include: { category: { select: { nameTh: true } } },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true } }),
    prisma.product.groupBy({ by: ["isActive"], where: { isService: false }, _count: { _all: true } }),
  ]);
  const activeCount = counts.find((c) => c.isActive)?._count._all ?? 0;
  const qs = (patch: Record<string, string>) => {
    const v = new URLSearchParams(Object.entries({ q, cat, status: status === "all" ? "" : status, ...patch }).filter(([, x]) => x));
    const s = v.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>สินค้า</h1>
          <p>เปิดขาย {activeCount} รายการ · ทั้งหมด {counts.reduce((a, c) => a + c._count._all, 0)} รายการ</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/admin/products/export" download>ส่งออก CSV</a>
          {admin.role === "OWNER" && <Link className="btn btn-outline" href="/admin/products/import">นำเข้า CSV</Link>}
          <Link className="btn btn-primary" href="/admin/products/new">+ เพิ่มสินค้า</Link>
        </div>
      </div>
      {sp.deleted === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ลบ/ปิดขายสินค้าแล้ว</div>}

      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {(Object.keys(STATUS) as Status[]).map((k) => (
              <a key={k} className={`tab ${status === k ? "on" : ""}`} role="tab" aria-selected={status === k} href={qs({ status: k === "all" ? "" : k, page: "" })}>
                {STATUS[k]}
              </a>
            ))}
          </div>
        </div>
        <form className="toolbar2" action="/admin/products">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
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
        <table className="tbl prod-tbl">
          <thead>
            <tr><th style={{ width: 64 }}>รูป</th><th>สินค้า</th><th>หมวด</th><th className="r">ราคา</th><th className="r">สต็อก</th><th>สถานะ</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const img = mediaUrl(p.images[0], "sm");
              const out = p.trackStock ? p.stock <= 0 : !p.inStock;
              return (
                <tr key={p.id} className={p.isActive ? "" : "row-off"}>
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
                  </td>
                  <td className="r num">{p.trackStock ? <Link href={`/admin/stock/${p.id}`} className={p.stock <= T ? "chip warn" : "link"} title="ประวัติ/ปรับสต็อก">{p.stock}</Link> : <span className="sub">ไม่นับ</span>}</td>
                  <td>
                    {p.isActive ? <span className="st st-SHIPPED">เปิดขาย</span> : <span className="st st-CANCELLED">ปิดขาย</span>}
                    {out && <span className="chip bad" style={{ marginLeft: 4 }}>หมด</span>}
                  </td>
                  <td className="r">
                    <form action={toggleProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn btn-ghost btn-sm" type="submit">{p.isActive ? "ปิดขาย" : "เปิดขาย"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>ไม่พบสินค้า</b>ลองเปลี่ยนคำค้นหรือตัวกรอง</div>}
        {total > 0 && (
          <div className="tbl-foot">
            <span>แสดง {(page - 1) * PER + 1}–{(page - 1) * PER + rows.length} จาก {total} รายการ</span>
            <div className="pager">
              {page > 1 && <a className="icon-btn" href={qs({ page: String(page - 1) })} aria-label="หน้าก่อนหน้า"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 6-6 6 6 6" /></svg></a>}
              <span className="num">หน้า {page}/{pages}</span>
              {page < pages && <a className="icon-btn" href={qs({ page: String(page + 1) })} aria-label="หน้าถัดไป"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg></a>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
