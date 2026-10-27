// ศูนย์แจ้งเตือนหลังบ้าน (A28) — ไม่มีตารางแจ้งเตือนแยก: สร้างจากข้อมูลจริงที่เกิดหลังเวลาที่ผู้ใช้กด "อ่านแล้ว" (Admin.notifSeenAt)
// ชนิด: คำสั่งซื้อใหม่ · สลิปรอตรวจ (คำสั่งซื้อ + ลิงก์ใบแจ้งหนี้) · คำขอจากลูกค้า · เคลม/คืนสินค้า · รีวิวรออนุมัติ · สินค้าใกล้หมด
//       · งานที่ได้รับมอบหมาย · คำขอข้อมูลส่วนบุคคล (เจ้าของร้านเท่านั้น)
//       · สินค้ากลับมามีของแต่ยังมีลูกค้าฝากแจ้งที่ร้านยังไม่ได้แจ้ง (RESTOCK — แสดงจนกว่าจะกด "แจ้งแล้ว" ที่ /admin/stock-alerts;
//         นับเป็น "ยังไม่อ่าน" เมื่อสินค้าถูกแก้/เติมสต็อกหลังเวลาที่กดอ่าน)
// unreadCount ใช้แค่ COUNT (เรียกทุก 60 วินาทีจากกระดิ่ง) · feed ดึงรายการล่าสุดของแต่ละชนิดมารวมกัน
import "server-only";
import type { CurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type NotifKind = "ORDER" | "SLIP" | "DOC_SLIP" | "INQUIRY" | "CLAIM" | "REVIEW" | "LOW_STOCK" | "RESTOCK" | "TASK" | "PDPA";
export const NOTIF_LABEL: Record<NotifKind, string> = {
  ORDER: "คำสั่งซื้อใหม่", SLIP: "สลิปรอตรวจ", DOC_SLIP: "สลิปจากใบแจ้งหนี้", INQUIRY: "คำขอจากลูกค้า", CLAIM: "เคลม/คืนสินค้า",
  REVIEW: "รีวิวรออนุมัติ", LOW_STOCK: "สินค้าใกล้หมด", RESTOCK: "สินค้ากลับมามีของ — ลูกค้ารอ", TASK: "งานที่ได้รับมอบหมาย", PDPA: "คำขอข้อมูลส่วนบุคคล",
};
export type NotifItem = { id: string; kind: NotifKind; title: string; detail: string; at: string; href: string; unread: boolean };

/** ไม่เคยกดอ่าน = นับย้อนหลัง 7 วัน */
const DEFAULT_WINDOW = 7 * 864e5;

async function sinceOf(adminId: string) {
  const a = await prisma.admin.findUnique({ where: { id: adminId }, select: { notifSeenAt: true } });
  return a?.notifSeenAt ?? new Date(Date.now() - DEFAULT_WINDOW);
}

async function threshold() {
  return (await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { lowStockThreshold: true } }))?.lowStockThreshold ?? 5;
}

/** สินค้าที่สต็อกลดลงถึงเกณฑ์หลังเวลานี้ (ข้ามจากเกินเกณฑ์ลงมา) */
async function lowStockSince(since: Date, take = 20) {
  const T = await threshold();
  return prisma.$queryRaw<{ id: string; productId: string; sku: string; name: string; balance: number; createdAt: Date }[]>`
    SELECT DISTINCT ON (m."productId") m."id", m."productId", p."sku", p."name", m."balance", m."createdAt"
    FROM "StockMovement" m JOIN "Product" p ON p."id" = m."productId"
    WHERE m."createdAt" > ${since} AND m."balance" <= ${T} AND m."balance" - m."change" > ${T} AND p."trackStock" AND p."isActive"
    ORDER BY m."productId", m."createdAt" DESC
    LIMIT ${take}`;
}

/** สินค้าที่มีของแล้ว (นับสต็อก: stock > 0 · ไม่นับ: inStock) และเปิดขาย แต่ยังมีลูกค้าฝากแจ้งที่ร้านยังไม่ได้แจ้ง */
async function waitingRestock(take = 20) {
  return prisma.$queryRaw<{ id: string; sku: string; name: string; updatedAt: Date; n: bigint }[]>`
    SELECT p."id", p."sku", p."name", p."updatedAt", COUNT(a."id") AS n
    FROM "StockAlert" a JOIN "Product" p ON p."id" = a."productId"
    WHERE a."notifiedAt" IS NULL AND p."isActive" AND (CASE WHEN p."trackStock" THEN p."stock" > 0 ELSE p."inStock" END)
    GROUP BY p."id" ORDER BY p."updatedAt" DESC
    LIMIT ${take}`;
}

/** จำนวนแจ้งเตือนที่ยังไม่อ่าน (เบา — COUNT ล้วน) */
export async function unreadCount(admin: CurrentAdmin) {
  const since = await sinceOf(admin.id);
  const T = await threshold();
  const after = { gt: since };
  const [orders, slips, docSlips, inquiries, claims, reviews, low, tasks, pdpa, restock] = await Promise.all([
    prisma.order.count({ where: { createdAt: after } }),
    prisma.paymentSlip.count({ where: { uploadedAt: after, status: "PENDING" } }),
    prisma.docSlip.count({ where: { createdAt: after, status: "PENDING" } }),
    prisma.inquiry.count({ where: { createdAt: after, status: "NEW" } }),
    prisma.claim.count({ where: { createdAt: after } }),
    prisma.review.count({ where: { createdAt: after, status: "PENDING" } }),
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT m."productId") AS n FROM "StockMovement" m JOIN "Product" p ON p."id" = m."productId"
      WHERE m."createdAt" > ${since} AND m."balance" <= ${T} AND m."balance" - m."change" > ${T} AND p."trackStock" AND p."isActive"`,
    prisma.adminTask.count({ where: { createdAt: after, assigneeId: admin.id, done: false, NOT: { createdById: admin.id } } }),
    admin.role === "OWNER" ? prisma.dataRequest.count({ where: { createdAt: after, status: "NEW" } }) : 0,
    waitingRestock(200),
  ]);
  return orders + slips + docSlips + inquiries + claims + reviews + Number(low[0]?.n ?? 0) + tasks + pdpa + restock.filter((r) => r.updatedAt > since).length;
}

const baht = (s: number) => `฿${(s / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

/** รายการแจ้งเตือนล่าสุด (รวมที่อ่านแล้วย้อนหลัง 14 วัน เพื่อให้หน้าแจ้งเตือนไม่ว่าง) */
export async function notificationFeed(admin: CurrentAdmin, limit = 40): Promise<{ items: NotifItem[]; since: Date }> {
  const since = await sinceOf(admin.id);
  const from = new Date(Math.min(since.getTime(), Date.now() - 14 * 864e5));
  const take = Math.min(limit, 30);
  const after = { gt: from };
  const [orders, slips, docSlips, inquiries, claims, reviews, low, tasks, pdpa, restock] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: after }, orderBy: { createdAt: "desc" }, take, select: { id: true, orderNo: true, customerName: true, totalSatang: true, createdAt: true, paymentMethod: true } }),
    prisma.paymentSlip.findMany({ where: { uploadedAt: after, status: "PENDING" }, orderBy: { uploadedAt: "desc" }, take, select: { id: true, uploadedAt: true, declaredAmountSatang: true, order: { select: { orderNo: true, customerName: true } } } }),
    prisma.docSlip.findMany({ where: { createdAt: after, status: "PENDING" }, orderBy: { createdAt: "desc" }, take, select: { id: true, createdAt: true, amountSatang: true, document: { select: { id: true, docNo: true, type: true } } } }),
    prisma.inquiry.findMany({ where: { createdAt: after, status: "NEW" }, orderBy: { createdAt: "desc" }, take, select: { id: true, kind: true, name: true, createdAt: true } }),
    prisma.claim.findMany({ where: { createdAt: after }, orderBy: { createdAt: "desc" }, take, select: { id: true, claimNo: true, name: true, kind: true, createdAt: true } }),
    prisma.review.findMany({ where: { createdAt: after, status: "PENDING" }, orderBy: { createdAt: "desc" }, take, select: { id: true, name: true, rating: true, createdAt: true, product: { select: { name: true } } } }),
    lowStockSince(from, take),
    prisma.adminTask.findMany({ where: { createdAt: after, assigneeId: admin.id, done: false, NOT: { createdById: admin.id } }, orderBy: { createdAt: "desc" }, take, select: { id: true, title: true, createdAt: true, createdBy: { select: { displayName: true } } } }),
    admin.role === "OWNER" ? prisma.dataRequest.findMany({ where: { createdAt: after, status: "NEW" }, orderBy: { createdAt: "desc" }, take, select: { id: true, kind: true, name: true, createdAt: true } }) : [],
    waitingRestock(take),
  ]);
  const items: (Omit<NotifItem, "at" | "unread"> & { atDate: Date })[] = [
    ...orders.map((o) => ({ id: `o-${o.id}`, kind: "ORDER" as const, title: `${NOTIF_LABEL.ORDER} ${o.orderNo}`, detail: `${o.customerName} · ${baht(o.totalSatang)}${o.paymentMethod === "COD" ? " · เก็บเงินปลายทาง" : ""}`, atDate: o.createdAt, href: `/admin?tab=ALL&open=${o.orderNo}` })),
    ...slips.map((s) => ({ id: `s-${s.id}`, kind: "SLIP" as const, title: `${NOTIF_LABEL.SLIP} ${s.order.orderNo}`, detail: `${s.order.customerName} · แจ้งโอน ${baht(s.declaredAmountSatang)}`, atDate: s.uploadedAt, href: `/admin?tab=PENDING_VERIFICATION&open=${s.order.orderNo}` })),
    ...docSlips.map((s) => ({ id: `ds-${s.id}`, kind: "DOC_SLIP" as const, title: `${NOTIF_LABEL.DOC_SLIP} ${s.document.docNo ?? ""}`.trim(), detail: `แจ้งโอน ${baht(s.amountSatang)}`, atDate: s.createdAt, href: `/admin/docs/${s.document.type}/${s.document.id}` })),
    ...inquiries.map((q) => ({ id: `i-${q.id}`, kind: "INQUIRY" as const, title: `${NOTIF_LABEL.INQUIRY} (${q.kind === "QUOTE" ? "ขอใบเสนอราคา" : q.kind === "CLAIM" ? "เคลม" : "ติดต่อ"})`, detail: q.name, atDate: q.createdAt, href: `/admin/inquiries/${q.id}` })),
    ...claims.map((c) => ({ id: `c-${c.id}`, kind: "CLAIM" as const, title: `${NOTIF_LABEL.CLAIM} ${c.claimNo}`, detail: `${c.name} · ${c.kind === "WARRANTY" ? "เคลมประกัน" : "คืน/เปลี่ยน"}`, atDate: c.createdAt, href: `/admin/claims/${c.id}` })),
    ...reviews.map((r) => ({ id: `r-${r.id}`, kind: "REVIEW" as const, title: `${NOTIF_LABEL.REVIEW} ${"★".repeat(Math.max(1, Math.min(5, r.rating)))}`, detail: `${r.product.name} · ${r.name}`, atDate: r.createdAt, href: "/admin/reviews" })),
    ...low.map((m) => ({ id: `l-${m.id}`, kind: "LOW_STOCK" as const, title: `${NOTIF_LABEL.LOW_STOCK}: ${m.name}`, detail: `${m.sku} · ${Number(m.balance) <= 0 ? "หมดแล้ว" : `เหลือ ${m.balance}`}`, atDate: m.createdAt, href: `/admin/stock/${m.productId}` })),
    ...restock.map((r) => ({ id: `rs-${r.id}`, kind: "RESTOCK" as const, title: `${NOTIF_LABEL.RESTOCK}: ${r.name}`, detail: `${r.sku} · ลูกค้ารอ ${Number(r.n)} คน — ติดต่อแล้วกด "แจ้งแล้ว"`, atDate: r.updatedAt, href: "/admin/stock-alerts" })),
    ...tasks.map((t) => ({ id: `t-${t.id}`, kind: "TASK" as const, title: `${NOTIF_LABEL.TASK}: ${t.title}`, detail: `จาก ${t.createdBy?.displayName ?? "—"}`, atDate: t.createdAt, href: "/admin/tasks" })),
    ...pdpa.map((d) => ({ id: `p-${d.id}`, kind: "PDPA" as const, title: NOTIF_LABEL.PDPA, detail: d.name, atDate: d.createdAt, href: `/admin/data-requests/${d.id}` })),
  ];
  items.sort((a, b) => b.atDate.getTime() - a.atDate.getTime());
  return {
    since,
    items: items.slice(0, limit).map(({ atDate, ...x }) => ({ ...x, at: atDate.toISOString(), unread: atDate > since })),
  };
}

export async function markAllRead(adminId: string) {
  await prisma.admin.update({ where: { id: adminId }, data: { notifSeenAt: new Date() } });
}
