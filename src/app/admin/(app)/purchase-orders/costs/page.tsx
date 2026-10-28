// /admin/purchase-orders/costs — ต้นทุนสินค้า (A22, เจ้าของร้านเท่านั้น): ดู/แก้ต้นทุนล่าสุด, กำไรต่อชิ้น, สินค้าที่ยังไม่มีต้นทุน
// ต้นทุนอัปเดตอัตโนมัติเมื่อรับของตามใบสั่งซื้อ (ต้นทุนล่าสุด) — หน้านี้ใช้ตั้งค่าเริ่มต้นหรือแก้ไขเอง
import Link from "next/link";
import { Pagination, readPer } from "../../../_components/Pagination";
import type { Prisma } from "../../../../../../generated/prisma/client";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveCost } from "../actions";
import "../../../lot3.css";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const baht = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 });

export default async function CostsPage({ searchParams }: PageProps<"/admin/purchase-orders/costs">) {
  await requireOwner();
  const sp = await searchParams;
  const PER = readPer(sp.per, 50);
  const q = one(sp.q).trim().slice(0, 80);
  const missing = one(sp.missing) === "1";
  const where: Prisma.ProductWhereInput = {
    isService: false,
    ...(missing ? { costSatang: null } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, noCost] = await Promise.all([prisma.product.count({ where }), prisma.product.count({ where: { isService: false, costSatang: null, isActive: true } })]);
  const pages = Math.max(1, Math.ceil(total / PER));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const rows = await prisma.product.findMany({ where, orderBy: [{ isActive: "desc" }, { sku: "asc" }], skip: (page - 1) * PER, take: PER, select: { id: true, sku: true, name: true, priceSatang: true, costSatang: true, isActive: true } });
  const qs = (patch: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries({ per: PER === 50 ? "" : String(PER), q, missing: missing ? "1" : "", ...patch }).filter(([, v]) => v)).toString();
    return `/admin/purchase-orders/costs${s ? `?${s}` : ""}`;
  };
  return (
    <main className="main" id="page-costs">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/purchase-orders">← ใบสั่งซื้อ</Link></p>
          <h1>ต้นทุนสินค้า</h1>
          <p>ต้นทุนล่าสุดต่อหน่วย — อัปเดตเองเมื่อรับของตามใบสั่งซื้อ · ใช้คำนวณ<Link className="link" href="/admin/reports/profit">รายงานกำไร</Link> · พนักงานไม่เห็นหน้านี้</p>
        </div>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            <Link className={`tab ${!missing ? "on" : ""}`} role="tab" aria-selected={!missing} href={qs({ missing: "", page: "" })}>ทั้งหมด</Link>
            <Link className={`tab ${missing ? "on" : ""}`} role="tab" aria-selected={missing} href={qs({ missing: "1", page: "" })}>ยังไม่มีต้นทุน <span className="cnt">{noCost}</span></Link>
          </div>
          <form className="search" action="/admin/purchase-orders/costs" role="search">
            {missing && <input type="hidden" name="missing" value="1" />}
            <label className="sr-only" htmlFor="cq">ค้นหาสินค้า</label>
            <input id="cq" name="q" type="search" defaultValue={q} placeholder="ชื่อหรือรหัสสินค้า" />
          </form>
        </div>
        <table className="tbl" id="costTable">
          <thead><tr><th>สินค้า</th><th className="r">ราคาขาย</th><th className="r" style={{ width: 230 }}>ต้นทุน/หน่วย (บาท)</th><th className="r">กำไร/ชิ้น</th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const margin = p.costSatang != null && p.priceSatang ? p.priceSatang - p.costSatang : null;
              return (
                <tr key={p.id} data-sku={p.sku}>
                  <td><Link className="row-link" href={`/admin/products/${p.id}`}><b>{p.name}</b><span className="sub">{p.sku}{p.isActive ? "" : " · ปิดขาย"}</span></Link></td>
                  <td className="r num">{p.priceSatang ? baht(p.priceSatang) : "สอบถามราคา"}</td>
                  <td className="r">
                    <form action={saveCost} className="cost-form">
                      <input type="hidden" name="id" value={p.id} />
                      <label className="sr-only" htmlFor={`c_${p.id}`}>ต้นทุนของ {p.sku}</label>
                      <input id={`c_${p.id}`} name="cost" inputMode="decimal" defaultValue={p.costSatang != null ? String(p.costSatang / 100) : ""} placeholder="ไม่ทราบ" />
                      <button className="btn btn-outline btn-sm" type="submit">บันทึก</button>
                    </form>
                  </td>
                  <td className="r num">
                    {margin == null ? <span className="sub">—</span> : (
                      <span className={margin < 0 ? "owe" : ""}>{baht(margin)}<small className="sub"> {((margin / p.priceSatang) * 100).toFixed(1)}%</small></span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>ไม่พบสินค้า</b></div>}
        <Pagination page={page} pages={pages} total={total} shown={rows.length} per={PER} unit="รายการ" href={(n, pp) => qs({ page: n > 1 ? String(n) : "", per: pp === 50 ? "" : String(pp) })} />
      </section>
    </main>
  );
}
