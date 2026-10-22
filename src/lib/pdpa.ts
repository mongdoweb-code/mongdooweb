// คำขอใช้สิทธิ์ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (U28/A24)
// - รับคำขอจากหน้า /privacy/request → DataRequest (เจ้าของร้านจัดการที่ /admin/data-requests)
// - personData(): รวบรวมข้อมูลของบุคคลจากเบอร์โทร (+อีเมล) ทุกตาราง — ส่งออกเป็น ZIP ให้ผู้ขอ (สิทธิ์ขอดู/ขอสำเนา)
// - erasePerson(): ลบ/ทำให้ไม่ระบุตัวตน (สิทธิ์ขอลบ) โดย "เก็บเอกสารที่กฎหมายบังคับ":
//     · ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ/ใบกำกับภาษีที่ออกแล้ว ต้องเก็บ 5 ปี (ประมวลรัษฎากร ม.87/3, พ.ร.บ.การบัญชี)
//       → คงชื่อ ที่อยู่ เลขผู้เสียภาษี ในเอกสารไว้ ลบเฉพาะเบอร์โทร/อีเมล/ที่อยู่จัดส่งที่ไม่ได้พิมพ์บนเอกสาร
//     · คำสั่งซื้อที่ชำระแล้ว = หลักฐานทางบัญชี → คงยอดเงิน/รายการ/วันที่ ลบชื่อ เบอร์ อีเมล ที่อยู่ หมายเหตุ
//       สลิปของคำสั่งซื้อที่ชำระแล้วเก็บไว้เป็นหลักฐานการรับเงิน · สลิปของคำสั่งซื้อที่ไม่ได้ชำระ ลบไฟล์
//     · คำขอจากลูกค้า, แจ้งเมื่อมีของ, รีวิว → ลบทั้งรายการ (รวมรูปแนบ) · เคลม → ลบชื่อ/เบอร์/รูป คงอาการและผลการเคลม
//     · ลูกค้าที่ไม่มีเอกสารที่ออกแล้ว → ลบทั้งรายการ · มีเอกสาร → ลบเบอร์ อีเมล ผู้ติดต่อ ที่อยู่จัดส่ง แท็ก หมายเหตุ
//     · ตัวคำขอ DataRequest เก็บไว้เป็นหลักฐานการปฏิบัติตามกฎหมาย
import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type DataRequestKind } from "../../generated/prisma/client";
import { formatPhone, phoneDigits } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { createZip } from "@/lib/zip";

export const DR_KIND: Record<DataRequestKind, string> = {
  ACCESS: "ขอดู/ขอสำเนาข้อมูล",
  DELETE: "ขอลบข้อมูล",
  CORRECT: "ขอแก้ไขข้อมูล",
  OBJECT: "คัดค้าน/ถอนความยินยอม (เช่น ไม่รับข่าวสาร)",
};
export const DR_STATUS = { NEW: ["รอดำเนินการ", "pend"], DONE: ["ดำเนินการแล้ว", "ok"], REJECTED: ["ปฏิเสธ", "bad"] } as const;

export class DataRequestError extends Error {
  constructor(message: string, public fields: Record<string, string> = {}, public status = 400) {
    super(message);
  }
}

export const drIpHash = (ip: string) => createHash("sha256").update(`mdw-pdpa|${ip}`).digest("hex").slice(0, 32);

export function validateDataRequest(raw: Record<string, unknown>) {
  const s = (k: string, max: number) => String(raw[k] ?? "").trim().slice(0, max);
  const kind = s("kind", 10) as DataRequestKind;
  const name = s("name", 120), email = s("email", 160), detail = s("detail", 3000);
  const phone = phoneDigits(s("phone", 20));
  const f: Record<string, string> = {};
  if (!(kind in DR_KIND)) f.kind = "เลือกประเภทคำขอ";
  if (name.length < 2) f.name = "กรุณากรอกชื่อ-นามสกุล";
  if (!/^0[689]\d{8}$/.test(phone) && !/^0[2-57]\d{7}$/.test(phone)) f.phone = "เบอร์โทรไม่ถูกต้อง — ใช้เบอร์เดียวกับที่ใช้สั่งซื้อ";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) f.email = "รูปแบบอีเมลไม่ถูกต้อง";
  if (detail.length < 5) f.detail = "กรุณาอธิบายคำขอสั้น ๆ (อย่างน้อย 5 ตัวอักษร)";
  if (raw.consent !== true && raw.consent !== "on" && raw.consent !== "1") f.consent = "กรุณายืนยันว่าเป็นเจ้าของข้อมูล";
  if (Object.keys(f).length) throw new DataRequestError("กรุณาตรวจข้อมูลที่มีข้อความสีแดง", f);
  return { kind, name, phone, email: email || null, detail };
}

// ---------- รวบรวมข้อมูลของบุคคล ----------

/** เบอร์ใน snapshot เอกสารอาจเก็บแบบมีขีด (080-111-2222) หรือตัวเลขล้วน */
const snapPhones = (d: string) => [d, formatPhone(d)].filter((v, i, a) => v && a.indexOf(v) === i);

/** เงื่อนไขค้นข้อมูลของบุคคล: เบอร์ (ตัวเลขล้วน) + อีเมล (ถ้ามี) */
function who(phone: string, email: string | null) {
  return { phone: phoneDigits(phone), email: email?.toLowerCase() || null };
}

export async function personData(phoneRaw: string, emailRaw: string | null) {
  const { phone, email } = who(phoneRaw, emailRaw);
  const byEmail = <T,>(w: T) => (email ? [w] : []);
  const customers = await prisma.customer.findMany({ where: { OR: [{ phone }, ...byEmail({ email: { equals: email!, mode: "insensitive" as const } })] }, include: { notes: false } });
  const cids = customers.map((c) => c.id);
  const [orders, docs, inquiries, reviews, claims, alerts, coupons, requests] = await Promise.all([
    prisma.order.findMany({ where: { OR: [{ phone }, ...byEmail({ email: { equals: email!, mode: "insensitive" as const } })] }, include: { items: true, slips: { select: { id: true, uploadedAt: true, declaredAmountSatang: true, transferredAt: true, status: true } }, events: { where: { type: { not: "NOTE" } }, select: { type: true, note: true, createdAt: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.salesDocument.findMany({ where: { OR: [...(cids.length ? [{ customerId: { in: cids } }] : []), ...snapPhones(phone).map((p) => ({ customerSnapshot: { path: ["phone"], equals: p } }))] }, include: { items: true }, orderBy: { createdAt: "asc" } }),
    prisma.inquiry.findMany({ where: { OR: [{ phone }, ...byEmail({ email: { equals: email!, mode: "insensitive" as const } })] }, omit: { ipHash: true, note: true } }),
    prisma.review.findMany({ where: { phone } }),
    prisma.claim.findMany({ where: { phone }, omit: { note: true } }),
    prisma.stockAlert.findMany({ where: { OR: [{ phone }, ...byEmail({ email: { equals: email!, mode: "insensitive" as const } })] } }),
    prisma.couponRedemption.findMany({ where: { phone }, select: { orderId: true, discountSatang: true, createdAt: true, coupon: { select: { code: true } } } }),
    prisma.dataRequest.findMany({ where: { phone }, omit: { ipHash: true, handledBy: true } }),
  ]);
  // ข้อมูลภายในร้าน (โน้ต/แท็ก) ไม่ใช่ข้อมูลที่ลูกค้าให้มา แต่เป็นข้อมูลเกี่ยวกับเขา → ส่งให้ด้วยเฉพาะแท็ก ไม่ส่งโน้ตภายใน
  return {
    customers: customers.map(({ note: _n, ...c }) => (void _n, c)),
    orders, salesDocuments: docs.filter((d) => d.status !== "DRAFT").map(({ internalNote: _i, publicToken: _t, ...d }) => (void _i, void _t, d)),
    inquiries, reviews, claims, stockAlerts: alerts, couponRedemptions: coupons, dataRequests: requests,
  };
}

export async function personSummary(phone: string, email: string | null) {
  const d = await personData(phone, email);
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, (v as unknown[]).length])) as Record<keyof typeof d, number>;
}

/** ZIP สำหรับส่งให้ผู้ขอ: data.json (ทุกตาราง) + README ภาษาไทย */
export async function personExportZip(req: { id: string; name: string; phone: string; email: string | null }) {
  const data = await personData(req.phone, req.email);
  const now = new Date();
  const readme = [
    "สำเนาข้อมูลส่วนบุคคล — ร้านมองดูเว็บ",
    `ตามคำขอของ ${req.name} (เลขที่คำขอ ${req.id})`,
    `จัดทำเมื่อ ${now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
    "",
    "data.json ประกอบด้วย: ข้อมูลลูกค้า คำสั่งซื้อ (รายการ/การชำระเงิน/สถานะ) เอกสารขาย คำขอ/ติดต่อ รีวิว เคลม แจ้งเมื่อมีของ คูปอง และคำขอ PDPA",
    "จำนวนเงินที่ลงท้ายด้วย Satang เป็นสตางค์ (หาร 100 = บาท) · เวลาเป็น UTC",
    "ไม่รวมไฟล์ภาพสลิป — ขอสำเนาสลิปได้ทางร้าน",
    "",
    ...Object.entries(data).map(([k, v]) => `${k}: ${(v as unknown[]).length} รายการ`),
    "",
  ].join("\r\n");
  return createZip([
    { name: "README.txt", data: "﻿" + readme, date: now },
    { name: "data.json", data: JSON.stringify({ request: { id: req.id, name: req.name, phone: req.phone, email: req.email }, generatedAt: now.toISOString(), ...data }, null, 2), date: now },
  ]);
}

// ---------- ลบ / ทำให้ไม่ระบุตัวตน ----------

const REDACTED = "ลบตามคำขอ PDPA";

export type EraseResult = Record<string, number>;

export async function erasePerson(phoneRaw: string, emailRaw: string | null): Promise<EraseResult> {
  const { phone, email } = who(phoneRaw, emailRaw);
  const eq = (v: string) => ({ equals: v, mode: "insensitive" as const });
  const orWho = <K extends string>(phoneKey: K, emailKey?: string) => [{ [phoneKey]: phone }, ...(email && emailKey ? [{ [emailKey]: eq(email) }] : [])];
  const filesToDelete: string[] = [];
  const result: EraseResult = {};

  await prisma.$transaction(async (tx) => {
    // คำสั่งซื้อ: คงยอด/รายการ ลบข้อมูลติดต่อ · สลิปของคำสั่งซื้อที่ไม่ได้ชำระ ลบไฟล์และแถว
    const orders = await tx.order.findMany({ where: { OR: orWho("phone", "email") as Prisma.OrderWhereInput[] }, select: { id: true, status: true, slips: { select: { id: true, storageKey: true } } } });
    for (const o of orders) {
      await tx.order.update({
        where: { id: o.id },
        data: { customerName: REDACTED, phone: "", email: null, addressLine: "-", subdistrict: "-", district: "-", province: "-", postalCode: "00000", note: null, taxInvoice: o.status === "PAID" || o.status === "SHIPPED" ? undefined : Prisma.DbNull },
      });
      if (o.status !== "PAID" && o.status !== "SHIPPED") {
        filesToDelete.push(...o.slips.map((s) => s.storageKey));
        await tx.paymentSlip.deleteMany({ where: { orderId: o.id } });
      }
    }
    result.orders = orders.length;

    // ลูกค้า: มีเอกสารที่ออกแล้ว → ลบเฉพาะส่วนที่ไม่บังคับ · ไม่มี → ลบทั้งรายการ
    const customers = await tx.customer.findMany({ where: { OR: orWho("phone", "email") as Prisma.CustomerWhereInput[] }, select: { id: true, _count: { select: { documents: { where: { docNo: { not: null } } } } } } });
    // เอกสารขาย: ลบเบอร์/อีเมล/ที่อยู่จัดส่งออกจาก snapshot (ชื่อ ที่อยู่ เลขผู้เสียภาษีที่พิมพ์บนเอกสารต้องเก็บตามกฎหมาย)
    const docs = await tx.salesDocument.findMany({
      where: { OR: [...(customers.length ? [{ customerId: { in: customers.map((c) => c.id) } }] : []), ...snapPhones(phone).map((p) => ({ customerSnapshot: { path: ["phone"], equals: p } }))] },
      select: { id: true, customerSnapshot: true },
    });
    for (const d of docs) {
      const snap = { ...(d.customerSnapshot as Record<string, unknown>) };
      for (const k of ["phone", "email", "contact", "shipTo"]) delete snap[k];
      await tx.salesDocument.update({ where: { id: d.id }, data: { customerSnapshot: snap as Prisma.InputJsonValue } });
    }
    result.documentsRedacted = docs.length;

    let custDeleted = 0, custRedacted = 0;
    for (const c of customers) {
      if (c._count.documents === 0) {
        await tx.order.updateMany({ where: { customerId: c.id }, data: { customerId: null } });
        await tx.customer.delete({ where: { id: c.id } });
        custDeleted++;
      } else {
        await tx.customer.update({ where: { id: c.id }, data: { phone: null, email: null, contactName: null, shipTo: Prisma.DbNull, note: null, tags: [] } });
        await tx.internalNote.deleteMany({ where: { customerId: c.id } });
        custRedacted++;
      }
    }
    result.customersDeleted = custDeleted;
    result.customersRedacted = custRedacted;

    const inq = await tx.inquiry.findMany({ where: { OR: orWho("phone", "email") as Prisma.InquiryWhereInput[] }, select: { id: true, attachments: true } });
    for (const i of inq) if (Array.isArray(i.attachments)) filesToDelete.push(...(i.attachments as unknown[]).map((a) => (typeof a === "string" ? a : (a as { key?: string })?.key)).filter((k): k is string => !!k));
    result.inquiries = (await tx.inquiry.deleteMany({ where: { id: { in: inq.map((i) => i.id) } } })).count;

    const reviews = await tx.review.findMany({ where: { phone }, select: { id: true, productId: true, images: true } });
    filesToDelete.push(...reviews.flatMap((r) => r.images));
    result.reviews = (await tx.review.deleteMany({ where: { phone } })).count;
    for (const pid of new Set(reviews.map((r) => r.productId))) {
      const agg = await tx.review.aggregate({ where: { productId: pid, status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } });
      await tx.product.update({ where: { id: pid }, data: { ratingAvg: agg._avg.rating, ratingCount: agg._count._all } });
    }

    const claims = await tx.claim.findMany({ where: { phone }, select: { id: true, images: true } });
    filesToDelete.push(...claims.flatMap((c) => c.images));
    result.claims = (await tx.claim.updateMany({ where: { phone }, data: { name: REDACTED, phone: "", images: [] } })).count;

    result.stockAlerts = (await tx.stockAlert.deleteMany({ where: { OR: orWho("phone", "email") as Prisma.StockAlertWhereInput[] } })).count;
    result.couponRedemptions = (await tx.couponRedemption.updateMany({ where: { phone }, data: { phone: "" } })).count;
    if (email) result.emailLogs = (await tx.emailLog.updateMany({ where: { to: eq(email) }, data: { to: "(ลบแล้ว)" } })).count;
  });

  // ลบไฟล์หลัง transaction สำเร็จ (ไฟล์ที่ลบไม่ได้ไม่ทำให้ข้อมูลกลับมา)
  let files = 0;
  for (const k of new Set(filesToDelete)) {
    try {
      await storage().delete(k);
      files++;
    } catch {
      /* key ไม่ถูกต้อง/ไม่มีไฟล์ */
    }
  }
  result.files = files;
  return result;
}
