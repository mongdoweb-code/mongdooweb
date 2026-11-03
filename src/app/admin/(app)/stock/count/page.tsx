// /admin/stock/count — นับสต็อกทั้งร้าน: เปิดรอบนับใหม่ (ทั้งร้าน / ตามหมวด / เฉพาะใกล้หมด) + รายการรอบนับทั้งหมด
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Pagination, paginate } from "../../../_components/Pagination";
import { Icons } from "../../../_components/RowActions";
import { openCount } from "./actions";
import "../../../lot3.css";

const ST = { OPEN: ["กำลังนับ", "pend"], APPLIED: ["ปรับสต็อกแล้ว", "ok"], CANCELLED: ["ยกเลิก", "void"] } as const;
const when = (d: Date | null) => (d ? d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "—");

export default async function StockCountsPage({ searchParams }: PageProps<"/admin/stock/count">) {
  await requireAdmin();
  const sp = await searchParams;
  const [counts, cats, tracked, s] = await Promise.all([
    prisma.stockCount.findMany({ orderBy: { createdAt: "desc" }, take: 500, include: { createdBy: { select: { displayName: true } }, lines: { select: { counted: true, expected: true, applied: true } } } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true, _count: { select: { products: { where: { trackStock: true, isService: false } } } } } }),
    prisma.product.count({ where: { trackStock: true, isService: false } }),
    prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { lowStockThreshold: true } }),
  ]);
  const pg = paginate(counts, sp, "/admin/stock/count", [], 20);
  const err = typeof sp.err === "string" ? sp.err : "";
  const today = new Date().toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

  return (
    <main className="main" id="page-count">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/stock">← สต็อกสินค้า</Link></p>
          <h1>นับสต็อกทั้งร้าน</h1>
          <p>เปิดรอบนับ → พิมพ์ใบนับ/กรอกยอดที่นับได้ (บันทึกเป็นระยะได้) → กด &quot;ปรับสต็อกตามยอดนับ&quot; ครั้งเดียว ทุกรายการลงประวัติสต็อก</p>
        </div>
      </div>
      {err && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="dc-grid">
        <div className="dc-main">
          <section className="panel">
            <div className="dc-h"><h3>รอบนับสต็อก ({counts.length})</h3></div>
            <div className="tbl-wrap">
              <table className="tbl" id="countTable">
                <thead><tr><th>เลขที่</th><th>ชื่อรอบ</th><th>สถานะ</th><th className="r">นับแล้ว</th><th className="r">ยอดต่าง</th><th>เปิดเมื่อ</th><th className="r col-acts">การดำเนินการ</th></tr></thead>
                <tbody>
                  {pg.rows.map((c) => {
                    const done = c.lines.filter((l) => l.counted !== null);
                    const diff = done.filter((l) => l.counted !== l.expected).length;
                    const [label, cls] = ST[c.status];
                    return (
                      <tr key={c.id}>
                        <td className="num"><Link className="row-link" href={`/admin/stock/count/${c.id}`}><b>{c.countNo}</b></Link></td>
                        <td>{c.title}<span className="sub">โดย {c.createdBy?.displayName ?? "—"}</span></td>
                        <td><span className={`dst dst-${cls}`}>{label}</span></td>
                        <td className="r num">{done.length}/{c.lines.length}</td>
                        <td className={`r num${diff ? " owe" : ""}`}>{diff ? `${diff} รายการ` : "—"}</td>
                        <td className="sub">{when(c.createdAt)}</td>
                        <td className="r">
                          <div className="row-acts">
                            <Link className={`ra ${c.status === "OPEN" ? "ra-edit" : "ra-view"}`} href={`/admin/stock/count/${c.id}`} data-tip={c.status === "OPEN" ? "กรอกยอดนับ" : "ดู"} aria-label={`${c.status === "OPEN" ? "กรอกยอดนับ" : "ดู"} ${c.countNo}`}>
                              {c.status === "OPEN" ? Icons.edit : Icons.eye}
                            </Link>
                            <a className="ra ra-print" href={`/admin/print/count/${c.id}?auto=1`} target="_blank" rel="noopener" data-tip="พิมพ์ใบนับ" aria-label={`พิมพ์ใบนับ ${c.countNo}`}>{Icons.print}
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!counts.length && <div className="empty"><b>ยังไม่เคยนับสต็อกทั้งร้าน</b>เปิดรอบนับแรกจากแผงด้านขวา</div>}
            <Pagination page={pg.page} pages={pg.pages} total={pg.total} shown={pg.rows.length} per={pg.per} unit="รอบ" href={pg.href} />
          </section>
        </div>
        <aside className="dc-side">
          <section className="box">
            <h3>เปิดรอบนับใหม่</h3>
            <form action={openCount} className="dc-form" id="countNew">
              <div className="field"><label htmlFor="cTitle">ชื่อรอบนับ</label><input id="cTitle" name="title" defaultValue={`นับสต็อกประจำ ${today}`} maxLength={120} /></div>
              <fieldset className="qd-sec">
                <legend>นับสินค้าไหนบ้าง</legend>
                <label className="chk-row"><input type="radio" name="scope" value="all" defaultChecked /> ทั้งร้าน (สินค้าที่นับสต็อก {tracked} รายการ)</label>
                <label className="chk-row"><input type="radio" name="scope" value="low" /> เฉพาะสินค้าใกล้หมด (คงเหลือ ≤ {s?.lowStockThreshold ?? 5})</label>
                <label className="chk-row"><input type="radio" name="scope" value="category" /> เฉพาะหมวด</label>
                <label className="sr-only" htmlFor="cCat">หมวดที่จะนับ</label>
                <select id="cCat" name="categoryId" defaultValue="">
                  <option value="">— เลือกหมวด —</option>
                  {cats.filter((c) => c._count.products).map((c) => <option key={c.id} value={c.id}>{c.nameTh} ({c._count.products})</option>)}
                </select>
              </fieldset>
              <p className="sub">ระบบจดยอดคงเหลือ ณ ตอนเปิดรอบ ถ้ามีขาย/รับของระหว่างนับ ตอนปรับจะใช้ส่วนต่าง (นับได้ − ยอดตอนเปิดรอบ) จึงไม่ทำให้รายการขายระหว่างนั้นหาย</p>
              <button className="btn btn-primary" type="submit">เปิดรอบนับ</button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}
