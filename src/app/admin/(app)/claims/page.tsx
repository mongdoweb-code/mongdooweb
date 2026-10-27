// /admin/claims — คิวเคลม/คืนสินค้า (A16) แยกตามสถานะ เรียงเก่าสุดก่อนในงานค้าง · ค้นหาเลขที่/ชื่อ/เบอร์/คำสั่งซื้อ
import Link from "next/link";
import type { ClaimStatus, Prisma } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { CLAIM_KIND, CLAIM_STATUS, CLAIM_STATUS_CLS, isClaimStatus, parseClaimItems } from "@/lib/claims";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import "../coupons/coupons.css";

const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const TABS: (ClaimStatus | "OPEN" | "ALL")[] = ["OPEN", "NEW", "REVIEWING", "APPROVED", "RESOLVED", "REJECTED", "ALL"];
const TAB_LABEL = (t: string) => (t === "OPEN" ? "งานค้าง" : t === "ALL" ? "ทั้งหมด" : CLAIM_STATUS[t as ClaimStatus]);

export default async function ClaimsPage({ searchParams }: PageProps<"/admin/claims">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && (TABS as string[]).includes(sp.tab) ? sp.tab : "OPEN";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const digits = q.replace(/\D/g, "");
  const where: Prisma.ClaimWhereInput = {
    ...(tab === "OPEN" ? { status: { in: ["NEW", "REVIEWING", "APPROVED"] } } : tab !== "ALL" && isClaimStatus(tab) ? { status: tab } : {}),
    ...(q ? { OR: [{ claimNo: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { order: { orderNo: { contains: q, mode: "insensitive" } } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] } : {}),
  };
  const [rows, counts] = await Promise.all([
    prisma.claim.findMany({ where, orderBy: { createdAt: tab === "OPEN" ? "asc" : "desc" }, take: 200, include: { order: { select: { orderNo: true } } } }),
    prisma.claim.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const cnt = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number>;
  const count = (t: string) => (t === "ALL" ? Object.values(cnt).reduce((a, b) => a + b, 0) : t === "OPEN" ? (cnt.NEW ?? 0) + (cnt.REVIEWING ?? 0) + (cnt.APPROVED ?? 0) : cnt[t] ?? 0);
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>เคลม / คืนสินค้า</h1>
          <p>เรื่องที่ลูกค้าแจ้งจากหน้า /claim — ข้อความถึงลูกค้าแสดงในหน้าติดตามคำสั่งซื้อ</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/claim" target="_blank" rel="noopener">เปิดหน้าแจ้งเคลม</a>
        </div>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <a key={t} className={`tab ${tab === t ? "on" : ""}`} role="tab" aria-selected={tab === t} href={`/admin/claims?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
                {TAB_LABEL(t)} <em>{count(t)}</em>
              </a>
            ))}
          </div>
          <form className="search" role="search" action="/admin/claims">
            <input type="hidden" name="tab" value={tab} />
            <label className="sr-only" htmlFor="cq">ค้นหาเคลม</label>
            <input id="cq" name="q" type="search" defaultValue={q} placeholder="ค้นหาเลขที่ CL, ชื่อ, เบอร์, คำสั่งซื้อ" />
          </form>
        </div>
        <table className="tbl" id="claimTable">
          <thead><tr><th>เลขที่ / วันที่</th><th>ลูกค้า</th><th>ประเภท</th><th>สินค้า</th><th>สิทธิ์</th><th>สถานะ</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Link className="link num" href={`/admin/claims/${c.id}`}><b>{c.claimNo}</b></Link><span className="sub">{fmt(c.createdAt)}{c.order ? ` · ${c.order.orderNo}` : ""}</span></td>
                <td>{c.name}<span className="sub">{formatPhone(c.phone)}</span></td>
                <td>{CLAIM_KIND[c.kind]}</td>
                <td className="sub">{parseClaimItems(c.items).map((i) => `${i.name} × ${i.qty}`).join(", ")}</td>
                <td>{c.inWarranty == null ? "—" : c.inWarranty ? <span className="chip ok">{c.kind === "RETURN" ? "ใน 7 วัน" : "ในประกัน"}</span> : <span className="chip bad">{c.kind === "RETURN" ? "เลย 7 วัน" : "หมดประกัน"}</span>}</td>
                <td><span className={`chip ${CLAIM_STATUS_CLS[c.status]}`}>{CLAIM_STATUS[c.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>ไม่มีเรื่องเคลมในหมวดนี้</b></div>}
      </section>
    </main>
  );
}
