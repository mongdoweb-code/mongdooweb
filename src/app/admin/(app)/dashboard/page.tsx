// /admin/dashboard — ภาพรวมร้าน: ยอดขายวันนี้/สัปดาห์/เดือน เทียบช่วงก่อน, งานค้าง, สินค้าขายดี 10 อันดับ
// ยอดขาย = คำสั่งซื้อที่ยืนยันชำระแล้ว (ตามวันที่ยืนยัน) + ใบเสร็จจากเอกสารขายที่ไม่ผูกคำสั่งซื้อ — ยกเลิก/คืนเงินไม่นับ
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { addDaysYmd, fromYmd } from "@/lib/doc-calc";
import { statusWhere } from "@/lib/docs";
import { prisma } from "@/lib/prisma";
import { CHANNEL_LABEL, byChannel, byPeriod, byProduct, monthStart, mondayOf, prevMonthSameSpan, salesBetween, sumSales, todayYmd } from "@/lib/sales-report";
import { BarChart, Delta, RankTable, baht, shortDate } from "../reports/_ui";
import "../../lot3.css";

export default async function DashboardPage() {
  await requireAdmin();
  const now = new Date();
  const today = todayYmd();
  const t0 = fromYmd(today);
  const elapsed = now.getTime() - t0.getTime(); // เวลาที่ผ่านไปของวันนี้ (เทียบช่วงเดียวกัน)
  const weekStart = mondayOf(today);
  const pm = prevMonthSameSpan(today);
  const earliest = [addDaysYmd(today, -29), addDaysYmd(weekStart, -7), pm.from].sort()[0];

  const [s, sales, pending, toShip, awaiting, overdue, inquiries] = await Promise.all([
    prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { lowStockThreshold: true } }),
    salesBetween(fromYmd(earliest), now),
    prisma.order.count({ where: { status: "PENDING_VERIFICATION" } }),
    prisma.order.count({ where: { status: "PAID" } }),
    prisma.order.count({ where: { status: "AWAITING_SLIP" } }),
    prisma.salesDocument.count({ where: { type: "INVOICE", ...statusWhere("overdue", today) } }),
    prisma.inquiry.count({ where: { status: "NEW" } }),
  ]);
  const T = s?.lowStockThreshold ?? 5;
  const low = await prisma.product.count({ where: { trackStock: true, isActive: true, isService: false, stock: { lte: T } } });

  const between = (from: Date, to: Date) => sumSales(sales.filter((x) => x.at >= from && x.at < to));
  const periods = [
    { label: "ยอดขายวันนี้", cmp: "เมื่อวานช่วงเวลาเดียวกัน", now: between(t0, now), prev: between(fromYmd(addDaysYmd(today, -1)), new Date(fromYmd(addDaysYmd(today, -1)).getTime() + elapsed)) },
    {
      label: "สัปดาห์นี้ (จันทร์–วันนี้)", cmp: "สัปดาห์ก่อนช่วงเดียวกัน",
      now: between(fromYmd(weekStart), now), prev: between(fromYmd(addDaysYmd(weekStart, -7)), new Date(now.getTime() - 7 * 864e5)),
    },
    {
      label: "เดือนนี้", cmp: `${shortDate(pm.from)}–${shortDate(pm.to)}`,
      now: between(fromYmd(monthStart(today)), now), prev: between(fromYmd(pm.from), new Date(fromYmd(pm.to).getTime() + elapsed)),
    },
  ];
  const d14 = addDaysYmd(today, -13);
  const days = byPeriod(sales.filter((x) => x.day >= d14), d14, today, "day");
  const last30 = sales.filter((x) => x.day >= addDaysYmd(today, -29));
  const top = byProduct(last30).slice(0, 10);
  const channels = byChannel(sales.filter((x) => x.day >= monthStart(today)));
  const monthTotal = channels.reduce((a, c) => a + c.satang, 0);

  const tasks = [
    { href: "/admin?tab=PENDING_VERIFICATION", label: "สลิปรอตรวจ", n: pending, cls: "hot", hint: "ตรวจคิวเก่าสุดก่อน" },
    { href: "/admin?tab=PAID", label: "ชำระแล้ว รอจัดส่ง", n: toShip, cls: "hot", hint: "ใส่เลขพัสดุ" },
    { href: "/admin?tab=AWAITING_SLIP", label: "รอลูกค้าโอน", n: awaiting, cls: "", hint: "ยังไม่แนบสลิป" },
    { href: "/admin/docs/INVOICE?tab=overdue", label: "ใบแจ้งหนี้เกินกำหนด", n: overdue, cls: "bad", hint: "ติดตามลูกค้า" },
    { href: "/admin/inquiries", label: "คำขอจากลูกค้าใหม่", n: inquiries, cls: "hot", hint: "ใบเสนอราคา/ติดต่อ" },
    { href: "/admin/stock?tab=low", label: "สินค้าใกล้หมด", n: low, cls: "bad", hint: `คงเหลือ ≤ ${T}` },
  ];

  return (
    <main className="main" id="page-dashboard">
      <div className="page-head">
        <div>
          <h1>ภาพรวม</h1>
          <p>{now.toLocaleString("th-TH", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Bangkok" })}</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href="/admin/reports">รายงานยอดขาย</Link>
          <Link className="btn btn-primary" href="/admin/orders/new">+ สร้างคำสั่งซื้อ</Link>
        </div>
      </div>

      <div className="l3-kpis" aria-label="ยอดขาย">
        {periods.map((p) => (
          <div className="l3-kpi" key={p.label}>
            <span>{p.label}</span>
            <b className="num" data-satang={p.now.satang}>{baht(p.now.satang)}</b>
            <small>
              <Delta now={p.now.satang} prev={p.prev.satang} />
              {p.now.count} รายการ · เทียบ{p.cmp} {baht(p.prev.satang)}
            </small>
          </div>
        ))}
      </div>
      <p className="l3-note" style={{ margin: "-4px 0 18px" }}>นับเฉพาะยอดที่ยืนยันชำระแล้ว (คำสั่งซื้อเว็บ/หลังร้าน + ใบเสร็จจากเอกสารขาย) · ยกเลิกหรือคืนเงินแล้วไม่นับ</p>

      <h2 className="sr-only">งานค้าง</h2>
      <div className="l3-tasks">
        {tasks.map((t) => (
          <Link key={t.label} className={`l3-task ${t.n ? t.cls : ""}`} href={t.href}>
            <span>{t.label}</span>
            <b className="num">{t.n}</b>
            <small>{t.n ? t.hint : "ไม่มีงานค้าง"}</small>
          </Link>
        ))}
      </div>

      <section className="chart-panel" aria-labelledby="d14">
        <div className="chart-head">
          <div>
            <h2 id="d14">ยอดขาย 14 วันล่าสุด</h2>
            <p>ตามวันที่ยืนยันชำระ</p>
          </div>
          <div className="tot">
            <b className="num">{baht(days.reduce((a, d) => a + d.satang, 0))}</b>
            <p>{days.reduce((a, d) => a + d.count, 0)} รายการ</p>
          </div>
        </div>
        <div className="chart-wrap">
          <BarChart data={days} title="ยอดขาย 14 วันล่าสุด" label={(k) => (k === today ? "วันนี้" : shortDate(k))} />
        </div>
      </section>

      <div className="l3-cols">
        <section className="l3-panel" aria-labelledby="topTitle">
          <div className="l3-ph">
            <div>
              <h2 id="topTitle">สินค้าขายดี 10 อันดับ</h2>
              <p>30 วันล่าสุด เรียงตามยอดขาย</p>
            </div>
            <Link className="link" href="/admin/reports?view=product">ดูทั้งหมด →</Link>
          </div>
          <RankTable rows={top} empty="ยังไม่มียอดขายใน 30 วันที่ผ่านมา" />
        </section>
        <section className="l3-panel" aria-labelledby="chTitle">
          <div className="l3-ph">
            <div>
              <h2 id="chTitle">ช่องทางขาย เดือนนี้</h2>
              <p>รวม {baht(monthTotal)}</p>
            </div>
          </div>
          <table className="l3-tbl">
            <tbody>
              {channels.map((c) => (
                <tr key={c.key}>
                  <td className="main">
                    {CHANNEL_LABEL[c.key as keyof typeof CHANNEL_LABEL]}
                    <div className="l3-bar"><i style={{ width: `${monthTotal ? (c.satang / monthTotal) * 100 : 0}%` }} /></div>
                  </td>
                  <td className="r" data-l="รายการ">{c.count}</td>
                  <td className="r" data-l="ยอดขาย"><b>{baht(c.satang)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
