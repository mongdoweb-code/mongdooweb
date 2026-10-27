"use server";
// ใบสั่งซื้อ (A21) + ต้นทุนสินค้า (A22)
// - สร้าง/แก้/ออกเลข/ยกเลิก และแก้ต้นทุน: เจ้าของร้านเท่านั้น (มีต้นทุน)
// - รับของเข้า: พนักงานทำได้ (หน้ารับของไม่แสดงต้นทุน) — สต็อก/ต้นทุนคำนวณที่ server ทั้งหมด
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { diffOf, logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PoError, checkPo, closePo, deletePoDraft, placePo, receivePo, savePoDraft, type PoInput } from "@/lib/purchase";

export type PoFormState = { error?: string; fields?: string[] };

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const toSatang = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) : NaN;
};
const bahtText = (s: number) => `฿${(s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** บันทึกฉบับร่าง — intent=order: บันทึกแล้วออกใบสั่งซื้อทันที */
export async function savePo(_prev: PoFormState, f: FormData): Promise<PoFormState> {
  const admin = await requireOwner();
  const id = str(f, "id", 40) || null;
  let raw: { supplierName?: string; supplierContact?: string; note?: string; items?: { productId?: string | null; name?: string; qty?: unknown; cost?: unknown }[] };
  try {
    raw = JSON.parse(str(f, "data", 100_000));
  } catch {
    return { error: "ข้อมูลไม่ถูกต้อง" };
  }
  const input: PoInput = {
    supplierName: String(raw.supplierName ?? ""),
    supplierContact: raw.supplierContact ? String(raw.supplierContact) : null,
    note: raw.note ? String(raw.note) : null,
    items: (Array.isArray(raw.items) ? raw.items : []).map((l) => ({
      productId: typeof l.productId === "string" && l.productId ? l.productId : null,
      name: String(l.name ?? ""),
      qty: Number(String(l.qty ?? "").replace(/,/g, "")),
      costSatang: toSatang(l.cost),
    })),
  };
  const bad = checkPo(input);
  if (bad.length)
    return {
      error: bad.includes("supplierName") ? "กรอกชื่อผู้ขาย" : bad.includes("items") ? "เพิ่มสินค้าอย่างน้อย 1 รายการ (ไม่เกิน 100)" : "ตรวจจำนวน (จำนวนเต็มมากกว่า 0) และต้นทุนต่อหน่วยของรายการที่มีกรอบสีแดง",
      fields: bad,
    };
  let poId: string;
  try {
    const po = await savePoDraft(id, input, admin.id);
    poId = po.id;
  } catch (e) {
    if (e instanceof PoError) return { error: e.message };
    throw e;
  }
  let note = `${id ? "แก้" : "สร้าง"}ใบสั่งซื้อฉบับร่าง — ${input.supplierName} ${input.items.length} รายการ`;
  if (f.get("intent") === "order") {
    try {
      const poNo = await placePo(poId);
      note = `ออกใบสั่งซื้อ ${poNo} — ${input.supplierName} ${input.items.length} รายการ`;
    } catch (e) {
      if (e instanceof PoError) return { error: e.message };
      throw e;
    }
  }
  await logAdmin(admin.id, "PURCHASE", note, { entity: `PurchaseOrder:${poId}` });
  redirect(`/admin/purchase-orders/${poId}?saved=1`);
}

export async function orderPo(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  let msg = "";
  try {
    const poNo = await placePo(id);
    await logAdmin(admin.id, "PURCHASE", `ออกใบสั่งซื้อ ${poNo}`, { entity: `PurchaseOrder:${id}` });
  } catch (e) {
    if (!(e instanceof PoError)) throw e;
    msg = e.message;
  }
  redirect(`/admin/purchase-orders/${id}${msg ? `?err=${encodeURIComponent(msg)}` : ""}`);
}

/** รับของเข้า (เต็ม/บางส่วน) — พนักงานทำได้ */
export async function receivePoAction(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const lines = f
    .getAll("itemId")
    .map((itemId) => ({ itemId: String(itemId), qty: Math.floor(Number(f.get(`qty_${String(itemId)}`) || 0)) }))
    .filter((l) => l.qty > 0);
  let msg = "";
  try {
    const r = await receivePo(id, lines, admin.id, str(f, "note", 200) || null);
    const text = r.lines.map((l) => `${l.name} ×${l.qty}${l.stocked ? "" : " (ไม่นับสต็อก)"}`).join(", ");
    // ต้นทุนเห็นเฉพาะเจ้าของร้าน: ข้อความบันทึกไม่ใส่ราคา, diff ใส่ต้นทุน (หน้า log ซ่อนจากพนักงาน)
    await logAdmin(admin.id, "PURCHASE", `รับของ ${r.poNo}: ${text}${r.status === "RECEIVED" ? " · รับครบแล้ว" : ""}`, {
      entity: `PurchaseOrder:${id}`,
      diff: { costSatang: [null, r.lines.map((l) => `${l.name}: ${bahtText(l.costSatang)}`).join(", ")] },
    });
    refreshStorefront(); // สินค้าที่เคยหมดกลับมามีของ
  } catch (e) {
    if (!(e instanceof PoError)) throw e;
    msg = e.message;
  }
  redirect(`/admin/purchase-orders/${id}?${msg ? `err=${encodeURIComponent(msg)}` : "received=1"}`);
}

export async function closePoAction(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  let msg = "";
  try {
    const r = await closePo(id);
    await logAdmin(admin.id, "PURCHASE", `${r.status === "CANCELLED" ? "ยกเลิก" : "ปิด (ไม่รอส่วนที่เหลือ)"}ใบสั่งซื้อ ${r.poNo ?? "ฉบับร่าง"}`, { entity: `PurchaseOrder:${id}` });
  } catch (e) {
    if (!(e instanceof PoError)) throw e;
    msg = e.message;
  }
  redirect(`/admin/purchase-orders/${id}${msg ? `?err=${encodeURIComponent(msg)}` : ""}`);
}

export async function deletePo(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  try {
    await deletePoDraft(id);
  } catch (e) {
    if (!(e instanceof PoError)) throw e;
    redirect(`/admin/purchase-orders/${id}?err=${encodeURIComponent(e.message)}`);
  }
  await logAdmin(admin.id, "PURCHASE", "ลบใบสั่งซื้อฉบับร่าง");
  redirect("/admin/purchase-orders?deleted=1");
}

/** แก้ต้นทุนสินค้าเอง (หน้า "ต้นทุนสินค้า") — เว้นว่าง = ไม่ทราบต้นทุน */
export async function saveCost(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  const raw = str(f, "cost", 20);
  const cost = raw ? toSatang(raw) : null;
  if (cost !== null && Number.isNaN(cost)) return;
  const p = await prisma.product.findUnique({ where: { id }, select: { sku: true, costSatang: true } });
  if (!p) return;
  const diff = diffOf(p, { costSatang: cost });
  if (diff) {
    await prisma.product.update({ where: { id }, data: { costSatang: cost } });
    await logAdmin(admin.id, "PURCHASE", `แก้ต้นทุนสินค้า ${p.sku}`, { entity: `Product:${id}`, diff });
  }
  refresh();
}
