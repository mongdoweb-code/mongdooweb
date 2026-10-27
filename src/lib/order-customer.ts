// ผูกคำสั่งซื้อกับลูกค้า (หา/สร้างลูกค้าจากข้อมูลผู้รับ) — ใช้ทั้งในแอป (ยืนยันชำระ/ออกเอกสาร) และสคริปต์ย้อนหลัง
// ไม่มี "server-only" เพื่อให้ scripts/link-order-customers.ts (tsx) เรียกได้ — รับ client/transaction จากผู้เรียกเสมอ
// จับคู่: เบอร์โทร (เทียบเฉพาะตัวเลข) → อีเมล (ไม่สนตัวพิมพ์) → ไม่พบ = สร้างลูกค้าใหม่
import type { Customer, Prisma, PrismaClient } from "../../generated/prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

export type OrderForCustomer = {
  customerId: string | null; customerName: string; phone: string; email: string | null;
  addressLine: string; subdistrict: string; district: string; province: string; postalCode: string;
};

/** รหัสลูกค้า 4 หลักถัดไป ("0001") */
export async function nextCustomerCode(db: Db) {
  const last = await db.customer.findMany({ select: { code: true }, orderBy: { code: "desc" }, take: 50 });
  const max = last.map((c) => Number(c.code)).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
  return String(max + 1).padStart(4, "0");
}

/** หาลูกค้าเดิมที่ตรงกับคำสั่งซื้อ (ไม่สร้าง) */
export async function matchCustomer(db: Db, o: Pick<OrderForCustomer, "phone" | "email">): Promise<Customer | null> {
  const digits = String(o.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 9) {
    // เบอร์ในฐานข้อมูลอาจเก็บแบบมีขีด (ข้อมูลเก่า/นำเข้า) → เทียบเฉพาะตัวเลข
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Customer" WHERE regexp_replace(COALESCE("phone", ''), '\D', '', 'g') = ${digits}
      ORDER BY "createdAt" ASC LIMIT 1`;
    if (rows[0]) return db.customer.findUnique({ where: { id: rows[0].id } });
  }
  const email = String(o.email ?? "").trim();
  if (email) return db.customer.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, orderBy: { createdAt: "asc" } });
  return null;
}

/** ลูกค้าของคำสั่งซื้อ: ผูกไว้แล้ว → ใช้เดิม · ไม่งั้นจับคู่ · ไม่พบ = สร้างใหม่จากข้อมูลผู้รับ */
export async function customerForOrder(db: Db, o: OrderForCustomer, note = "สร้างจากคำสั่งซื้อหน้าเว็บ"): Promise<Customer> {
  if (o.customerId) {
    const c = await db.customer.findUnique({ where: { id: o.customerId } });
    if (c) return c;
  }
  const found = await matchCustomer(db, o);
  if (found) return found;
  const pickup = o.addressLine === "รับสินค้าที่ร้าน";
  return db.customer.create({
    data: {
      code: await nextCustomerCode(db), kind: "PERSON", name: o.customerName, phone: o.phone.replace(/\D/g, "") || null, email: o.email || null,
      addressLine: pickup ? null : o.addressLine || null, subdistrict: o.subdistrict || null, district: o.district || null,
      province: o.province || null, postalCode: /^\d{5}$/.test(o.postalCode) ? o.postalCode : null, note,
    },
  });
}

/** ผูก Order.customerId ถ้ายังว่าง (คืนลูกค้าที่ผูก) */
export async function linkOrderCustomer(db: Db, orderId: string): Promise<Customer | null> {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o) return null;
  const c = await customerForOrder(db, o);
  if (o.customerId !== c.id) await db.order.update({ where: { id: o.id }, data: { customerId: c.id } });
  return c;
}
