// /admin/orders/cod — กระทบยอดเก็บเงินปลายทาง (A17): COD ที่จัดส่งแล้วแยก "ยังไม่ได้รับเงิน / รับเงินแล้ว" + ยอดรวม + CSV
import Link from "next/link";
import type { Prisma } from "../../../../../../generated/prisma/client";
import { STATUS_LABEL } from "@/lib/admin-orders";
import { requireAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { settleCod, unsettleCod } from "../cod-actions";

const baht = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 });
const fmt = (d: Date | null) => (d ? d.toLocaleString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }) : "—");
const VIEWS = { open: "ยังไม่ได้รับเงิน", settled: "รับเงินแล้ว", pending: "รอยืนยัน / รอส่ง" } as const;
type View = keyof typeof VIEWS;

function codWhere(view: View): Prisma.OrderWhereInput {
  if (view === "settled") return { paymentMethod: "COD", codSettledAt: { not: null } };
  if (view === "pending") return { paymentMethod: "COD", status: { in: ["AWAITING_SLIP", "PENDING_VERIFICATION", "PAID"] } };
  return { paymentMethod: "COD", status: "SHIPPED", codSettledAt: null };
}

export default async function CodPage({ searchParams }: PageProps<"/admin/orders/cod">) {
  await requireAdmin();
  const sp = await searchParams;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "open";
  const [rows, sums] = await Promise.all([
    prisma.order.findMany({ where: codWhere(view), orderBy: { shippedAt: "asc" }, take: 500 }),
    Promise.all((Object.keys(VIEWS) as View[]).map(async (v) => [v, await prisma.order.aggregate({ where: codWhere(v), _sum: { totalSatang: true }, _count: { _all: true } })] as const)),
  ]);
  const sum = Object.fromEntries(sums.map(([v, a]) => [v, { n: a._count._all, s: a._sum.totalSatang ?? 0 }])) as Record<View, { n: number; s: number }>;
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin">← คำสั่งซื้อ</Link></p>
          <h1>กระทบยอดเก็บเงินปลายทาง (COD)</h1>
          <p>ติ๊กรายการที่ขนส่งโอนเงินคืนร้านแล้ว แล้วกด &quot;รับเงินแล้ว&quot;</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href={`/admin/orders/cod/export?view=${view}`}>ส่งออก CSV</a>
        </div>
      </div>
      {typeof sp.settled === "string" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>บันทึกรับเงินแล้ว {Number(sp.settled) || 0} รายการ</div>}
      <div className="kpis" id="codKpis">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <a key={v} className={`kpi ${v === view ? "hot" : ""}`} href={`/admin/orders/cod?view=${v}`}>
            <span>{VIEWS[v]}</span>
            <b className="num">{baht(sum[v].s)}</b>
            <small>{sum[v].n} รายการ</small>
          </a>
        ))}
      </div>
      <section className="panel">
        <form id="codForm" action={settleCod}>
          <input type="hidden" name="ret" value={`?view=${view}`} />
          {view === "open" && rows.length > 0 && (
            <div className="toolbar" style={{ gap: 8 }}>
              <label className="sr-only" htmlFor="codRef">อ้างอิงการโอนจากขนส่ง</label>
              <input id="codRef" name="ref" maxLength={100} placeholder="อ้างอิงการโอน เช่น รอบโอน Kerry 22/10" style={{ height: 38, border: "1px solid var(--c-line)", padding: "0 10px", minWidth: 260 }} />
              <button className="btn btn-ok" type="submit" id="codSettleBtn">รับเงินแล้ว (รายการที่เลือก)</button>
            </div>
          )}
        </form>
        <table className="tbl" id="codTable">
          <thead>
            <tr>
              {view === "open" && <th className="c-sel"><span className="sr-only">เลือก</span></th>}
              <th>เลขที่</th><th>ลูกค้า</th><th>ขนส่ง / เลขพัสดุ</th><th>จัดส่ง</th><th className="r">ยอดเก็บปลายทาง</th><th>สถานะ</th>{view === "settled" && <th>รับเงินเมื่อ</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                {view === "open" && <td className="c-sel"><input type="checkbox" className="cb" form="codForm" name="pick" value={o.orderNo} aria-label={`เลือก ${o.orderNo}`} /></td>}
                <td><Link className="link" href={`/admin?tab=ALL&open=${o.orderNo}`}>{o.orderNo}</Link></td>
                <td>{o.customerName}<span className="sub">{formatPhone(o.phone)}</span></td>
                <td>{o.carrier ?? "—"}<span className="sub">{o.trackingNo ?? ""}</span></td>
                <td>{fmt(o.shippedAt)}</td>
                <td className="r num"><b>{baht(o.totalSatang)}</b></td>
                <td>{STATUS_LABEL[o.status]}</td>
                {view === "settled" && (
                  <td>
                    {fmt(o.codSettledAt)}{" "}
                    <form action={unsettleCod} style={{ display: "inline" }}>
                      <input type="hidden" name="orderNo" value={o.orderNo} />
                      <input type="hidden" name="ret" value="?view=settled" />
                      <button className="link" type="submit">ยกเลิก</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>ไม่มีรายการ</b></div>}
      </section>
    </main>
  );
}
