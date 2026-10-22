// /admin/data-requests — คิวคำขอข้อมูลส่วนบุคคล (A24, เจ้าของร้าน) · ต้องตอบภายใน 30 วัน (PDPA ม.30)
import Link from "next/link";
import type { DataRequestStatus } from "../../../../../generated/prisma/client";
import { requireOwner } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { DR_KIND, DR_STATUS } from "@/lib/pdpa";
import { prisma } from "@/lib/prisma";
import "../../lot12.css";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const day = (d: Date) => d.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

export default async function DataRequestsPage({ searchParams }: PageProps<"/admin/data-requests">) {
  await requireOwner();
  const sp = await searchParams;
  const status = (one(sp.status) in DR_STATUS ? one(sp.status) : "NEW") as DataRequestStatus;
  const [rows, counts] = await Promise.all([
    prisma.dataRequest.findMany({ where: { status }, orderBy: { createdAt: status === "NEW" ? "asc" : "desc" }, take: 200 }),
    prisma.dataRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const cnt = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const now = new Date().getTime();
  return (
    <main className="main" id="page-pdpa">
      <div className="page-head">
        <div><h1>คำขอข้อมูลส่วนบุคคล (PDPA)</h1><p>คำขอจากหน้า <a className="link" href="/privacy/request" target="_blank" rel="noopener">/privacy/request</a> — ยืนยันตัวตนก่อนส่งข้อมูล และตอบภายใน 30 วัน</p></div>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {(Object.keys(DR_STATUS) as DataRequestStatus[]).map((s) => (
              <Link key={s} className={`tab ${status === s ? "on" : ""}`} role="tab" aria-selected={status === s} href={`/admin/data-requests${s === "NEW" ? "" : `?status=${s}`}`}>
                {DR_STATUS[s][0]} {cnt(s) ? <span className="cnt">{cnt(s)}</span> : null}
              </Link>
            ))}
          </div>
        </div>
        <table className="tbl" id="drTable">
          <thead><tr><th>วันที่ขอ</th><th>ผู้ขอ</th><th>ประเภท</th><th>{status === "NEW" ? "ครบกำหนด" : "ดำเนินการ"}</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const due = r.createdAt.getTime() + 30 * 864e5;
              const left = Math.ceil((due - now) / 864e5);
              return (
                <tr key={r.id}>
                  <td className="sub">{day(r.createdAt)}</td>
                  <td><Link className="row-link" href={`/admin/data-requests/${r.id}`}><b>{r.name}</b><span className="sub">{formatPhone(r.phone)}{r.email ? ` · ${r.email}` : ""}</span></Link></td>
                  <td>{DR_KIND[r.kind]}</td>
                  <td>{status === "NEW" ? <span className={`dst dst-${left < 7 ? "bad" : "pend"}`}>{left >= 0 ? `อีก ${left} วัน` : `เกิน ${-left} วัน`}</span> : <span className="sub">{r.handledAt ? day(r.handledAt) : "—"} · {r.handledBy ?? "—"}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><b>ไม่มีคำขอในสถานะนี้</b></div>}
      </section>
    </main>
  );
}
