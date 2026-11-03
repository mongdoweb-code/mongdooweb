// /admin/print/count/:id — ใบนับสต็อก A4 (ช่องว่างให้เขียนยอดนับ; รอบที่ปรับแล้วพิมพ์ยอดนับ/ส่วนต่าง) · ?auto=1 เปิดหน้าต่างพิมพ์
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { PrintBar } from "../../po/[id]/PrintBar";
import "../../../lot12.css";

export async function generateMetadata({ params }: PageProps<"/admin/print/count/[id]">): Promise<Metadata> {
  await requireAdmin();
  const { id } = await params;
  const c = await prisma.stockCount.findUnique({ where: { id }, select: { countNo: true } });
  return { title: { absolute: c?.countNo ?? "ใบนับสต็อก" } };
}

const date = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });

export default async function PrintCountPage({ params, searchParams }: PageProps<"/admin/print/count/[id]">) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await prisma.stockCount.findUnique({
    where: { id },
    include: { lines: { include: { product: { select: { sku: true, name: true, unit: true, category: { select: { nameTh: true } } } } } }, createdBy: { select: { displayName: true } } },
  });
  if (!c) notFound();
  const s = await getSettings();
  const done = c.status !== "OPEN";
  // เรียงตามหมวดแล้วชื่อ — เดินนับเป็นโซนได้ง่าย
  const lines = [...c.lines].sort((a, b) => (a.product.category?.nameTh ?? "").localeCompare(b.product.category?.nameTh ?? "", "th") || a.product.name.localeCompare(b.product.name, "th"));
  return (
    <div className="pp">
      <style>{"@page{size:A4;margin:10mm}"}</style>
      <PrintBar title={c.countNo} back={`/admin/stock/count/${c.id}`} auto={sp.auto === "1"} hint="ใบนับสต็อก A4" />
      <div className="pp-body">
        <div className="pp-sheets">
          <article className="sheet po-sheet cnt-sheet" id="countPrint">
            <header className="po-h cnt-h">
              <div className="po-shop"><b>{s.legalName}</b><span>{c.title}</span></div>
              <div />
              <div className="po-title">
                <h2>ใบนับสต็อก</h2>
                <dl><dt>เลขที่</dt><dd>{c.countNo}</dd><dt>วันที่เปิดรอบ</dt><dd>{date(c.createdAt)}</dd><dt>รายการ</dt><dd>{lines.length}</dd></dl>
              </div>
            </header>
            <table className="po-tbl">
              <thead>
                <tr><th className="c" style={{ width: "8mm" }}>#</th><th style={{ width: "30mm" }}>รหัส</th><th>สินค้า</th><th style={{ width: "30mm" }}>หมวด</th><th className="r" style={{ width: "20mm" }}>ในระบบ</th><th className="r" style={{ width: "24mm" }}>นับได้</th>{done && <th className="r" style={{ width: "18mm" }}>ต่าง</th>}</tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="c">{i + 1}</td>
                    <td>{l.product.sku}</td>
                    <td>{l.product.name}</td>
                    <td>{l.product.category?.nameTh ?? ""}</td>
                    <td className="r">{l.expected}{l.product.unit ? ` ${l.product.unit}` : ""}</td>
                    <td className="r">{l.counted ?? ""}</td>
                    {done && <td className="r">{l.counted === null ? "" : l.counted - l.expected > 0 ? `+${l.counted - l.expected}` : l.counted - l.expected || ""}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="po-sign">
              <div><span /><small>ผู้นับ / วันที่</small></div>
              <div><span /><small>ผู้ตรวจ / วันที่</small></div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
