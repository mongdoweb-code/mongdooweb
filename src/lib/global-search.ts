// ค้นหาทั้งระบบหลังบ้าน (A27, Ctrl+K หรือ /) — คำสั่งซื้อ เอกสารขาย ลูกค้า สินค้า ใบสั่งซื้อ + ทางลัดไปหน้าต่างๆ
// ตามสิทธิ์: พนักงานไม่เห็นหน้าเฉพาะเจ้าของร้าน/คำขอ PDPA และไม่มีข้อมูลต้นทุนในผลค้นหาเลย
import "server-only";
import type { CurrentAdmin } from "@/lib/auth";
import { phoneDigits } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type SearchHit = { group: string; title: string; detail: string; href: string };

const ORDER_ST: Record<string, string> = { AWAITING_SLIP: "รอโอน", PENDING_VERIFICATION: "รอตรวจสลิป", PAID: "ชำระแล้ว", SHIPPED: "จัดส่งแล้ว", REJECTED: "สลิปไม่ผ่าน", CANCELLED: "ยกเลิก" };
const DOC_TH: Record<string, string> = { QUOTATION: "ใบเสนอราคา", INVOICE: "ใบแจ้งหนี้", RECEIPT: "ใบเสร็จ" };

/** หน้าหลังบ้านสำหรับ "ไปที่…" (ownerOnly = เฉพาะเจ้าของร้าน) */
const PAGES: { label: string; href: string; words: string; ownerOnly?: boolean }[] = [
  { label: "ภาพรวม", href: "/admin/dashboard", words: "dashboard ภาพรวม แดชบอร์ด" },
  { label: "คำสั่งซื้อ", href: "/admin", words: "orders คำสั่งซื้อ ออเดอร์ สลิป" },
  { label: "สร้างคำสั่งซื้อ", href: "/admin/orders/new", words: "new order สร้างคำสั่งซื้อ" },
  { label: "คำขอจากลูกค้า", href: "/admin/inquiries", words: "inquiries คำขอ ติดต่อ" },
  { label: "สินค้า", href: "/admin/products", words: "products สินค้า" },
  { label: "สต็อก", href: "/admin/stock", words: "stock สต็อก คลัง" },
  { label: "ใบสั่งซื้อ (PO)", href: "/admin/purchase-orders", words: "purchase order po ใบสั่งซื้อ ผู้ขาย รับของ" },
  { label: "ต้นทุนสินค้า", href: "/admin/purchase-orders/costs", words: "cost ต้นทุน", ownerOnly: true },
  { label: "ลูกค้า", href: "/admin/customers", words: "customers ลูกค้า แท็ก" },
  { label: "ใบเสนอราคา", href: "/admin/docs/QUOTATION", words: "quotation ใบเสนอราคา qt" },
  { label: "ใบแจ้งหนี้", href: "/admin/docs/INVOICE", words: "invoice ใบแจ้งหนี้ iv" },
  { label: "ใบเสร็จรับเงิน", href: "/admin/docs/RECEIPT", words: "receipt ใบเสร็จ rc" },
  { label: "รายงานยอดขาย", href: "/admin/reports", words: "reports รายงาน ยอดขาย" },
  { label: "รายงานกำไร", href: "/admin/reports/profit", words: "profit กำไร", ownerOnly: true },
  { label: "งานที่ต้องทำ", href: "/admin/tasks", words: "tasks งาน todo" },
  { label: "การแจ้งเตือน", href: "/admin/notifications", words: "notifications แจ้งเตือน" },
  { label: "บันทึกการใช้งาน", href: "/admin/log", words: "log บันทึก ประวัติ" },
  { label: "ตรวจรูปภาพ", href: "/admin/media", words: "media images รูป รูปย่อ" },
  { label: "ตั้งค่าร้าน", href: "/admin/settings", words: "settings ตั้งค่า", ownerOnly: true },
  { label: "สำรองข้อมูล", href: "/admin/backups", words: "backup สำรองข้อมูล", ownerOnly: true },
  { label: "คำขอข้อมูลส่วนบุคคล (PDPA)", href: "/admin/data-requests", words: "pdpa ข้อมูลส่วนบุคคล คำขอ ลบข้อมูล", ownerOnly: true },
  { label: "ผู้ใช้หลังบ้าน", href: "/admin/users", words: "users ผู้ใช้", ownerOnly: true },
];

const money = (s: number) => `฿${(s / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

export async function globalSearch(qRaw: string, admin: CurrentAdmin, per = 5): Promise<SearchHit[]> {
  const q = qRaw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const owner = admin.role === "OWNER";
  const d = phoneDigits(q);
  const phone = d.length >= 4 ? d : null;
  const ci = { contains: q, mode: "insensitive" as const };
  const [orders, docs, customers, products, pos] = await Promise.all([
    prisma.order.findMany({
      where: { OR: [{ orderNo: ci }, { customerName: ci }, ...(phone ? [{ phone: { contains: phone } }] : []), { trackingNo: ci }] },
      orderBy: { createdAt: "desc" }, take: per, select: { orderNo: true, customerName: true, totalSatang: true, status: true },
    }),
    prisma.$queryRaw<{ id: string; type: string; docNo: string | null; name: string | null; grandSatang: number }[]>`
      SELECT "id", "type"::text AS "type", "docNo", "customerSnapshot"->>'name' AS "name", "grandSatang" FROM "SalesDocument"
      WHERE "docNo" ILIKE ${`%${q}%`} OR "customerSnapshot"->>'name' ILIKE ${`%${q}%`}
      ORDER BY "createdAt" DESC LIMIT ${per}`,
    prisma.customer.findMany({
      where: { OR: [{ name: ci }, { code: q }, { contactName: ci }, { email: ci }, { tags: { has: q } }, ...(phone ? [{ phone: { contains: phone } }, { taxId: { contains: phone } }] : [])] },
      orderBy: { code: "desc" }, take: per, select: { id: true, code: true, name: true, phone: true },
    }),
    prisma.product.findMany({
      where: { OR: [{ sku: ci }, { name: ci }] }, orderBy: [{ isActive: "desc" }, { name: "asc" }], take: per,
      select: { id: true, sku: true, name: true, isActive: true, trackStock: true, stock: true },
    }),
    prisma.purchaseOrder.findMany({ where: { OR: [{ poNo: ci }, { supplierName: ci }] }, orderBy: { createdAt: "desc" }, take: per, select: { id: true, poNo: true, supplierName: true, status: true } }),
  ]);
  const ql = q.toLowerCase();
  const hits: SearchHit[] = [
    ...orders.map((o) => ({ group: "คำสั่งซื้อ", title: o.orderNo, detail: `${o.customerName} · ${money(o.totalSatang)} · ${ORDER_ST[o.status] ?? o.status}`, href: `/admin?tab=ALL&open=${encodeURIComponent(o.orderNo)}` })),
    ...docs.map((x) => ({ group: "เอกสารขาย", title: `${DOC_TH[x.type] ?? x.type} ${x.docNo ?? "ฉบับร่าง"}`, detail: `${x.name ?? "—"} · ${money(Number(x.grandSatang))}`, href: `/admin/docs/${x.type}/${x.id}` })),
    ...customers.map((c) => ({ group: "ลูกค้า", title: `${c.code} · ${c.name}`, detail: c.phone ? c.phone.replace(/^(\d{3})(\d{3})(\d+)$/, "$1-$2-$3") : "ไม่มีเบอร์", href: `/admin/customers/${c.id}` })),
    ...products.map((p) => ({ group: "สินค้า", title: p.name, detail: `${p.sku}${p.isActive ? "" : " · ปิดขาย"}${p.trackStock ? ` · คงเหลือ ${p.stock}` : ""}`, href: `/admin/products/${p.id}` })),
    ...pos.map((p) => ({ group: "ใบสั่งซื้อ", title: p.poNo ?? "ใบสั่งซื้อฉบับร่าง", detail: p.supplierName, href: `/admin/purchase-orders/${p.id}` })),
    ...PAGES.filter((p) => (owner || !p.ownerOnly) && (p.label.toLowerCase().includes(ql) || p.words.toLowerCase().includes(ql)))
      .slice(0, per)
      .map((p) => ({ group: "ไปที่หน้า", title: p.label, detail: p.href, href: p.href })),
  ];
  if (owner) {
    const reqs = await prisma.dataRequest.findMany({ where: { OR: [{ name: ci }, ...(phone ? [{ phone: { contains: phone } }] : []), { email: ci }] }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, name: true, kind: true } });
    hits.push(...reqs.map((r) => ({ group: "คำขอ PDPA", title: r.name, detail: r.kind, href: `/admin/data-requests/${r.id}` })));
  }
  return hits;
}
