// คำขอใช้สิทธิ์ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (U28/A24)
// - รับคำขอจากหน้า /privacy/request → DataRequest (เจ้าของร้านจัดการที่ /admin/data-requests)
// - personData(): รวบรวมข้อมูลของบุคคลจากเบอร์โทร (+อีเมล) ทุกตาราง — ส่งออกเป็น ZIP ให้ผู้ขอ (สิทธิ์ขอดู/ขอสำเนา)
//   ค้นจาก: เบอร์/อีเมลโดยตรง + ทุกอย่างที่ผูกกับคำสั่งซื้อ/ลูกค้า/เอกสารของบุคคลนั้น (เช่น รีวิว/เคลม/คูปอง/อีเมลของคำสั่งซื้อ)
//   รวม: ลูกค้า, คำสั่งซื้อ (+ประวัติ), เอกสารขาย, สลิปของใบแจ้งหนี้ (ข้อมูล ไม่รวมไฟล์), คำขอ/ติดต่อ, รีวิว, เคลม, แจ้งเมื่อมีของ,
//        การใช้คูปอง, อีเมลที่ส่งถึง, โน้ตภายใน และงานที่เกี่ยวกับบุคคลนั้น, คำขอ PDPA
// - erasePerson(): ลบ/ทำให้ไม่ระบุตัวตน (สิทธิ์ขอลบ) โดย "เก็บเอกสารที่กฎหมายบังคับ" — กฎ:
//     · ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ/ใบกำกับภาษีที่ออกแล้ว ต้องเก็บ 5 ปี (ประมวลรัษฎากร ม.87/3, พ.ร.บ.การบัญชี)
//       → คงชื่อ ที่อยู่ เลขผู้เสียภาษี ในเอกสารไว้ ลบเฉพาะเบอร์โทร/อีเมล/ที่อยู่จัดส่งที่ไม่ได้พิมพ์บนเอกสาร
//         + โน้ตภายในของเอกสาร และชื่อผู้กดยอมรับใบเสนอราคา
//       → สลิปของใบแจ้งหนี้ (DocSlip): ที่ยอมรับแล้ว (ACCEPTED — ผูกการรับชำระ) เก็บเป็นหลักฐานการรับเงิน · ที่รอตรวจ/ถูกปฏิเสธ ลบแถวและไฟล์
//     · คำสั่งซื้อที่ชำระแล้ว = หลักฐานทางบัญชี → คงยอดเงิน/รายการ/วันที่ ลบชื่อ เบอร์ อีเมล ที่อยู่ หมายเหตุ เหตุผลยกเลิก
//       สลิปของคำสั่งซื้อที่ชำระแล้วเก็บไว้เป็นหลักฐานการรับเงิน · สลิปของคำสั่งซื้อที่ไม่ได้ชำระ ลบไฟล์และแถว
//     · ประวัติคำสั่งซื้อ (OrderEvent): แก้ไขข้อมูล/โน้ต/ยกเลิก/คืนเงิน → แทนข้อความทั้งหมด · ชนิดอื่น → ลบคำที่ตรงกับชื่อ/เบอร์/อีเมล/ที่อยู่
//     · บันทึกหลังบ้าน (AdminLog) ที่ผูก Order:<เลขที่> / Customer:<id> ของบุคคล → diff ฟิลด์ส่วนบุคคลเป็น "ลบตามคำขอ PDPA",
//       ข้อความอิสระ (โน้ต/งาน/ลูกค้า/การแก้ข้อมูลผู้รับ) แทนทั้งข้อความ · บันทึกอื่นที่มีเบอร์/อีเมลของบุคคล → ลบเฉพาะคำนั้น
//     · โน้ตภายใน (InternalNote) ของคำสั่งซื้อ/ลูกค้า → ลบ · งาน (AdminTask) ที่ผูกคำสั่งซื้อ/ลูกค้า → แทนหัวข้อ/รายละเอียด
//     · คำขอจากลูกค้า, แจ้งเมื่อมีของ, รีวิว → ลบทั้งรายการ (รวมรูปแนบ) · เคลม → ลบชื่อ/เบอร์/รูป/โน้ตภายใน คงอาการและผลการเคลม
//     · การใช้คูปอง → ลบเบอร์ (คงยอดส่วนลดไว้เป็นหลักฐานบัญชี) · ประวัติอีเมล → ลบที่อยู่ผู้รับ
//     · ลูกค้าที่ไม่มีเอกสารที่ออกแล้ว → ลบทั้งรายการ · มีเอกสาร → ลบเบอร์ อีเมล ผู้ติดต่อ ที่อยู่จัดส่ง แท็ก หมายเหตุ
//     · ตัวคำขอ DataRequest เก็บไว้เป็นหลักฐานการปฏิบัติตามกฎหมาย
//   ไฟล์ (สลิป รูปรีวิว/เคลม/คำขอ) ลบจาก storage หลัง transaction สำเร็จ
import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type DataRequestKind } from "../../generated/prisma/client";
import { formatPhone, phoneDigits } from "@/lib/format";
import { REDACTED, needlesOf, redactDiff, redactEventNote, redactLogNote, scrubText } from "@/lib/pdpa-rules";
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
  const ci = (v: string) => ({ equals: v, mode: "insensitive" as const });
  const customers = await prisma.customer.findMany({ where: { OR: [{ phone }, ...byEmail({ email: ci(email!) })] } });
  const cids = customers.map((c) => c.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ phone }, ...byEmail({ email: ci(email!) }), ...(cids.length ? [{ customerId: { in: cids } }] : [])] },
    omit: { publicToken: true },
    include: { items: true, slips: { select: { id: true, uploadedAt: true, declaredAmountSatang: true, transferredAt: true, status: true } }, events: { select: { type: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  const oids = orders.map((o) => o.id);
  const byOrder = oids.length ? [{ orderId: { in: oids } }] : [];
  const docs = await prisma.salesDocument.findMany({
    where: { OR: [...(cids.length ? [{ customerId: { in: cids } }] : []), ...byOrder, ...snapPhones(phone).map((p) => ({ customerSnapshot: { path: ["phone"], equals: p } }))] },
    omit: { internalNote: true, publicToken: true },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
  const issued = docs.filter((d) => d.status !== "DRAFT");
  const [inquiries, reviews, claims, alerts, coupons, requests, emailLogs, docSlips, notes, tasks] = await Promise.all([
    prisma.inquiry.findMany({ where: { OR: [{ phone }, ...byEmail({ email: ci(email!) }), ...(cids.length ? [{ customerId: { in: cids } }] : [])] }, omit: { ipHash: true, note: true } }),
    prisma.review.findMany({ where: { OR: [{ phone }, ...byOrder] } }),
    prisma.claim.findMany({ where: { OR: [{ phone }, ...byOrder] }, omit: { note: true } }),
    prisma.stockAlert.findMany({ where: { OR: [{ phone }, ...byEmail({ email: ci(email!) })] }, include: { product: { select: { sku: true, name: true } } } }),
    prisma.couponRedemption.findMany({ where: { OR: [{ phone }, ...byOrder] }, select: { orderId: true, discountSatang: true, createdAt: true, coupon: { select: { code: true } } } }),
    prisma.dataRequest.findMany({ where: { phone }, omit: { ipHash: true, handledBy: true } }),
    prisma.emailLog.findMany({ where: { OR: [...byEmail({ to: ci(email!) }), ...byOrder] }, select: { to: true, template: true, orderId: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    issued.length ? prisma.docSlip.findMany({ where: { documentId: { in: issued.map((d) => d.id) } }, select: { id: true, documentId: true, amountSatang: true, transferredAt: true, status: true, rejectReason: true, createdAt: true } }) : [],
    prisma.internalNote.findMany({ where: { OR: [...byOrder, ...(cids.length ? [{ customerId: { in: cids } }] : [])] }, select: { body: true, orderId: true, customerId: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.adminTask.findMany({ where: { OR: [...byOrder, ...(cids.length ? [{ customerId: { in: cids } }] : [])] }, select: { title: true, body: true, done: true, dueAt: true, orderId: true, customerId: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    customers, orders, salesDocuments: issued, docSlips,
    inquiries, reviews, claims, stockAlerts: alerts, couponRedemptions: coupons, emailLogs, internalNotes: notes, adminTasks: tasks, dataRequests: requests,
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
    "data.json ประกอบด้วย: ข้อมูลลูกค้า คำสั่งซื้อ (รายการ/การชำระเงิน/สถานะ/ประวัติ) เอกสารขาย สลิปของใบแจ้งหนี้ คำขอ/ติดต่อ รีวิว เคลม แจ้งเมื่อมีของ",
    "คูปอง อีเมลที่ร้านส่งถึง โน้ตภายในและงานของร้านที่เกี่ยวกับท่าน และคำขอ PDPA",
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

// ---------- คัดค้านการตลาด (OBJECT) ----------

/**
 * บันทึกการคัดค้าน/ถอนความยินยอมการตลาด: ลูกค้าที่เบอร์หรืออีเมลตรงกับผู้ขอ → marketingOptOut = true
 * (ไฟล์บรอดแคสต์ข้ามลูกค้าเหล่านี้ และข้ามเบอร์/อีเมลของคำขอคัดค้านที่ไม่ถูกปฏิเสธด้วย — กันกรณีสร้างลูกค้าใหม่ภายหลัง)
 */
export async function optOutMarketing(phoneRaw: string, emailRaw: string | null) {
  const { phone, email } = who(phoneRaw, emailRaw);
  const r = await prisma.customer.updateMany({
    where: { OR: [{ phone }, ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])] },
    data: { marketingOptOut: true },
  });
  return r.count;
}

// ---------- ลบ / ทำให้ไม่ระบุตัวตน ----------

export type EraseResult = Record<string, number>;

const fileKeys = (v: unknown) => (Array.isArray(v) ? v.map((a) => (typeof a === "string" ? a : (a as { key?: string })?.key)).filter((k): k is string => !!k) : []);

export async function erasePerson(phoneRaw: string, emailRaw: string | null): Promise<EraseResult> {
  const { phone, email } = who(phoneRaw, emailRaw);
  const eq = (v: string) => ({ equals: v, mode: "insensitive" as const });
  const orWho = <K extends string>(phoneKey: K, emailKey?: string) => [{ [phoneKey]: phone }, ...(email && emailKey ? [{ [emailKey]: eq(email) }] : [])];
  const filesToDelete: string[] = [];
  const result: EraseResult = {};

  await prisma.$transaction(
    async (tx) => {
      const customers = await tx.customer.findMany({
        where: { OR: orWho("phone", "email") as Prisma.CustomerWhereInput[] },
        select: { id: true, code: true, name: true, contactName: true, phone: true, email: true, addressLine: true, shipTo: true, _count: { select: { documents: { where: { docNo: { not: null } } } } } },
      });
      const cids = customers.map((c) => c.id);
      const orders = await tx.order.findMany({
        where: { OR: [...(orWho("phone", "email") as Prisma.OrderWhereInput[]), ...(cids.length ? [{ customerId: { in: cids } }] : [])] },
        select: { id: true, orderNo: true, status: true, customerName: true, phone: true, email: true, addressLine: true, slips: { select: { id: true, storageKey: true } } },
      });
      const oids = orders.map((o) => o.id);
      const byOrder = oids.length ? [{ orderId: { in: oids } }] : [];

      // คำที่ต้องลบออกจากข้อความอิสระ (เก็บก่อนลบข้อมูลต้นทาง)
      const phones = [...new Set([phone, ...orders.map((o) => o.phone), ...customers.map((c) => c.phone ?? "")].map(phoneDigits).filter((p) => p.length >= 9))];
      const ship = (j: unknown) => (j && typeof j === "object" && !Array.isArray(j) ? (j as { name?: string }).name : null);
      const needles = needlesOf([
        email, ...orders.flatMap((o) => [o.customerName, o.email, o.addressLine]),
        ...customers.flatMap((c) => [c.name, c.contactName, c.email, c.addressLine, ship(c.shipTo)]),
      ]);
      const scrub = (t: string) => scrubText(t, needles, phones);

      // คำสั่งซื้อ: คงยอด/รายการ ลบข้อมูลติดต่อ · สลิปของคำสั่งซื้อที่ไม่ได้ชำระ ลบไฟล์และแถว
      for (const o of orders) {
        const paid = o.status === "PAID" || o.status === "SHIPPED";
        await tx.order.update({
          where: { id: o.id },
          data: { customerName: REDACTED, phone: "", email: null, addressLine: "-", subdistrict: "-", district: "-", province: "-", postalCode: "00000", note: null, taxInvoice: paid ? undefined : Prisma.DbNull },
        });
        await tx.order.updateMany({ where: { id: o.id, cancelReason: { not: null } }, data: { cancelReason: REDACTED } });
        if (!paid) {
          filesToDelete.push(...o.slips.map((s) => s.storageKey));
          await tx.paymentSlip.deleteMany({ where: { orderId: o.id } });
        }
      }
      result.orders = orders.length;

      // ประวัติคำสั่งซื้อ
      let ev = 0;
      if (oids.length) {
        for (const e of await tx.orderEvent.findMany({ where: { orderId: { in: oids }, note: { not: null } }, select: { id: true, type: true, note: true } })) {
          const note = redactEventNote(e.type, e.note, needles, phones);
          if (note !== e.note) {
            await tx.orderEvent.update({ where: { id: e.id }, data: { note } });
            ev++;
          }
        }
      }
      result.orderEventsRedacted = ev;

      // บันทึกหลังบ้าน: ผูกกับคำสั่งซื้อ/ลูกค้าของบุคคล → diff + ข้อความ · บันทึกอื่นที่มีเบอร์/อีเมล → ลบเฉพาะคำนั้น
      const refOf = new Map<string, string>([...orders.map((o) => [`Order:${o.orderNo}`, o.orderNo] as const), ...customers.map((c) => [`Customer:${c.id}`, `ลูกค้า ${c.code}`] as const)]);
      const textHits = [...phones.flatMap((p) => [p, formatPhone(p)]), ...(email ? [email] : [])].map((t) => ({ note: { contains: t, mode: "insensitive" as const } }));
      const logs = await tx.adminLog.findMany({
        where: { OR: [...(refOf.size ? [{ entity: { in: [...refOf.keys()] } }] : []), ...textHits] },
        select: { id: true, type: true, note: true, entity: true, diff: true },
      });
      let lg = 0;
      for (const l of logs) {
        const ref = l.entity ? refOf.get(l.entity) : undefined;
        const note = ref ? redactLogNote(l.type, l.note, ref, needles, phones) : l.note ? scrub(l.note) : l.note;
        const diff = ref && l.diff ? redactDiff(l.diff, needles, phones) : undefined;
        if (note !== l.note || diff !== undefined) {
          await tx.adminLog.update({ where: { id: l.id }, data: { note, ...(diff !== undefined ? { diff: (diff as Prisma.InputJsonValue | null) ?? Prisma.DbNull } : {}) } });
          lg++;
        }
      }
      result.adminLogsRedacted = lg;

      // โน้ตภายในของคำสั่งซื้อ/ลูกค้า → ลบ · งานที่ผูกกับคำสั่งซื้อ/ลูกค้า → แทนหัวข้อ/รายละเอียด
      const linked = [...byOrder, ...(cids.length ? [{ customerId: { in: cids } }] : [])];
      result.internalNotes = linked.length ? (await tx.internalNote.deleteMany({ where: { OR: linked } })).count : 0;
      result.tasksRedacted = linked.length
        ? (await tx.adminTask.updateMany({ where: { OR: linked }, data: { title: `งานเกี่ยวกับลูกค้า (${REDACTED})`, body: null } })).count
        : 0;

      // เอกสารขาย: ลบเบอร์/อีเมล/ที่อยู่จัดส่งออกจาก snapshot (ชื่อ ที่อยู่ เลขผู้เสียภาษีที่พิมพ์บนเอกสารต้องเก็บตามกฎหมาย)
      const docs = await tx.salesDocument.findMany({
        where: { OR: [...(cids.length ? [{ customerId: { in: cids } }] : []), ...byOrder, ...snapPhones(phone).map((p) => ({ customerSnapshot: { path: ["phone"], equals: p } }))] },
        select: { id: true, customerSnapshot: true },
      });
      for (const d of docs) {
        const snap = { ...(d.customerSnapshot as Record<string, unknown>) };
        for (const k of ["phone", "email", "contact", "shipTo"]) delete snap[k];
        await tx.salesDocument.update({ where: { id: d.id }, data: { customerSnapshot: snap as Prisma.InputJsonValue, internalNote: null } });
      }
      if (docs.length) await tx.salesDocument.updateMany({ where: { id: { in: docs.map((d) => d.id) }, acceptedBy: { not: null } }, data: { acceptedBy: REDACTED } });
      result.documentsRedacted = docs.length;

      // สลิปของใบแจ้งหนี้: อนุมัติแล้ว (หลักฐานรับเงิน) เก็บไว้ · ที่เหลือลบแถวและไฟล์
      const docSlips = docs.length ? await tx.docSlip.findMany({ where: { documentId: { in: docs.map((d) => d.id) }, status: { not: "ACCEPTED" } }, select: { id: true, storageKey: true } }) : [];
      filesToDelete.push(...docSlips.map((s) => s.storageKey));
      result.docSlips = docSlips.length ? (await tx.docSlip.deleteMany({ where: { id: { in: docSlips.map((s) => s.id) } } })).count : 0;

      let custDeleted = 0, custRedacted = 0;
      for (const c of customers) {
        if (c._count.documents === 0) {
          await tx.order.updateMany({ where: { customerId: c.id }, data: { customerId: null } });
          await tx.customer.delete({ where: { id: c.id } });
          custDeleted++;
        } else {
          await tx.customer.update({ where: { id: c.id }, data: { phone: null, email: null, contactName: null, shipTo: Prisma.DbNull, note: null, tags: [] } });
          custRedacted++;
        }
      }
      result.customersDeleted = custDeleted;
      result.customersRedacted = custRedacted;

      const inq = await tx.inquiry.findMany({ where: { OR: [...(orWho("phone", "email") as Prisma.InquiryWhereInput[]), ...(cids.length ? [{ customerId: { in: cids } }] : [])] }, select: { id: true, attachments: true } });
      for (const i of inq) filesToDelete.push(...fileKeys(i.attachments));
      result.inquiries = (await tx.inquiry.deleteMany({ where: { id: { in: inq.map((i) => i.id) } } })).count;

      const reviews = await tx.review.findMany({ where: { OR: [{ phone }, ...byOrder] }, select: { id: true, productId: true, images: true } });
      filesToDelete.push(...reviews.flatMap((r) => r.images));
      result.reviews = (await tx.review.deleteMany({ where: { id: { in: reviews.map((r) => r.id) } } })).count;
      for (const pid of new Set(reviews.map((r) => r.productId))) {
        const agg = await tx.review.aggregate({ where: { productId: pid, status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } });
        await tx.product.update({ where: { id: pid }, data: { ratingAvg: agg._avg.rating, ratingCount: agg._count._all } });
      }

      const claims = await tx.claim.findMany({ where: { OR: [{ phone }, ...byOrder] }, select: { id: true, images: true } });
      filesToDelete.push(...claims.flatMap((c) => c.images));
      const claimIds = { id: { in: claims.map((c) => c.id) } };
      result.claims = (await tx.claim.updateMany({ where: claimIds, data: { name: REDACTED, phone: "", images: [] } })).count;
      await tx.claim.updateMany({ where: { ...claimIds, note: { not: null } }, data: { note: REDACTED } });

      result.stockAlerts = (await tx.stockAlert.deleteMany({ where: { OR: orWho("phone", "email") as Prisma.StockAlertWhereInput[] } })).count;
      result.couponRedemptions = (await tx.couponRedemption.updateMany({ where: { OR: [{ phone }, ...byOrder] }, data: { phone: "" } })).count;
      const mails = [...(email ? [{ to: eq(email) }] : []), ...byOrder];
      result.emailLogs = mails.length ? (await tx.emailLog.updateMany({ where: { OR: mails }, data: { to: "(ลบแล้ว)" } })).count : 0;
    },
    { timeout: 60_000 },
  );

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
