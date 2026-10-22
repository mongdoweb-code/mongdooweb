// ใบสั่งซื้อถึงผู้ขาย (A21) + ต้นทุนสินค้า (A22)
// สถานะ: DRAFT (ร่าง แก้ได้) → ORDERED (ออกเลข PO+YYMM-NNNNN ตอนสั่ง) → PARTIAL (รับบางส่วน) → RECEIVED (รับครบ/ปิดใบ) · CANCELLED
// รับของ: ทีละบรรทัด รับเต็มหรือบางส่วนได้ ไม่เกินจำนวนที่สั่ง
//  - สินค้าที่นับสต็อก → เพิ่มสต็อกผ่าน moveStock (StockMovement เหตุผล RESTOCK อ้างอิงเลข PO) ใน transaction เดียวกัน
//  - สินค้าที่ไม่นับสต็อก → ไม่แตะสต็อก แต่ยังบันทึกต้นทุน
//  - ต้นทุนสินค้า (Product.costSatang) = ต้นทุนต่อหน่วยของการรับเข้าครั้งล่าสุด ("ต้นทุนล่าสุด")
//    เลือกวิธีนี้เพราะร้านซื้อจากผู้ขายไม่กี่รายและราคาเปลี่ยนไม่บ่อย ตรวจย้อนหลังได้ง่าย
//    (ไม่ใช้ถัวเฉลี่ยถ่วงน้ำหนัก เพราะสต็อกของสินค้าที่ไม่นับสต็อกไม่มีจำนวนให้ถ่วง) — แก้ต้นทุนเองได้ที่หน้า "ต้นทุนสินค้า"
import "server-only";
import type { Prisma, PoStatus } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { nextSeq } from "@/lib/sequence";
import { moveStock } from "@/lib/stock";

export const PO_STATUS: Record<PoStatus, [label: string, cls: string]> = {
  DRAFT: ["ร่าง", "gray"],
  ORDERED: ["สั่งซื้อแล้ว รอรับของ", "pend"],
  PARTIAL: ["รับของบางส่วน", "info"],
  RECEIVED: ["รับครบแล้ว", "ok"],
  CANCELLED: ["ยกเลิก", "void"],
};

export class PoError extends Error {}

export type PoLineInput = { productId: string | null; name: string; qty: number; costSatang: number };
export type PoInput = { supplierName: string; supplierContact: string | null; note: string | null; items: PoLineInput[] };

const MAX_LINES = 100;

/** ตรวจข้อมูลใบสั่งซื้อ — คืนรายการช่องที่ผิด */
export function checkPo(input: PoInput): string[] {
  const bad: string[] = [];
  if (input.supplierName.trim().length < 2) bad.push("supplierName");
  if (!input.items.length || input.items.length > MAX_LINES) bad.push("items");
  input.items.forEach((l, i) => {
    if (!l.name.trim() || !(Number.isInteger(l.qty) && l.qty > 0 && l.qty <= 1_000_000) || !(Number.isInteger(l.costSatang) && l.costSatang >= 0 && l.costSatang < 1_000_000_000))
      bad.push(`item.${i}`);
  });
  return bad;
}

const totalOf = (items: { qty: number; costSatang: number }[]) => items.reduce((s, l) => s + l.qty * l.costSatang, 0);

/** สร้าง/แก้ใบสั่งซื้อฉบับร่าง (แก้ได้เฉพาะสถานะ DRAFT) */
export async function savePoDraft(id: string | null, input: PoInput, adminId: string) {
  // สินค้าที่อ้างถึงต้องมีอยู่จริง
  const ids = [...new Set(input.items.map((l) => l.productId).filter((x): x is string => !!x))];
  const found = new Set((await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id));
  const items = input.items.map((l) => ({ ...l, productId: l.productId && found.has(l.productId) ? l.productId : null, name: l.name.trim().slice(0, 250) }));
  const data = {
    supplierName: input.supplierName.trim().slice(0, 160),
    supplierContact: input.supplierContact?.trim().slice(0, 300) || null,
    note: input.note?.trim().slice(0, 2000) || null,
    totalSatang: totalOf(items),
  };
  return prisma.$transaction(async (tx) => {
    if (id) {
      const r = await tx.purchaseOrder.updateMany({ where: { id, status: "DRAFT" }, data });
      if (r.count !== 1) throw new PoError("แก้ไขได้เฉพาะใบสั่งซื้อฉบับร่าง");
      await tx.purchaseOrderItem.deleteMany({ where: { poId: id } });
      await tx.purchaseOrderItem.createMany({ data: items.map((l) => ({ ...l, poId: id })) });
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    }
    return tx.purchaseOrder.create({ data: { ...data, createdById: adminId, items: { create: items } } });
  });
}

/** ร่าง → สั่งซื้อแล้ว (ออกเลขที่ใน transaction เดียวกัน เลขไม่ซ้ำ ไม่ย้อนกลับ) */
export async function placePo(id: string) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
    if (!po || po.status !== "DRAFT") throw new PoError("ออกใบสั่งซื้อได้เฉพาะฉบับร่าง");
    if (!po._count.items) throw new PoError("ใบสั่งซื้อยังไม่มีรายการ");
    const poNo = await nextSeq(tx, "PO");
    const r = await tx.purchaseOrder.updateMany({ where: { id, status: "DRAFT" }, data: { status: "ORDERED", poNo, orderedAt: new Date() } });
    if (r.count !== 1) throw new PoError("สถานะใบสั่งซื้อเปลี่ยนไปแล้ว ลองโหลดหน้าใหม่");
    return poNo;
  });
}

export type ReceiveLine = { itemId: string; qty: number };
export type ReceiveResult = { poNo: string; status: PoStatus; lines: { name: string; qty: number; costSatang: number; stocked: boolean }[] };

/**
 * รับของเข้า — ทุกอย่างใน transaction เดียว: จำนวนที่รับ, สต็อก (RESTOCK), ต้นทุนล่าสุด, สถานะใบ
 * ล็อกแถวใบสั่งซื้อ (FOR UPDATE) กันสองคนกดรับพร้อมกันจนรับเกินจำนวนสั่ง
 */
export async function receivePo(id: string, lines: ReceiveLine[], adminId: string, note?: string | null): Promise<ReceiveResult> {
  const want = new Map<string, number>();
  for (const l of lines) if (Number.isInteger(l.qty) && l.qty > 0) want.set(l.itemId, (want.get(l.itemId) ?? 0) + l.qty);
  if (!want.size) throw new PoError("ระบุจำนวนที่รับอย่างน้อย 1 รายการ");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: { include: { product: { select: { id: true, trackStock: true } } } } } });
    if (!po || !po.poNo || !["ORDERED", "PARTIAL"].includes(po.status)) throw new PoError("รับของได้เฉพาะใบสั่งซื้อที่สั่งแล้วและยังรับไม่ครบ");
    const out: ReceiveResult["lines"] = [];
    const stock: { productId: string; delta: number }[] = [];
    for (const [itemId, qty] of want) {
      const it = po.items.find((x) => x.id === itemId);
      if (!it) throw new PoError("ไม่พบรายการในใบสั่งซื้อ");
      if (it.receivedQty + qty > it.qty) throw new PoError(`${it.name}: รับเกินจำนวนที่สั่ง (สั่ง ${it.qty} รับแล้ว ${it.receivedQty})`);
      await tx.purchaseOrderItem.update({ where: { id: it.id }, data: { receivedQty: { increment: qty } } });
      it.receivedQty += qty;
      if (it.productId) {
        if (it.product?.trackStock) stock.push({ productId: it.productId, delta: qty });
        await tx.product.update({ where: { id: it.productId }, data: { costSatang: it.costSatang } });
      }
      out.push({ name: it.name, qty, costSatang: it.costSatang, stocked: !!it.product?.trackStock });
    }
    if (stock.length) await moveStock(tx, stock, { reason: "RESTOCK", ref: po.poNo, adminId, note: note?.slice(0, 200) || `รับของตามใบสั่งซื้อ ${po.poNo}` });
    const full = po.items.every((x) => x.receivedQty >= x.qty);
    const status: PoStatus = full ? "RECEIVED" : "PARTIAL";
    await tx.purchaseOrder.update({ where: { id }, data: { status, ...(full ? { receivedAt: new Date() } : {}) } });
    return { poNo: po.poNo, status, lines: out };
  });
}

/** ยกเลิก (ยังไม่ได้รับของเลย) หรือปิดใบที่รับบางส่วน (ไม่รอส่วนที่เหลือ) */
export async function closePo(id: string): Promise<{ status: PoStatus; poNo: string | null }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new PoError("ไม่พบใบสั่งซื้อ");
    if (po.status === "DRAFT" || po.status === "ORDERED") {
      await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
      return { status: "CANCELLED" as const, poNo: po.poNo };
    }
    if (po.status === "PARTIAL") {
      await tx.purchaseOrder.update({ where: { id }, data: { status: "RECEIVED", receivedAt: new Date() } });
      return { status: "RECEIVED" as const, poNo: po.poNo };
    }
    throw new PoError("ใบสั่งซื้อนี้ปิดไปแล้ว");
  });
}

/** ลบได้เฉพาะฉบับร่าง (ยังไม่มีเลขที่) */
export async function deletePoDraft(id: string) {
  const r = await prisma.purchaseOrder.deleteMany({ where: { id, status: "DRAFT" } });
  if (r.count !== 1) throw new PoError("ลบได้เฉพาะใบสั่งซื้อฉบับร่าง");
}

export type PoListFilter = { status: PoStatus | ""; q: string };
export function poWhere(f: PoListFilter): Prisma.PurchaseOrderWhereInput {
  return {
    ...(f.status ? { status: f.status } : {}),
    ...(f.q
      ? { OR: [{ poNo: { contains: f.q, mode: "insensitive" } }, { supplierName: { contains: f.q, mode: "insensitive" } }, { items: { some: { name: { contains: f.q, mode: "insensitive" } } } }] }
      : {}),
  };
}
