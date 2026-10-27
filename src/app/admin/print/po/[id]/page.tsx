// /admin/print/po/:id — ใบสั่งซื้อ (PO) A4 สำหรับส่งผู้ขาย (?auto=1 เปิดหน้าต่างพิมพ์ทันที) — เจ้าของร้านเท่านั้น (มีต้นทุน)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { PrintBar } from "./PrintBar";
import "../../../lot12.css";

export async function generateMetadata({ params }: PageProps<"/admin/print/po/[id]">): Promise<Metadata> {
  await requireOwner();
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { poNo: true } });
  return { title: { absolute: po?.poNo ?? "ใบสั่งซื้อ" } };
}

const money = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (d: Date | null) => (d ? d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }) : "—");

export default async function PrintPoPage({ params, searchParams }: PageProps<"/admin/print/po/[id]">) {
  await requireOwner();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: { orderBy: { id: "asc" }, include: { product: { select: { sku: true, unit: true } } } }, createdBy: { select: { displayName: true } } } });
  if (!po || !po.poNo) notFound();
  const s = await getSettings();
  const logo = mediaUrl(s.logoKey) ?? "/img/doc-logo.png";
  return (
    <div className="pp">
      <style>{"@page{size:A4;margin:0}"}</style>
      <PrintBar title={po.poNo} back={`/admin/purchase-orders/${po.id}`} auto={sp.auto === "1"} />
      <div className="pp-body">
        <div className="pp-sheets">
          <article className="sheet po-sheet" id="poSheet">
            <header className="po-h">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" width={64} height={64} />
              <div className="po-shop">
                <b>{s.legalName}</b>
                <span>{s.addressText}</span>
                <span>โทร {s.phone}{s.email ? ` · ${s.email}` : ""}{s.lineId ? ` · LINE ${s.lineId}` : ""}</span>
                {s.taxId && <span>เลขประจำตัวผู้เสียภาษี {s.taxId}{s.branch ? ` (${s.branch})` : ""}</span>}
              </div>
              <div className="po-title">
                <h2>ใบสั่งซื้อ</h2>
                <small>PURCHASE ORDER</small>
                <dl>
                  <dt>เลขที่</dt><dd>{po.poNo}</dd>
                  <dt>วันที่</dt><dd>{date(po.orderedAt)}</dd>
                </dl>
              </div>
            </header>
            <section className="po-to">
              <span>ผู้ขาย</span>
              <b>{po.supplierName}</b>
              {po.supplierContact && <span>{po.supplierContact}</span>}
            </section>
            <table className="po-tbl">
              <thead><tr><th style={{ width: "8%" }}>ลำดับ</th><th>รายการ</th><th style={{ width: "12%" }}>จำนวน</th><th style={{ width: "17%" }}>ราคา/หน่วย</th><th style={{ width: "17%" }}>จำนวนเงิน</th></tr></thead>
              <tbody>
                {po.items.map((it, i) => (
                  <tr key={it.id}>
                    <td className="c">{i + 1}</td>
                    <td>{it.name}{it.product?.sku ? <small> ({it.product.sku})</small> : null}</td>
                    <td className="r">{it.qty.toLocaleString("th-TH")} {it.product?.unit ?? ""}</td>
                    <td className="r">{money(it.costSatang)}</td>
                    <td className="r">{money(it.qty * it.costSatang)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={4} className="r">รวมทั้งสิ้น (บาท)</td><td className="r"><b>{money(po.totalSatang)}</b></td></tr></tfoot>
            </table>
            {po.note && <p className="po-note"><b>หมายเหตุ:</b> {po.note}</p>}
            <footer className="po-sign">
              <div><span /><small>ผู้สั่งซื้อ ({po.createdBy?.displayName ?? s.legalName})</small></div>
              <div><span /><small>ผู้อนุมัติ</small></div>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
