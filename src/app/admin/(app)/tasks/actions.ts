"use server";
// งานที่ต้องทำ + โน้ตภายใน (A25) — ผูกกับคำสั่งซื้อ/ลูกค้าได้, มอบหมายผู้ใช้หลังบ้าน, กำหนดวันครบ, ทำเสร็จ/ย้อนกลับ
// ทุกคนในหลังบ้านสร้าง/ปิดงานได้ · ลบงานได้เฉพาะผู้สร้างหรือเจ้าของร้าน · ลบโน้ตได้เฉพาะผู้เขียนหรือเจ้าของร้าน
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTags } from "@/lib/customer-segments";
import { diffOf } from "@/lib/log-diff";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
/** กลับไปหน้าที่ส่งมา (เฉพาะ path ในหลังบ้าน) */
const back = (f: FormData, extra = "") => {
  const ret = str(f, "ret", 500);
  const base = /^\/admin(\/|\?|$)/.test(ret) && !ret.startsWith("//") ? ret : "/admin/tasks";
  return extra ? `${base}${base.includes("?") ? "&" : "?"}${extra}` : base;
};

/** "2026-10-25" + "14:30" (เวลาไทย) → Date */
function dueFrom(f: FormData) {
  const d = str(f, "dueDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = /^\d{2}:\d{2}$/.test(str(f, "dueTime", 5)) ? str(f, "dueTime", 5) : "17:00";
  const at = new Date(`${d}T${t}:00+07:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

export async function createTask(f: FormData) {
  const admin = await requireAdmin();
  const title = str(f, "title", 200);
  if (title.length < 2) redirect(back(f, "taskErr=title"));
  const assigneeId = str(f, "assigneeId", 40) || null;
  if (assigneeId && !(await prisma.admin.findFirst({ where: { id: assigneeId, isActive: true }, select: { id: true } }))) redirect(back(f, "taskErr=assignee"));
  // ผูกคำสั่งซื้อ (เลขที่) / ลูกค้า (id หรือรหัส)
  const orderNo = str(f, "orderNo", 40);
  const order = orderNo ? await prisma.order.findUnique({ where: { orderNo }, select: { id: true } }) : null;
  if (orderNo && !order) redirect(back(f, "taskErr=order"));
  const cust = str(f, "customer", 40);
  const customer = cust ? await prisma.customer.findFirst({ where: { OR: [{ id: cust }, { code: cust }] }, select: { id: true } }) : null;
  if (cust && !customer) redirect(back(f, "taskErr=customer"));
  const t = await prisma.adminTask.create({
    data: { title, body: str(f, "body", 2000) || null, dueAt: dueFrom(f), assigneeId, createdById: admin.id, orderId: order?.id ?? null, customerId: customer?.id ?? null },
    include: { assignee: { select: { displayName: true } } },
  });
  await logAdmin(admin.id, "TASK", `สร้างงาน “${title}”${t.assignee ? ` มอบหมาย ${t.assignee.displayName}` : ""}${orderNo ? ` (${orderNo})` : ""}`, { entity: orderNo ? `Order:${orderNo}` : customer ? `Customer:${customer.id}` : `Task:${t.id}` });
  redirect(back(f, "taskSaved=1"));
}

export async function toggleTask(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const t = await prisma.adminTask.findUnique({ where: { id }, include: { order: { select: { orderNo: true } } } });
  if (t) {
    const done = !t.done;
    await prisma.adminTask.update({ where: { id }, data: { done, doneAt: done ? new Date() : null } });
    await logAdmin(admin.id, "TASK", `${done ? "ทำเสร็จ" : "เปิดงานอีกครั้ง"}: “${t.title}”`, { entity: t.order ? `Order:${t.order.orderNo}` : t.customerId ? `Customer:${t.customerId}` : `Task:${t.id}` });
  }
  redirect(back(f));
}

export async function deleteTask(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const t = await prisma.adminTask.findUnique({ where: { id } });
  if (t && (admin.role === "OWNER" || t.createdById === admin.id)) {
    await prisma.adminTask.delete({ where: { id } });
    await logAdmin(admin.id, "TASK", `ลบงาน “${t.title}”`);
  }
  redirect(back(f));
}

// ---------- โน้ตภายในของลูกค้า ----------

export async function addCustomerNote(f: FormData) {
  const admin = await requireAdmin();
  const customerId = str(f, "customerId", 40);
  const body = str(f, "body", 2000);
  if (body && (await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) {
    await prisma.internalNote.create({ data: { body, customerId, adminId: admin.id } });
    await logAdmin(admin.id, "NOTE", `เพิ่มโน้ตลูกค้า: ${body.slice(0, 80)}`, { entity: `Customer:${customerId}` });
  }
  redirect(back(f, "noteSaved=1"));
}

export async function deleteNote(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const n = await prisma.internalNote.findUnique({ where: { id } });
  if (n && (admin.role === "OWNER" || n.adminId === admin.id)) {
    await prisma.internalNote.delete({ where: { id } });
    await logAdmin(admin.id, "NOTE", `ลบโน้ต: ${n.body.slice(0, 80)}`, { entity: n.customerId ? `Customer:${n.customerId}` : null });
  }
  redirect(back(f));
}

// ---------- แท็กลูกค้า (A23) ----------

export async function saveCustomerTags(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "customerId", 40);
  const tags = normalizeTags(str(f, "tags", 1000));
  const c = await prisma.customer.findUnique({ where: { id }, select: { tags: true, code: true } });
  if (c) {
    const diff = diffOf({ tags: c.tags }, { tags });
    if (diff) {
      await prisma.customer.update({ where: { id }, data: { tags } });
      await logAdmin(admin.id, "CUSTOMER", `แก้แท็กลูกค้า ${c.code}: ${tags.join(", ") || "(ไม่มีแท็ก)"}`, { entity: `Customer:${id}`, diff });
    }
  }
  redirect(back(f, "tagsSaved=1"));
}
