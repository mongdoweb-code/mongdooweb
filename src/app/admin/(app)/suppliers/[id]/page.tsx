// /admin/suppliers/new และ /admin/suppliers/:id — ข้อมูลผู้ขาย + ประวัติใบสั่งซื้อ + สินค้าที่ซื้อจากผู้ขายนี้พร้อมราคาทุน (ล่าสุด/ก่อนหน้า)
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { PO_STATUS } from "@/lib/purchase";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { deleteSupplier, saveSupplier, toggleSupplier } from "../actions";
import "../../../lot3.css";

export const instant = false;

const baht = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date | null) => (d ? d.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }) : "—");
const ERR: Record<string, string> = {
  name: "กรอกชื่อผู้ขาย (อย่างน้อย 2 ตัวอักษร)",
  email: "อีเมลไม่ถูกต้อง",
  taxId: "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (13 หลัก)",
  dup: "มีผู้ขายชื่อนี้อยู่แล้ว",
  used: "ผู้ขายนี้มีใบสั่งซื้อแล้ว ลบไม่ได้ — ปิดใช้แทน",
};

export default async function SupplierPage({ params, searchParams }: PageProps<"/admin/suppliers/[id]">) {
  await requireOwner();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = id === "new" ? null : await prisma.supplier.findUnique({ where: { id } });
  if (id !== "new" && !s) notFound();
  const err = typeof sp.err === "string" ? ERR[sp.err] : "";

  const pos = s
    ? await prisma.purchaseOrder.findMany({
        where: { supplierId: s.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { items: { select: { productId: true, name: true, qty: true, receivedQty: true, costSatang: true, product: { select: { sku: true, costSatang: true } } } } },
      })
    : [];
  const placed = pos.filter((p) => p.poNo && p.status !== "CANCELLED");
  // สินค้าที่ซื้อจากผู้ขายนี้: ราคาทุนครั้งล่าสุดเทียบครั้งก่อน
  type Bought = { key: string; productId: string | null; sku: string; name: string; times: number; qty: number; received: number; last: number; prev: number | null; lastAt: Date | null; current: number | null };
  const bought = new Map<string, Bought>();
  for (const po of placed) {
    for (const it of po.items) {
      const key = it.productId ?? `free:${it.name}`;
      const b = bought.get(key);
      if (!b) bought.set(key, { key, productId: it.productId, sku: it.product?.sku ?? "", name: it.name, times: 1, qty: it.qty, received: it.receivedQty, last: it.costSatang, prev: null, lastAt: po.orderedAt, current: it.product?.costSatang ?? null });
      else {
        b.times++; b.qty += it.qty; b.received += it.receivedQty;
        if (b.prev === null && it.costSatang !== b.last) b.prev = it.costSatang; // pos เรียงใหม่ → เก่า
      }
    }
  }
  const items = [...bought.values()].sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
  const total = placed.reduce((sum, p) => sum + p.totalSatang, 0);
  const open = placed.filter((p) => p.status === "ORDERED" || p.status === "PARTIAL").length;

  return (
    <main className="main" id="page-supplier">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/suppliers">← ผู้ขายทั้งหมด</Link></p>
          <h1>{s ? s.name : "เพิ่มผู้ขาย"}</h1>
          {s && <p>{s.isActive ? <span className="dst dst-ok">ใช้งานอยู่</span> : <span className="dst dst-gray">ปิดใช้</span>}{s.terms ? ` · ${s.terms}` : ""}</p>}
        </div>
        {s && (
          <div className="head-actions">
            <form action={toggleSupplier}><input type="hidden" name="id" value={s.id} /><button className="btn btn-outline" type="submit">{s.isActive ? "ปิดใช้" : "เปิดใช้"}</button></form>
            {!pos.length && <form action={deleteSupplier}><input type="hidden" name="id" value={s.id} /><ConfirmSubmit className="btn btn-outline" title={`ลบผู้ขาย ${s.name}?`} body="ยังไม่มีใบสั่งซื้อ ลบได้" confirmLabel="ลบ">ลบ</ConfirmSubmit></form>}
            <Link className="btn btn-primary" href={`/admin/purchase-orders/new?supplier=${s.id}`}>+ สร้างใบสั่งซื้อ</Link>
          </div>
        )}
      </div>
      {sp.saved === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>บันทึกข้อมูลผู้ขายแล้ว</div>}
      {err && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      {s && (
        <div className="ar-kpis">
          <div className="ar-kpi"><span>ใบสั่งซื้อ</span><b className="num">{placed.length}</b><small>รอรับของ {open} ใบ</small></div>
          <div className="ar-kpi"><span>ยอดสั่งรวม</span><b className="num">{baht(total)}</b></div>
          <div className="ar-kpi"><span>สินค้าที่เคยสั่ง</span><b className="num">{items.length}</b><small>รายการ</small></div>
          <div className="ar-kpi"><span>สั่งล่าสุด</span><b className="num">{day(placed[0]?.orderedAt ?? null)}</b></div>
        </div>
      )}

      <div className={s ? "dc-grid" : "sup-new"}>
        <div className="dc-main">
          {s && (
            <section className="panel">
              <div className="dc-h"><h3>สินค้าที่ซื้อจากผู้ขายนี้ ({items.length})</h3><small className="sub">ราคาทุนจากใบสั่งซื้อ — ↑ แพงขึ้น / ↓ ถูกลง เทียบครั้งก่อน</small></div>
              <div className="tbl-wrap">
                <table className="tbl" id="supItems">
                  <thead><tr><th>สินค้า</th><th className="r">สั่ง (ครั้ง)</th><th className="r">จำนวนรวม</th><th className="r">ทุนครั้งล่าสุด</th><th className="r">ครั้งก่อน</th><th className="r">ต้นทุนในระบบ</th></tr></thead>
                  <tbody>
                    {items.map((b) => (
                      <tr key={b.key}>
                        <td>{b.productId ? <Link className="link" href={`/admin/products/${b.productId}`}>{b.name}</Link> : b.name}<span className="sub">{b.sku || "รายการนอกระบบ"} · ล่าสุด {day(b.lastAt)}</span></td>
                        <td className="r num">{b.times}</td>
                        <td className="r num">{b.received}/{b.qty}</td>
                        <td className="r num"><b>{baht(b.last)}</b>{b.prev !== null && <span className={`sub ${b.last > b.prev ? "owe" : ""}`}> {b.last > b.prev ? "↑" : "↓"}{Math.abs(Math.round(((b.last - b.prev) / Math.max(1, b.prev)) * 100))}%</span>}</td>
                        <td className="r num sub">{b.prev !== null ? baht(b.prev) : "—"}</td>
                        <td className="r num sub">{b.current != null ? baht(b.current) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!items.length && <div className="empty"><b>ยังไม่มีประวัติการสั่ง</b>สร้างใบสั่งซื้อแล้วออกเลขที่ ประวัติจะขึ้นที่นี่</div>}
            </section>
          )}
          {s && (
            <section className="panel">
              <div className="dc-h"><h3>ใบสั่งซื้อ ({pos.length})</h3></div>
              <div className="tbl-wrap">
                <table className="tbl" id="supPos">
                  <thead><tr><th>เลขที่</th><th>สถานะ</th><th className="r">รับแล้ว</th><th className="r">ยอดรวม</th><th>วันที่สั่ง</th></tr></thead>
                  <tbody>
                    {pos.map((p) => {
                      const [label, cls] = PO_STATUS[p.status];
                      return (
                        <tr key={p.id}>
                          <td><Link className="link num" href={`/admin/purchase-orders/${p.id}`}><b>{p.poNo ?? "ฉบับร่าง"}</b></Link></td>
                          <td><span className={`dst dst-${cls}`}>{label}</span></td>
                          <td className="r num">{p.items.reduce((a, i) => a + i.receivedQty, 0)}/{p.items.reduce((a, i) => a + i.qty, 0)}</td>
                          <td className="r num">{baht(p.totalSatang)}</td>
                          <td className="sub">{day(p.orderedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!pos.length && <div className="empty"><b>ยังไม่มีใบสั่งซื้อ</b><Link className="link" href={`/admin/purchase-orders/new?supplier=${s.id}`}>สร้างใบสั่งซื้อแรก</Link></div>}
            </section>
          )}
        </div>

        <aside className="dc-side">
          <section className="box" id="edit">
            <h3>{s ? "ข้อมูลผู้ขาย" : "ข้อมูลผู้ขายใหม่"}</h3>
            <form action={saveSupplier} className="dc-form" id="supForm">
              <input type="hidden" name="id" value={s?.id ?? ""} />
              <div className="field"><label htmlFor="sName">ชื่อผู้ขาย / บริษัท *</label><input id="sName" name="name" defaultValue={s?.name ?? ""} required maxLength={160} /></div>
              <div className="field"><label htmlFor="sContact">ผู้ติดต่อ</label><input id="sContact" name="contact" defaultValue={s?.contact ?? ""} maxLength={120} /></div>
              <div className="field"><label htmlFor="sPhone">เบอร์โทร</label><input id="sPhone" name="phone" inputMode="tel" defaultValue={s?.phone ? formatPhone(s.phone) : ""} maxLength={40} /></div>
              <div className="field"><label htmlFor="sLine">LINE ID</label><input id="sLine" name="lineId" defaultValue={s?.lineId ?? ""} maxLength={60} /></div>
              <div className="field"><label htmlFor="sEmail">อีเมล</label><input id="sEmail" name="email" type="email" defaultValue={s?.email ?? ""} maxLength={120} /></div>
              <div className="field"><label htmlFor="sTax">เลขประจำตัวผู้เสียภาษี</label><input id="sTax" name="taxId" inputMode="numeric" defaultValue={s?.taxId ?? ""} maxLength={20} /></div>
              <div className="field"><label htmlFor="sAddr">ที่อยู่</label><textarea id="sAddr" name="address" rows={3} defaultValue={s?.address ?? ""} maxLength={500} /></div>
              <div className="field"><label htmlFor="sTerms">เงื่อนไขชำระ</label><input id="sTerms" name="terms" defaultValue={s?.terms ?? ""} placeholder="เช่น เงินสด / เครดิต 30 วัน" maxLength={120} /></div>
              <div className="field"><label htmlFor="sNote">หมายเหตุ</label><textarea id="sNote" name="note" rows={2} defaultValue={s?.note ?? ""} maxLength={2000} /></div>
              <label className="chk-row"><input type="checkbox" name="isActive" defaultChecked={s?.isActive ?? true} /> ใช้งาน (แสดงในรายชื่อตอนสร้างใบสั่งซื้อ)</label>
              <button className="btn btn-primary" type="submit">{s ? "บันทึก" : "เพิ่มผู้ขาย"}</button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}
