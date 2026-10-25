// /admin/coupons — คูปองส่วนลด (A2): รายการ + สถานะ + ใช้ไปแล้ว/ส่วนลดรวม · สร้างใหม่ · ส่งออก CSV รายงานการใช้
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { couponLabel, ymdOfEnd, ymdOfStart } from "@/lib/coupon-calc";
import { prisma } from "@/lib/prisma";
import { CouponForm } from "./CouponForm";
import { toggleCoupon } from "./actions";
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
        <table className="tbl" id="couponTable">
          <thead>
            <tr><th>โค้ด</th><th>ส่วนลด</th><th>ช่วงเวลา</th><th className="r">ใช้แล้ว</th><th className="r">ส่วนลดรวม</th><th>สถานะ</th><th /></tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const [l, cls] = state(c);
              const u = sumOf.get(c.id);
              return (
                <tr key={c.id}>
                  <td><Link className="link num" href={`/admin/coupons/${c.id}`}><b>{c.code}</b></Link>{c.categoryIds.length > 0 && <span className="sub"> · {c.categoryIds.length} หมวด</span>}</td>
                  <td>{couponLabel(c)}</td>
                  <td className="sub">{c.startsAt || c.endsAt ? `${ymdOfStart(c.startsAt) || "…"} ถึง ${ymdOfEnd(c.endsAt) || "…"}` : "ไม่จำกัด"}</td>
                  <td className="r num">{c.usedCount}{c.usageLimit != null ? `/${c.usageLimit}` : ""}</td>
                  <td className="r num">{baht(u?.d ?? 0)}</td>
                  <td><span className={`chip ${cls}`}>{l}</span></td>
                  <td>
                    <form action={toggleCoupon}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn btn-ghost btn-sm" type="submit">{c.isActive ? "ปิด" : "เปิด"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
