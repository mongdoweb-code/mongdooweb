// /admin/stock/count/:id — กรอกยอดนับของรอบ (เปิดอยู่) หรือดูผลการปรับ (ปิดแล้ว)
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../../../_components/AdminClient";
import { cancelCountAction, saveCountForm } from "../actions";
import { CountSheet, type CountRow } from "./CountSheet";
import "../../../../lot3.css";

export const instant = false;
const ST = { OPEN: ["กำลังนับ", "pend"], APPLIED: ["ปรับสต็อกแล้ว", "ok"], CANCELLED: ["ยกเลิก", "void"] } as const;
const when = (d: Date | null) => (d ? d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "—");

export default async function StockCountPage({ params, searchParams }: PageProps<"/admin/stock/count/[id]">) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await prisma.stockCount.findUnique({
    where: { id },
    include: {
      lines: { include: { product: { select: { sku: true, name: true, stock: true, category: { select: { nameTh: true } } } } } },
      createdBy: { select: { displayName: true } },
      appliedBy: { select: { displayName: true } },
    },
  });
  if (!c) notFound();
  const open = c.status === "OPEN";
  const rows: CountRow[] = c.lines
    .map((l) => ({ productId: l.productId, sku: l.product.sku, name: l.product.name, cat: l.product.category?.nameTh ?? "", expected: l.expected, current: l.product.stock, counted: l.counted, applied: l.applied }))
    .sort((a, b) => a.cat.localeCompare(b.cat, "th") || a.name.localeCompare(b.name, "th"));
  const [label, cls] = ST[c.status];
  const err = typeof sp.err === "string" ? sp.err : "";

  return (
    <main className="main" id="page-count-one">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/stock/count">← รอบนับสต็อกทั้งหมด</Link></p>
          <h1>{c.title}</h1>
          <p><span className={`dst dst-${cls}`} id="countStatus">{label}</span> · <span className="num">{c.countNo}</span> · เปิดโดย {c.createdBy?.displayName ?? "—"} {when(c.createdAt)}{c.appliedAt ? ` · ปรับโดย ${c.appliedBy?.displayName ?? "—"} ${when(c.appliedAt)}` : ""}</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href={`/admin/print/count/${c.id}?auto=1`} target="_blank" rel="noopener">พิมพ์ใบนับ</a>
          {c.status === "APPLIED" && <Link className="btn btn-outline" href={`/admin/stock?tab=moves&reason=COUNT`}>ดูประวัติสต็อก</Link>}
          {open && (
            <form action={cancelCountAction}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmSubmit className="btn btn-ghost" title="ยกเลิกรอบนับนี้?" body="ยอดที่กรอกไว้จะไม่ถูกนำไปปรับสต็อก" confirmLabel="ยกเลิกรอบนับ">ยกเลิกรอบนับ</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
      {sp.saved !== undefined && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>บันทึกยอดนับแล้ว ({sp.saved} รายการเปลี่ยน) — กลับมานับต่อได้ทุกเมื่อ</div>}
      {sp.applied === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>ปรับสต็อกตามยอดนับแล้ว — บันทึกในประวัติสต็อกอ้างอิง {c.countNo}</div>}
      {err && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <CountSheet key={c.updatedAt.toISOString()} id={c.id} rows={rows} open={open} action={saveCountForm} />
    </main>
  );
}
