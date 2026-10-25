// /admin/products/sale — ลดราคาตามเวลา (A3): ตั้งทั้งหมวด + รายการสินค้าที่ลดอยู่/ตั้งเวลาไว้/หมดแล้ว
// รายสินค้าตั้งในหน้าแก้ไขสินค้า (กล่อง "ลดราคาตามช่วงเวลา") หรือเลือกหลายรายการในหน้าสินค้า
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { bahtText } from "@/lib/format";
import { bkkText } from "@/lib/product-extras";
import { percentOff } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import "../../../lot3.css";
import { clearProductSale } from "../lot9-actions";
import { CategorySaleForm } from "./CategorySaleForm";

export default async function SalePage() {
  await requireAdmin();
  const now = new Date();
  const [cats, counts, rows] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true } }),
    prisma.product.groupBy({ by: ["categoryId"], where: { isService: false, priceSatang: { gt: 0 } }, _count: { _all: true } }),
    prisma.product.findMany({
      where: { salePriceSatang: { not: null }, isService: false },
      orderBy: [{ saleEndsAt: "asc" }, { name: "asc" }],
      select: { id: true, sku: true, name: true, isActive: true, priceSatang: true, salePriceSatang: true, saleStartsAt: true, saleEndsAt: true, category: { select: { nameTh: true } } },
      take: 500,
    }),
  ]);
  const count = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  const status = (r: (typeof rows)[number]) =>
    r.saleEndsAt && r.saleEndsAt <= now ? "ended" : r.saleStartsAt && r.saleStartsAt > now ? "scheduled" : r.salePriceSatang! < r.priceSatang ? "on" : "invalid";
  const LABEL = { on: ["ลดอยู่", "ok"], scheduled: ["ตั้งเวลาไว้", "warn"], ended: ["หมดเวลาแล้ว", ""], invalid: ["ราคาลดไม่ต่ำกว่าราคาขาย", "bad"] } as const;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/products">← สินค้าทั้งหมด</Link></p>
          <h1>ลดราคาตามเวลา</h1>
          <p>ราคาที่คิดเงินจริงคำนวณที่เซิร์ฟเวอร์ตามเวลาตอนสั่งซื้อ · หน้าร้านแสดงป้าย &quot;ลด x%&quot; ราคาเดิมขีดฆ่า และนับถอยหลังเมื่อเหลือไม่ถึง 7 วัน</p>
        </div>
      </div>
      <CategorySaleForm categories={cats.map((c) => ({ id: c.id, name: c.nameTh, count: count.get(c.id) ?? 0 }))} />
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="toolbar"><b>สินค้าที่ตั้งราคาลด ({rows.length})</b></div>
        {rows.length ? (
          <table className="tbl" id="saleTable">
            <thead>
              <tr><th>สินค้า</th><th className="r">ราคาปกติ</th><th className="r">ราคาลด</th><th>ช่วงเวลา</th><th>สถานะ</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = status(r);
                return (
                  <tr key={r.id} className={r.isActive ? "" : "row-off"} data-sku={r.sku}>
                    <td>
                      <a className="row-link" href={`/admin/products/${r.id}`}>
                        <b>{r.name}</b>
                        <span className="sub">{r.sku} · {r.category.nameTh}</span>
                      </a>
                    </td>
                    <td className="r num">{bahtText(r.priceSatang)}</td>
                    <td className="r num">
                      {bahtText(r.salePriceSatang!)} <span className="sub">(-{percentOff(r.salePriceSatang!, r.priceSatang)}%)</span>
                    </td>
                    <td className="sub" style={{ fontSize: 13 }}>
                      {r.saleStartsAt ? bkkText(r.saleStartsAt) : "ทันที"} → {r.saleEndsAt ? bkkText(r.saleEndsAt) : "ไม่กำหนด"}
                    </td>
                    <td><span className={`chip ${LABEL[st][1]}`}>{LABEL[st][0]}</span></td>
                    <td className="r">
                      <form action={clearProductSale}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmSubmit className="btn btn-ghost btn-sm" title="ยกเลิกราคาลด?" body={`${r.name} จะกลับเป็นราคาปกติ`} confirmLabel="ยกเลิกราคาลด">
                          ยกเลิก
                        </ConfirmSubmit>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty"><b>ยังไม่มีสินค้าที่ตั้งราคาลด</b>ตั้งทั้งหมวดด้านบน หรือตั้งรายสินค้าในหน้าแก้ไขสินค้า</div>
        )}
      </section>
    </main>
  );
}
