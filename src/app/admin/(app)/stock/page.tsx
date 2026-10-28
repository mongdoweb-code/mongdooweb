// /admin/stock — สต็อก: สินค้าที่นับสต็อก, สินค้าใกล้หมด (เกณฑ์ตั้งได้), ประวัติการเคลื่อนไหวทั้งหมด
import { Pagination, readPer } from "../../_components/Pagination";
import Link from "next/link";
import type { Prisma } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { fromYmd } from "@/lib/doc-calc";
import { prisma } from "@/lib/prisma";
import { STOCK_REASONS, isStockReason } from "@/lib/stock";
import { MoveTable } from "./MoveTable";
import { saveLowStock } from "./actions";
import "../../lot3.css";

const TABS = { all: "สินค้าที่นับสต็อก", low: "ใกล้หมด", moves: "ประวัติการเคลื่อนไหว" } as const;
type Tab = keyof typeof TABS;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

export default async function StockPage({ searchParams }: PageProps<"/admin/stock">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = one(sp.tab) in TABS ? (one(sp.tab) as Tab) : "all";
  const q = one(sp.q).trim().slice(0, 80);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const per = readPer(sp.per, 50);
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { lowStockThreshold: true, lineLowStock: true } });
  const T = s?.lowStockThreshold ?? 5;
  const qWhere: Prisma.ProductWhereInput = q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {};
  const base: Prisma.ProductWhereInput = { trackStock: true, isService: false };
  const [tracked, lowCount] = await Promise.all([
    prisma.product.count({ where: base }),
    prisma.product.count({ where: { ...base, isActive: true, stock: { lte: T } } }),
  ]);
  const qs = (patch: Record<string, string>) => {
    const v = new URLSearchParams(Object.entries({ tab: tab === "all" ? "" : tab, q, per: per === 50 ? "" : String(per), reason: one(sp.reason), from: one(sp.from), to: one(sp.to), ...patch }).filter(([, x]) => x));
    return `/admin/stock${v.size ? `?${v}` : ""}`;
  };

  return (
    <main className="main" id="page-stock">
      <div className="page-head">
        <div>
          <h1>สต็อกสินค้า</h1>
          <p>นับสต็อก {tracked} รายการ · ใกล้หมด {lowCount} รายการ (คงเหลือ ≤ {T})</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href="/admin/products">สินค้าทั้งหมด</Link>
        </div>
      </div>
      {sp.saved === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>บันทึกเกณฑ์แล้ว</div>}

      <section className="panel l3-section">
        <nav className="l3-tabs" aria-label="มุมมองสต็อก">
          {(Object.keys(TABS) as Tab[]).map((k) => (
            <a key={k} href={`/admin/stock${k === "all" ? "" : `?tab=${k}`}`} aria-current={tab === k ? "page" : undefined}>
              {TABS[k]}
              {k === "low" && <em>{lowCount}</em>}
            </a>
          ))}
        </nav>
        {tab === "all" && <ProductList where={{ ...base, ...qWhere }} q={q} page={page} per={per} T={T} qs={qs} />}
        {tab === "low" && (
          <>
            {admin.role === "OWNER" ? (
              <form className="l3-filter" action={saveLowStock}>
                <div className="field">
                  <label htmlFor="thr">เกณฑ์ใกล้หมด (คงเหลือ ≤)</label>
                  <input id="thr" name="threshold" type="number" min={0} max={9999} defaultValue={T} required />
                </div>
                <label className="chk-row" style={{ minHeight: 40 }}>
                  <input type="checkbox" name="lineLowStock" defaultChecked={s?.lineLowStock} /> แจ้งเตือน LINE เมื่อสต็อกลดถึงเกณฑ์หลังอนุมัติคำสั่งซื้อ
                </label>
                <button className="btn btn-dark" type="submit">บันทึกเกณฑ์</button>
              </form>
            ) : (
              <p className="l3-note" style={{ padding: "12px 16px" }}>เกณฑ์ใกล้หมด: คงเหลือ ≤ {T} (เจ้าของร้านเปลี่ยนได้)</p>
            )}
            <ProductList where={{ ...base, isActive: true, stock: { lte: T }, ...qWhere }} q={q} page={page} per={per} T={T} qs={qs} low />
          </>
        )}
        {tab === "moves" && <Moves sp={sp} qs={qs} page={page} per={per} />}
      </section>
    </main>
  );
}

async function ProductList({ where, q, page, per, T, qs, low }: { where: Prisma.ProductWhereInput; per: number; q: string; page: number; T: number; qs: (p: Record<string, string>) => string; low?: boolean }) {
  const total = await prisma.product.count({ where });
  const pages = Math.max(1, Math.ceil(total / per));
  const pg = Math.min(page, pages);
  const rows = await prisma.product.findMany({
    where, orderBy: low ? [{ stock: "asc" }, { name: "asc" }] : [{ name: "asc" }], skip: (pg - 1) * per, take: per,
    select: { id: true, sku: true, name: true, stock: true, isActive: true, category: { select: { nameTh: true } }, stockMoves: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, reason: true } } },
  });
  return (
    <>
      <form className="l3-filter" action="/admin/stock">
        {low && <input type="hidden" name="tab" value="low" />}
        <div className="field grow">
          <label htmlFor="sq">ค้นหาสินค้า</label>
          <input id="sq" name="q" type="search" defaultValue={q} placeholder="ชื่อหรือรหัสสินค้า" />
        </div>
        <button className="btn btn-outline" type="submit">ค้นหา</button>
      </form>
      <div className="l3-panel">
        {rows.length ? (
          <table className="l3-tbl" id="stockTbl">
            <thead><tr><th>สินค้า</th><th>หมวด</th><th className="r">คงเหลือ</th><th>เคลื่อนไหวล่าสุด</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.isActive ? "" : "off"}>
                  <td className="main"><Link className="link" href={`/admin/stock/${p.id}`}>{p.name}</Link><span className="sub">{p.sku}{p.isActive ? "" : " · ปิดขาย"}</span></td>
                  <td data-l="หมวด">{p.category.nameTh}</td>
                  <td className="r" data-l="คงเหลือ">
                    <b className={p.stock <= 0 ? "l3-neg" : ""}>{p.stock}</b> {p.stock <= T && <span className={`chip ${p.stock <= 0 ? "bad" : "warn"}`}>{p.stock <= 0 ? "หมด" : "ใกล้หมด"}</span>}
                  </td>
                  <td data-l="ล่าสุด">{p.stockMoves[0] ? `${STOCK_REASONS[p.stockMoves[0].reason as keyof typeof STOCK_REASONS] ?? p.stockMoves[0].reason} · ${fmt(p.stockMoves[0].createdAt)}` : "—"}</td>
                  <td className="r"><Link className="btn btn-outline btn-sm" href={`/admin/stock/${p.id}`}>{low ? "รับของเข้า" : "ปรับสต็อก"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty"><b>{low ? "ไม่มีสินค้าใกล้หมด" : "ไม่พบสินค้าที่นับสต็อก"}</b>{low ? "สต็อกทุกรายการสูงกว่าเกณฑ์" : "เปิด \"นับสต็อก\" ได้ในหน้าแก้ไขสินค้า"}</div>
        )}
      </div>
      <Pagination page={pg} pages={pages} total={total} shown={rows.length} per={per} href={(n, pp) => qs({ page: n > 1 ? String(n) : "", per: pp === 50 ? "" : String(pp) })} />
    </>
  );
}

async function Moves({ sp, qs, page, per }: { sp: Record<string, string | string[] | undefined>; per: number; qs: (p: Record<string, string>) => string; page: number }) {
  const q = one(sp.q).trim().slice(0, 80);
  const reason = isStockReason(one(sp.reason)) ? one(sp.reason) : "";
  const from = ymdRe.test(one(sp.from)) ? one(sp.from) : "";
  const to = ymdRe.test(one(sp.to)) ? one(sp.to) : "";
  const where: Prisma.StockMovementWhereInput = {
    ...(reason ? { reason } : {}),
    ...(q ? { OR: [{ ref: { contains: q, mode: "insensitive" } }, { product: { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } }] } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: fromYmd(from) } : {}), ...(to ? { lt: new Date(fromYmd(to).getTime() + 864e5) } : {}) } } : {}),
  };
  const total = await prisma.stockMovement.count({ where });
  const pages = Math.max(1, Math.ceil(total / per));
  const pg = Math.min(page, pages);
  const rows = await prisma.stockMovement.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (pg - 1) * per, take: per,
    include: { product: { select: { id: true, name: true, sku: true } }, admin: { select: { displayName: true } } },
  });
  return (
    <>
      <form className="l3-filter" action="/admin/stock">
        <input type="hidden" name="tab" value="moves" />
        <div className="field grow">
          <label htmlFor="mq">ค้นหา</label>
          <input id="mq" name="q" type="search" defaultValue={q} placeholder="สินค้า, รหัส, เลขที่อ้างอิง" />
        </div>
        <div className="field">
          <label htmlFor="mr">ประเภท</label>
          <select id="mr" name="reason" defaultValue={reason}>
            <option value="">ทั้งหมด</option>
            {Object.entries(STOCK_REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="mf">ตั้งแต่</label><input id="mf" type="date" name="from" defaultValue={from} /></div>
        <div className="field"><label htmlFor="mt">ถึง</label><input id="mt" type="date" name="to" defaultValue={to} /></div>
        <button className="btn btn-outline" type="submit">กรอง</button>
      </form>
      <div className="l3-panel">
        {rows.length ? <MoveTable rows={rows} showProduct /> : <div className="empty"><b>ยังไม่มีประวัติการเคลื่อนไหว</b>การขาย ยกเลิก รับของเข้า และนับสต็อกจะแสดงที่นี่</div>}
      </div>
      <Pagination page={pg} pages={pages} total={total} shown={rows.length} per={per} href={(n, pp) => qs({ page: n > 1 ? String(n) : "", per: pp === 50 ? "" : String(pp) })} />
    </>
  );
}
