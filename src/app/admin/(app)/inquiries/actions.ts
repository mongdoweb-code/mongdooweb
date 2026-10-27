"use server";
// กล่องคำขอจากลูกค้า: เปลี่ยนสถานะ, โน้ตภายใน, สร้างใบเสนอราคา (ลูกค้า + QT ฉบับร่างพร้อมรายการ), ลบ (เจ้าของร้าน)
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { addDaysYmd, fromYmd } from "@/lib/doc-calc";
import { custSnapshot, defaultTerms, nextCustomerCode, todayYmd, totalsFor } from "@/lib/docs";
import { phoneDigits } from "@/lib/format";
import { matchCustomer } from "@/lib/order-customer";
import { INQ_KIND, INQ_STATUS, isInqStatus, parseInqItems } from "@/lib/inquiries";
import { unitPriceSatang } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { storage } from "@/lib/storage";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const back = (id: string, q: string) => redirect(`/admin/inquiries/${id}?${q}`);

export async function setInquiryStatus(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const to = str(f, "status", 20);
  if (!isInqStatus(to)) back(id, "err=status");
  const q = await prisma.inquiry.findUnique({ where: { id } });
  if (!q) redirect("/admin/inquiries");
  if (q.status !== to) {
    await prisma.inquiry.update({ where: { id }, data: { status: to as keyof typeof INQ_STATUS } });
    await logAdmin(admin.id, "INQUIRY", `${INQ_KIND[q.kind]} จาก ${q.name}: ${INQ_STATUS[q.status]} → ${INQ_STATUS[to as keyof typeof INQ_STATUS]}`);
  }
  back(id, "saved=status");
}

export async function saveInquiryNote(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const note = String(f.get("note") ?? "").trim().slice(0, 4000);
  const q = await prisma.inquiry.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!q) redirect("/admin/inquiries");
  // เขียนโน้ตแล้วถือว่าเริ่มดำเนินการ
  await prisma.inquiry.update({ where: { id }, data: { note: note || null, ...(q.status === "NEW" && note ? { status: "IN_PROGRESS" } : {}) } });
  await logAdmin(admin.id, "INQUIRY", `บันทึกโน้ตคำขอของ ${q.name}`);
  back(id, "saved=note");
}

/**
 * สร้างใบเสนอราคาจากคำขอ: หา/สร้างลูกค้าด้วยเบอร์โทร → QT ฉบับร่าง (รายการจากสินค้าที่สนใจ ราคาขายจริงตามจำนวน: ราคาลดตามช่วงเวลา/ราคาขายส่ง)
 * → ผูก Inquiry.quotationId/customerId → ไปหน้าแก้ไขเอกสาร (ถ้าเคยสร้างแล้วและยังอยู่ ให้เปิดใบเดิม)
 */
export async function quotationFromInquiry(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const q = await prisma.inquiry.findUnique({ where: { id } });
  if (!q) redirect("/admin/inquiries");
  if (q.quotationId) {
    const exist = await prisma.salesDocument.findUnique({ where: { id: q.quotationId }, select: { id: true, status: true } });
    if (exist && exist.status !== "VOID") redirect(`/admin/docs/QUOTATION/${exist.id}${exist.status === "DRAFT" ? "/edit" : ""}`);
  }
  const s = await getSettings();
  const wanted = parseInqItems(q.items);
  const products = wanted.length
    ? await prisma.product.findMany({ where: { slug: { in: wanted.map((w) => w.slug).filter(Boolean) } }, select: { id: true, slug: true, sku: true, name: true, unit: true, priceSatang: true, salePriceSatang: true, saleStartsAt: true, saleEndsAt: true, tierPrices: true } })
    : [];
  const items = wanted.map((w, i) => {
    const p = products.find((x) => x.slug === w.slug);
    return {
      sortOrder: i + 1, productId: p?.id ?? null, sku: p?.sku ?? null, name: (p?.name ?? w.name).slice(0, 300),
      detail: p ? null : "สินค้าตามที่ลูกค้าระบุ (ไม่พบในระบบ — ใส่ราคาเอง)", unit: p?.unit ?? "ชิ้น", qtyMilli: w.qty * 1000, priceSatang: p ? unitPriceSatang(p, w.qty) : 0, discountSatang: 0,
    };
  });
  // ราคาหน้าเว็บรวม VAT แล้ว → เปิด VAT ให้ถอดภาษีแบบรวมใน (ยอดเท่าราคาที่ลูกค้าเห็น)
  const vatMode = s.vatEnabled ? ("INCLUSIVE" as const) : ("NONE" as const);
  const today = todayYmd();
  const phone = phoneDigits(q.phone);
  const doc = await prisma.$transaction(async (tx) => {
    // จองคำขอนี้ก่อน (กดซ้ำ/สองคนกดพร้อมกัน → คนที่สองไม่ได้สร้างใบใหม่ซ้ำ)
    const claim = await tx.inquiry.updateMany({ where: { id: q.id, quotationId: q.quotationId }, data: { updatedAt: new Date() } });
    if (claim.count !== 1) return null;
    let c = q.customerId ? await tx.customer.findUnique({ where: { id: q.customerId } }) : null;
    if (!c && phone) c = await matchCustomer(tx, { phone, email: null }); // เทียบเบอร์เฉพาะตัวเลข (เหมือนคำสั่งซื้อ)
    if (!c) {
      const company = q.company?.trim();
      c = await tx.customer.create({
        data: {
          code: await nextCustomerCode(tx), kind: company ? "COMPANY" : "PERSON", name: (company || q.name).slice(0, 200),
          contactName: company ? q.name.slice(0, 120) : null, phone: phone || null, email: q.email, branch: company ? "สำนักงานใหญ่" : null,
          note: `สร้างจากคำขอใบเสนอราคาหน้าเว็บ (${q.createdAt.toISOString().slice(0, 10)})`,
        },
      });
    }
    const d = await tx.salesDocument.create({
      data: {
        type: "QUOTATION", status: "DRAFT", customerId: c.id, customerSnapshot: custSnapshot(c), sourceId: null,
        issueDate: fromYmd(today), validUntil: fromYmd(addDaysYmd(today, s.quoteValidDays)),
        ...totalsFor(items, 0, vatMode, s.vatRateBp), vatMode, vatRateBp: vatMode === "NONE" ? 0 : s.vatRateBp,
        paymentTerms: defaultTerms(s, "QUOTATION") || null,
        internalNote: `จากคำขอของลูกค้า: ${q.message}`.slice(0, 2000),
        items: { create: items },
      },
    });
    await tx.salesDocumentEvent.create({ data: { documentId: d.id, type: "CREATED", adminId: admin.id, note: `สร้างจากคำขอของ ${q.name}` } });
    const r = await tx.inquiry.updateMany({ where: { id: q.id, quotationId: q.quotationId }, data: { quotationId: d.id, customerId: c.id, status: q.status === "NEW" ? "IN_PROGRESS" : q.status } });
    if (r.count !== 1) throw new Error("inquiry changed concurrently");
    return d;
  }).catch(() => null);
  if (!doc) {
    const now = await prisma.inquiry.findUnique({ where: { id: q.id }, select: { quotationId: true } });
    redirect(now?.quotationId ? `/admin/docs/QUOTATION/${now.quotationId}/edit` : `/admin/inquiries/${q.id}`);
  }
  await logAdmin(admin.id, "INQUIRY", `สร้างใบเสนอราคาฉบับร่างจากคำขอของ ${q.name} (${items.length} รายการ)`);
  redirect(`/admin/docs/QUOTATION/${doc.id}/edit`);
}

export async function deleteInquiry(f: FormData) {
  const admin = await requireOwner();
  const q = await prisma.inquiry.findUnique({ where: { id: str(f, "id", 40) } });
  if (q) {
    await prisma.inquiry.delete({ where: { id: q.id } });
    // ลบรูปแนบออกจากที่เก็บไฟล์ด้วย (PDPA) — ลบไม่สำเร็จก็ไม่ขวางการลบคำขอ
    const files = Array.isArray(q.attachments) ? q.attachments.filter((k): k is string => typeof k === "string" && k.startsWith("inquiries/")) : [];
    await Promise.all(files.map((k) => storage().delete(k).catch((e) => console.error("ลบรูปแนบไม่สำเร็จ", k, e))));
    await logAdmin(admin.id, "INQUIRY", `ลบคำขอ (${INQ_KIND[q.kind]}) จาก ${q.name}`);
  }
  redirect("/admin/inquiries?deleted=1");
}
