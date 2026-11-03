// /admin/coupons — คูปองส่วนลด (A2): รายการ + สถานะ + ใช้ไปแล้ว/ส่วนลดรวม · สร้างใหม่ · ส่งออก CSV รายงานการใช้
import Link from "next/link";
import { Pagination, paginate } from "../../_components/Pagination";
import { requireAdmin } from "@/lib/auth";
import { couponLabel, ymdOfEnd, ymdOfStart } from "@/lib/coupon-calc";
import { prisma } from "@/lib/prisma";
import { CouponForm } from "./CouponForm";
import { deleteCoupon, toggleCoupon } from "./actions";
import { RowActions } from "../../_components/RowActions";
import "./coupons.css";

const baht = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export default async function CouponsPage({ searchParams }: PageProps<"/admin/coupons">) {
  await requireAdmin();
  const sp = await searchParams;
  const [list, sums, cats] = await Promise.all([
    prisma.coupon.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    prisma.couponRedemption.groupBy({ by: ["couponId"], _sum: { discountSatang: true }, _count: { _all: true } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true } }),
  ]);
  const sumOf = new Map(sums.map((s) => [s.couponId, { n: s._count._all, d: s._sum.discountSatang ?? 0 }]));
  const now = new Date();
  const state = (c: (typeof list)[number]) =>
    !c.isActive ? ["ปิด", "gray"] : c.startsAt && now < c.startsAt ? ["ยังไม่เริ่ม", "warn"] : c.endsAt && now >= c.endsAt ? ["หมดอายุ", "gray"] : c.usageLimit != null && c.usedCount >= c.usageLimit ? ["ใช้ครบแล้ว", "gray"] : ["ใช้งานได้", "ok"];
  const cq = (typeof sp.q === "string" ? sp.q : "").trim().toUpperCase().slice(0, 40);
  const pg = paginate(cq ? list.filter((c) => c.code.includes(cq)) : list, sp, "/admin/coupons", ["q"]);
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>คูปองส่วนลด</h1>
          <p>ลูกค้ากรอกโค้ดในหน้าชำระเงิน — ตรวจและคิดส่วนลดที่เซิร์ฟเวอร์ แสดงในคำสั่งซื้อ/ใบเสร็จ</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/admin/coupons/export.csv">ส่งออก CSV การใช้คูปอง</a>
        </div>
      </div>
      {sp.deleted === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ลบคูปองแล้ว</div>}
      <section className="panel">
        <form className="toolbar2" action="/admin/coupons" role="search">
          <label className="search" style={{ flex: 1, minWidth: 220 }}>
            <span className="sr-only">ค้นหาโค้ดคูปอง</span>
            <input name="q" type="search" defaultValue={typeof sp.q === "string" ? sp.q : ""} placeholder="ค้นหาโค้ดคูปอง" />
          </label>
          <button className="btn btn-outline btn-sm" type="submit">ค้นหา</button>
        </form>
        <table className="tbl" id="couponTable">
          <thead>
            <tr><th>โค้ด</th><th>ส่วนลด</th><th>ช่วงเวลา</th><th className="r">ใช้แล้ว</th><th className="r">ส่วนลดรวม</th><th>สถานะ</th><th className="r col-acts">การดำเนินการ</th></tr>
          </thead>
          <tbody>
            {pg.rows.map((c) => {
              const [l, cls] = state(c);
              const u = sumOf.get(c.id);
              return (
                <tr key={c.id}>
                  <td><Link className="link num" href={`/admin/coupons/${c.id}`}><b>{c.code}</b></Link>{c.categoryIds.length > 0 && <span className="sub"> · {c.categoryIds.length} หมวด</span>}</td>
                  <td>{couponLabel(c)}</td>
                  <td className="sub">{c.startsAt || c.endsAt ? `${ymdOfStart(c.startsAt) || "…"} ถึง ${ymdOfEnd(c.endsAt) || "…"}` : "ไม่จำกัด"}</td>
                  <td className="r num">{c.usedCount}{c.usageLimit != null ? `/${c.usageLimit}` : ""}</td>
                  <td className="r num">{baht(u?.d ?? 0)}</td>
                  <td>
                    <div className="st-cell">
                      <form action={toggleCoupon}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className={`sw${c.isActive ? " on" : ""}`} type="submit" role="switch" aria-checked={c.isActive} aria-label={`เปิดใช้คูปอง ${c.code}`} data-tip={c.isActive ? "เปิดใช้อยู่ — กดเพื่อปิด" : "ปิดอยู่ — กดเพื่อเปิด"}>
                          <span className="sw-knob" aria-hidden="true" />
                        </button>
                      </form>
                      <span className={`chip ${cls}`}>{l}</span>
                    </div>
                  </td>
                  <td className="r">
                    <RowActions
                      name={c.code}
                      viewHref={`/admin/coupons/${c.id}`}
                      viewNewTab={false}
                      viewTip="ดูการใช้งาน"
                      editHref={`/admin/coupons/${c.id}#edit`}
                      del={{ action: deleteCoupon, id: c.id, title: "ลบคูปองนี้?", body: `${c.code} — ลบถาวร`, label: "ลบคูปอง", disabled: c.usedCount > 0 ? "มีคนใช้แล้ว — ลบไม่ได้ (ปิดแทน)" : undefined }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={pg.page} pages={pg.pages} total={pg.total} shown={pg.rows.length} per={pg.per} href={pg.href} unit="คูปอง" />
        {!list.length && <div className="empty"><b>ยังไม่มีคูปอง</b>สร้างคูปองแรกด้านล่าง</div>}
      </section>
      <h2 className="cp-h">สร้างคูปองใหม่</h2>
      <CouponForm
        categories={cats.map((c) => ({ id: c.id, name: c.nameTh }))}
        v={{ code: "", kind: "PERCENT", value: "", minOrder: "", maxDiscount: "", startsAt: "", endsAt: "", usageLimit: "", perPhoneLimit: "", categoryIds: [], isActive: true, note: "" }}
      />
    </main>
  );
}
