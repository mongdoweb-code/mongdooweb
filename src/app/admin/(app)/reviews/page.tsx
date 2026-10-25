// /admin/reviews — ตรวจรีวิวสินค้า (A4): รออนุมัติ / แสดงอยู่ / ซ่อน — อนุมัติ ซ่อน ตอบกลับ ลบ (เจ้าของร้าน)
import Link from "next/link";
import type { Prisma, ReviewStatus } from "../../../../../generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { REVIEW_STATUS } from "@/lib/reviews";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { deleteReview, replyReview, setReviewStatus } from "./actions";
import "../_lot10/lot10.css";

const PER = 30;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const TABS = ["PENDING", "APPROVED", "HIDDEN", "ALL"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { PENDING: "รออนุมัติ", APPROVED: "แสดงอยู่", HIDDEN: "ซ่อน", ALL: "ทั้งหมด" };
const DONE: Record<string, string> = {
  approved: "อนุมัติแล้ว — แสดงในหน้าสินค้าแล้ว",
  hidden: "ซ่อนรีวิวแล้ว",
  status: "เปลี่ยนสถานะแล้ว",
  replied: "บันทึกคำตอบแล้ว",
  deleted: "ลบรีวิวแล้ว",
  missing: "ไม่พบรีวิวนี้ (อาจถูกลบไปแล้ว)",
};
const CLS: Record<ReviewStatus, string> = { PENDING: "new", APPROVED: "ok", HIDDEN: "gray" };

const stars = (n: number) => (
  <span className="l10-stars" role="img" aria-label={`${n} ดาว`}>
    {"★".repeat(n)}
    <i>{"★".repeat(5 - n)}</i>
  </span>
);

export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as Tab) : "PENDING";
  const q = one(sp.q).trim().slice(0, 80);
  const base: Prisma.ReviewWhereInput = q
    ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }, { product: { sku: { contains: q, mode: "insensitive" } } }] }
    : {};
  const where = { ...base, ...(tab === "ALL" ? {} : { status: tab }) };
  const [total, counts] = await Promise.all([prisma.review.count({ where }), prisma.review.groupBy({ by: ["status"], where: base, _count: true })]);
  const cnt = (t: Tab) => counts.filter((c) => t === "ALL" || c.status === t).reduce((s, c) => s + c._count, 0);
  const pages = Math.max(1, Math.ceil(total / PER));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const rows = await prisma.review.findMany({
    where,
    orderBy: { createdAt: tab === "PENDING" ? "asc" : "desc" },
    skip: (page - 1) * PER,
    take: PER,
    include: { product: { select: { name: true, sku: true, slug: true, ratingAvg: true, ratingCount: true } } },
  });
  const orders = await prisma.order.findMany({ where: { id: { in: rows.map((r) => r.orderId).filter((x): x is string => !!x) } }, select: { id: true, orderNo: true } });
  const qs = (patch: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries({ tab: tab === "PENDING" ? "" : tab, q, page: page > 1 ? String(page) : "", ...patch }).filter(([, v]) => v)).toString();
    return `/admin/reviews${s ? `?${s}` : ""}`;
  };
  const self = qs({});
  const done = DONE[one(sp.done)];

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>รีวิวสินค้า</h1>
          <p>รีวิวจากผู้ซื้อจริง (ยืนยันด้วยเลขที่คำสั่งซื้อ + เบอร์) — แสดงในหน้าสินค้าเมื่ออนุมัติแล้วเท่านั้น คะแนนเฉลี่ยคำนวณใหม่อัตโนมัติ</p>
        </div>
      </div>
      {done && (
        <div className={one(sp.done) === "missing" ? "l10-err" : "ok-box l10-ok"} role="status">
          {done}
        </div>
      )}
      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <Link key={t} className={`tab ${tab === t ? "on" : ""}`} role="tab" aria-selected={tab === t} href={qs({ tab: t === "PENDING" ? "" : t, page: "" })}>
                {TAB_LABEL[t]} <em>{cnt(t)}</em>
              </Link>
            ))}
          </div>
        </div>
        <form className="toolbar2" action="/admin/reviews" role="search">
          {tab !== "PENDING" && <input type="hidden" name="tab" value={tab} />}
          <label className="sr-only" htmlFor="rq">ค้นหารีวิว</label>
          <input id="rq" className="sel inq-q" name="q" type="search" defaultValue={q} placeholder="ชื่อผู้รีวิว, ข้อความ, ชื่อสินค้า, SKU" />
          <button className="btn btn-dark btn-sm" type="submit">ค้นหา</button>
        </form>
        <ul className="l10-list" id="reviewList">
          {rows.map((r) => (
            <li key={r.id} className="l10-row" data-review={r.id}>
              <div>
                <div>
                  {stars(r.rating)} <b>{r.name}</b> <span className={`chip ${CLS[r.status]}`}>{REVIEW_STATUS[r.status]}</span>
                </div>
                <span className="sub">
                  <a className="link" href={`/product/${r.product.slug}`} target="_blank" rel="noopener">{r.product.name}</a> ({r.product.sku}) · คำสั่งซื้อ{" "}
                  {orders.find((o) => o.id === r.orderId)?.orderNo ?? "—"} · {formatPhone(r.phone)} · {fmt(r.createdAt)}
                </span>
                <p className="l10-body">{r.body}</p>
                {r.images.length > 0 && (
                  <div className="l10-thumbs">
                    {r.images.map((k, i) => (
                      <a key={i} href={mediaUrl(k)!} target="_blank" rel="noopener">
                        {/* eslint-disable-next-line @next/next/no-img-element -- รูปรีวิวจาก /media (แอดมินเปิดได้แม้ยังไม่อนุมัติ) */}
                        <img src={mediaUrl(k, "sm")!} alt={`รูปรีวิวที่ ${i + 1}`} />
                      </a>
                    ))}
                  </div>
                )}
                {r.reply && <div className="l10-reply-old"><b>ร้านตอบ:</b> {r.reply}</div>}
                <details>
                  <summary className="link">{r.reply ? "แก้คำตอบ" : "ตอบกลับ"}</summary>
                  <form action={replyReview} className="l10-reply">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={self} />
                    <label className="sr-only" htmlFor={`rp-${r.id}`}>คำตอบของร้าน</label>
                    <textarea id={`rp-${r.id}`} name="reply" defaultValue={r.reply ?? ""} maxLength={1500} placeholder="ขอบคุณลูกค้า / ตอบคำถาม (แสดงใต้รีวิวในหน้าสินค้า)" />
                    <div>
                      <button className="btn btn-dark btn-sm" type="submit">บันทึกคำตอบ</button>
                    </div>
                  </form>
                </details>
              </div>
              <div className="l10-row-acts">
                {r.status !== "APPROVED" && (
                  <form action={setReviewStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="APPROVED" />
                    <input type="hidden" name="back" value={self} />
                    <button className="btn btn-ok btn-sm" type="submit">อนุมัติ</button>
                  </form>
                )}
                {r.status !== "HIDDEN" && (
                  <form action={setReviewStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="HIDDEN" />
                    <input type="hidden" name="back" value={self} />
                    <button className="btn btn-outline btn-sm" type="submit">ซ่อน</button>
                  </form>
                )}
                {admin.role === "OWNER" && (
                  <form action={deleteReview}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={self} />
                    <ConfirmSubmit title="ลบรีวิว" body="ลบรีวิวนี้และรูปถาวร (ย้อนกลับไม่ได้) — ถ้าแค่ไม่อยากแสดง ให้กด “ซ่อน” แทน" confirmLabel="ลบรีวิว" className="btn btn-ghost btn-sm">
                      ลบ
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!rows.length && (
          <div className="empty">
            <b>{q ? "ไม่พบรีวิวตามที่ค้นหา" : tab === "PENDING" ? "ไม่มีรีวิวรออนุมัติ" : "ยังไม่มีรีวิว"}</b>
            ลูกค้าเขียนรีวิวได้ที่หน้าสินค้า หลังร้านยืนยันการชำระเงินแล้ว
          </div>
        )}
        {total > PER && (
          <div className="tbl-foot">
            <span>ทั้งหมด {total} รายการ</span>
            <div className="pager">
              {page > 1 && <Link className="btn btn-outline btn-sm" href={qs({ page: String(page - 1) })}>← ก่อนหน้า</Link>}
              <span className="num">หน้า {page}/{pages}</span>
              {page < pages && <Link className="btn btn-outline btn-sm" href={qs({ page: String(page + 1) })}>ถัดไป →</Link>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
