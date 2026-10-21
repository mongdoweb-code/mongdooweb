// /admin/stock/:id — สต็อกของสินค้าหนึ่งรายการ: ปรับสต็อก + ประวัติทั้งหมด + ตรวจว่ายอดคงเหลือ = ผลรวมการเคลื่อนไหว
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ledgerCheck } from "@/lib/stock";
import { MoveTable } from "../MoveTable";
import { AdjustForm, StartTrackingForm } from "../StockForms";
import "../../../lot3.css";

export default async function StockProductPage({ params, searchParams }: PageProps<"/admin/stock/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const started = (await searchParams).started;
  const p = await prisma.product.findUnique({ where: { id }, select: { id: true, sku: true, name: true, stock: true, trackStock: true, isActive: true, inStock: true, category: { select: { nameTh: true } } } });
  if (!p) notFound();
  const [moves, check, s] = await Promise.all([
    prisma.stockMovement.findMany({ where: { productId: id }, orderBy: { createdAt: "desc" }, take: 300, include: { product: { select: { id: true, name: true, sku: true } }, admin: { select: { displayName: true } } } }),
    ledgerCheck(id),
    prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { lowStockThreshold: true } }),
  ]);
  const T = s?.lowStockThreshold ?? 5;

  return (
    <main className="main" id="page-stock-item">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/stock">← สต็อกสินค้า</Link></p>
          <h1>{p.name}</h1>
          <p>{p.sku} · {p.category.nameTh}{p.isActive ? "" : " · ปิดขาย"}</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href={`/admin/products/${p.id}`}>แก้ไขสินค้า</Link>
        </div>
      </div>

      <div className="l3-cols">
        <section className="l3-panel">
          {p.trackStock ? (
            <>
              <div className="l3-kpi" style={{ padding: "0 0 14px", borderTop: 0 }}>
                <span>คงเหลือ</span>
                <b className="num" id="stockNow">{p.stock}</b>
                <small>
                  {p.stock <= 0 ? <span className="chip bad">หมด</span> : p.stock <= T ? <span className="chip warn">ใกล้หมด (≤ {T})</span> : `เกณฑ์ใกล้หมด ≤ ${T}`}
                </small>
              </div>
              {typeof started === "string" && /^\d+$/.test(started) && (
                <div className="login-info" role="status" style={{ marginBottom: 12 }}>เริ่มนับสต็อกแล้ว คงเหลือ {started}</div>
              )}
              <h2 style={{ marginBottom: 10 }}>ปรับสต็อก</h2>
              <AdjustForm productId={p.id} stock={p.stock} />
            </>
          ) : (
            <>
              <h2 style={{ marginBottom: 10 }}>ยังไม่นับสต็อก</h2>
              <StartTrackingForm productId={p.id} />
            </>
          )}
        </section>
        <section className="l3-panel">
          <h2>ตรวจความถูกต้อง</h2>
          {check.moves ? (
            check.ok ? (
              <div className="ok-box" id="ledgerOk" style={{ marginTop: 10 }}>✓ ยอดคงเหลือ {check.stock} = ผลรวมการเคลื่อนไหว {check.sum} ({check.moves} รายการ)</div>
            ) : (
              <div className="err-box" id="ledgerBad" style={{ marginTop: 10 }}>
                ยอดคงเหลือ {check.stock} ไม่ตรงกับผลรวมการเคลื่อนไหว {check.sum} — นับสต็อกจริงแล้วบันทึกแบบ &quot;นับสต็อก&quot; เพื่อปรับให้ตรง
              </div>
            )
          ) : (
            <p className="l3-note" style={{ marginTop: 6 }}>ยังไม่มีประวัติ — ยอดปัจจุบันจะถูกบันทึกเป็น &quot;ยอดยกมา&quot; เมื่อมีการเคลื่อนไหวครั้งแรก</p>
          )}
          <p className="l3-note" style={{ marginTop: 12 }}>ระบบตัดสต็อกเมื่อยืนยันการชำระเงิน และคืนสต็อกเมื่อยกเลิกคำสั่งซื้อที่ชำระแล้ว ทุกครั้งมีบันทึกด้านล่าง</p>
        </section>
      </div>

      <section className="l3-panel">
        <div className="l3-ph"><div><h2>ประวัติการเคลื่อนไหว</h2><p>{moves.length} รายการล่าสุด</p></div></div>
        {moves.length ? <MoveTable rows={moves} /> : <div className="empty"><b>ยังไม่มีประวัติ</b></div>}
      </section>
    </main>
  );
}
