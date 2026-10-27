// /admin/purchase-orders/new และ /admin/purchase-orders/:id — สร้าง/แก้ฉบับร่าง (เจ้าของร้าน), รับของเข้า (ทุกคน), พิมพ์, ยกเลิก/ปิดใบ
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PO_STATUS } from "@/lib/purchase";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { HistoryLink } from "../../../_components/HistoryLink";
import { closePoAction, deletePo, receivePoAction } from "../actions";
import { PoForm, type PoValues } from "../PoForm";
import "../../../lot3.css";

export const instant = false;

const baht = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (d: Date | null) => (d ? d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "—");

async function formData() {
  const [products, sup] = await Promise.all([
    prisma.product.findMany({ where: { isService: false }, orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, sku: true, name: true, costSatang: true, trackStock: true, stock: true } }),
    prisma.purchaseOrder.findMany({ distinct: ["supplierName"], orderBy: { createdAt: "desc" }, take: 50, select: { supplierName: true } }),
  ]);
  return { products, suppliers: sup.map((s) => s.supplierName) };
}

export default async function PurchaseOrderPage({ params, searchParams }: PageProps<"/admin/purchase-orders/[id]">) {
  const admin = await requireAdmin();
  const owner = admin.role === "OWNER";
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const err = typeof sp.err === "string" ? sp.err : "";

  if (id === "new") {
    await requireOwner();
    const { products, suppliers } = await formData();
    const v: PoValues = { id: "", supplierName: "", supplierContact: "", note: "", items: [] };
    return (
      <main className="main">
        <div className="page-head"><div><p><Link className="link" href="/admin/purchase-orders">← ใบสั่งซื้อทั้งหมด</Link></p><h1>สร้างใบสั่งซื้อ</h1></div></div>
        <PoForm v={v} products={products} suppliers={suppliers} />
      </main>
    );
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: { orderBy: { id: "asc" }, include: { product: { select: { sku: true, trackStock: true, stock: true } } } }, createdBy: { select: { displayName: true } } },
  });
  if (!po) notFound();
  const [label, cls] = PO_STATUS[po.status];
  const moves = po.poNo
    ? await prisma.stockMovement.findMany({ where: { ref: po.poNo, reason: "RESTOCK" }, orderBy: { createdAt: "desc" }, take: 100, include: { product: { select: { sku: true, name: true } }, admin: { select: { displayName: true } } } })
    : [];
  const open = po.status === "ORDERED" || po.status === "PARTIAL";

  // ฉบับร่าง: เจ้าของร้านแก้ต่อได้
  if (po.status === "DRAFT" && owner) {
    const { products, suppliers } = await formData();
    const v: PoValues = {
      id: po.id, supplierName: po.supplierName, supplierContact: po.supplierContact ?? "", note: po.note ?? "",
      items: po.items.map((i) => ({ productId: i.productId, name: i.name, qty: String(i.qty), cost: String(i.costSatang / 100) })),
    };
    return (
      <main className="main">
        <div className="page-head">
          <div><p><Link className="link" href="/admin/purchase-orders">← ใบสั่งซื้อทั้งหมด</Link></p><h1>ใบสั่งซื้อฉบับร่าง</h1><p><span className={`dst dst-${cls}`}>{label}</span> · {po.supplierName}</p></div>
          <div className="head-actions">
            <form action={deletePo}><input type="hidden" name="id" value={po.id} /><ConfirmSubmit className="btn btn-outline" title="ลบฉบับร่างนี้?" body="ยังไม่ได้ออกเลขที่ จึงลบได้" confirmLabel="ลบ">ลบฉบับร่าง</ConfirmSubmit></form>
          </div>
        </div>
        {sp.saved === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>บันทึกฉบับร่างแล้ว</div>}
        {err && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
        <PoForm key={po.updatedAt.toISOString()} v={v} products={products} suppliers={suppliers} />
      </main>
    );
  }

  return (
    <main className="main" id="poDetail">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/purchase-orders">← ใบสั่งซื้อทั้งหมด</Link></p>
          <h1>{po.poNo ?? "ใบสั่งซื้อฉบับร่าง"}</h1>
          <p><span className={`dst dst-${cls}`} id="poStatus">{label}</span> · {po.supplierName}{po.supplierContact ? ` · ${po.supplierContact}` : ""}</p>
        </div>
        <div className="head-actions">
          {owner && po.poNo && <a className="btn btn-outline" href={`/admin/print/po/${po.id}`} target="_blank" rel="noopener">พิมพ์ใบสั่งซื้อ</a>}
          {owner && open && (
            <form action={closePoAction}>
              <input type="hidden" name="id" value={po.id} />
              {po.status === "ORDERED" ? (
                <ConfirmSubmit className="btn btn-outline" title={`ยกเลิก ${po.poNo}?`} body="ยังไม่ได้รับของ — เลขที่ใบสั่งซื้อจะถูกเก็บไว้ ไม่นำกลับมาใช้" confirmLabel="ยกเลิกใบสั่งซื้อ">ยกเลิกใบสั่งซื้อ</ConfirmSubmit>
              ) : (
                <ConfirmSubmit className="btn btn-outline" title={`ปิด ${po.poNo}?`} body="ไม่รอรับของส่วนที่เหลือ — สถานะจะเป็น “รับครบแล้ว”" confirmLabel="ปิดใบสั่งซื้อ">ปิดใบ (ไม่รอส่วนที่เหลือ)</ConfirmSubmit>
              )}
            </form>
          )}
        </div>
      </div>
      {sp.saved === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>บันทึกแล้ว{po.poNo ? ` — ออกใบสั่งซื้อ ${po.poNo}` : ""}</div>}
      {sp.received === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }} id="poReceived">รับของเข้าแล้ว — เพิ่มสต็อก{owner ? "และบันทึกต้นทุนล่าสุด" : ""}เรียบร้อย</div>}
      {err && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {po.status === "DRAFT" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ฉบับร่าง — เจ้าของร้านกำลังจัดทำ ยังรับของไม่ได้</div>}

      <div className="pform-grid">
        <div className="d-col">
          <form className="box" action={receivePoAction} id="poReceiveForm">
            <h3>{open ? "รับของเข้า" : "รายการสินค้า"}</h3>
            <input type="hidden" name="id" value={po.id} />
            <table className="tbl po-lines">
              <thead>
                <tr><th>สินค้า</th><th className="r">สั่ง</th><th className="r">รับแล้ว</th>{owner && <th className="r">ต้นทุน/หน่วย</th>}{open && <th className="r" style={{ width: 110 }}>รับครั้งนี้</th>}</tr>
              </thead>
              <tbody>
                {po.items.map((it) => {
                  const left = it.qty - it.receivedQty;
                  return (
                    <tr key={it.id} data-item={it.product?.sku ?? it.name}>
                      <td>{it.name}<span className="sub">{it.product ? `${it.product.sku}${it.product.trackStock ? ` · คงเหลือ ${it.product.stock}` : " · ไม่นับสต็อก (บันทึกต้นทุนอย่างเดียว)"}` : "รายการนอกระบบ"}</span></td>
                      <td className="r num">{it.qty}</td>
                      <td className="r num">{it.receivedQty}</td>
                      {owner && <td className="r num">{baht(it.costSatang)}</td>}
                      {open && (
                        <td className="r">
                          {left > 0 ? (
                            <>
                              <input type="hidden" name="itemId" value={it.id} />
                              <label className="sr-only" htmlFor={`rq_${it.id}`}>จำนวนที่รับของ {it.name}</label>
                              <input id={`rq_${it.id}`} name={`qty_${it.id}`} className="po-rq" type="number" min={0} max={left} defaultValue={left} inputMode="numeric" />
                            </>
                          ) : <span className="sub">ครบแล้ว</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {owner && <tfoot><tr><td>รวม</td><td colSpan={2} /><td className="r num"><b>{baht(po.totalSatang)}</b></td>{open && <td />}</tr></tfoot>}
            </table>
            {open && (
              <>
                <div className="field">
                  <label htmlFor="poRecvNote">หมายเหตุการรับ (ไม่บังคับ)</label>
                  <input id="poRecvNote" name="note" maxLength={200} placeholder="เช่น ของมาไม่ครบ ผู้ขายจะส่งที่เหลือสัปดาห์หน้า" />
                </div>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button className="btn btn-primary" type="submit">บันทึกการรับของ</button>
                </div>
                <p className="l3-note">สินค้าที่นับสต็อกจะเพิ่มสต็อกทันที (ประวัติ “รับของเข้า” อ้างอิง {po.poNo}) · ต้นทุนล่าสุดของสินค้าอัปเดตตามใบนี้</p>
              </>
            )}
          </form>
          {po.note && <div className="box"><h3>หมายเหตุ</h3><p style={{ whiteSpace: "pre-wrap" }}>{po.note}</p></div>}
        </div>
        <div className="d-col">
          <div className="box">
            <h3>ข้อมูลใบสั่งซื้อ</h3>
            <dl className="po-meta">
              <dt>สร้างโดย</dt><dd>{po.createdBy?.displayName ?? "—"} · {when(po.createdAt)}</dd>
              <dt>สั่งซื้อเมื่อ</dt><dd>{when(po.orderedAt)}</dd>
              <dt>รับครบเมื่อ</dt><dd>{when(po.receivedAt)}</dd>
            </dl>
            <HistoryLink entity={`PurchaseOrder:${po.id}`} />
          </div>
          <section className="cu-hist">
            <h3>ประวัติการรับของ (สต็อก)</h3>
            {moves.length ? (
              <ul id="poMoves">
                {moves.map((m) => (
                  <li key={m.id}><span>{m.product.name}<small className="sub"> {m.product.sku}</small></span><b className="num">+{m.change}</b><span className="sub">{when(m.createdAt)} · {m.admin?.displayName ?? "—"}</span></li>
                ))}
              </ul>
            ) : <p className="sub">ยังไม่มีการรับของที่เพิ่มสต็อก</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
