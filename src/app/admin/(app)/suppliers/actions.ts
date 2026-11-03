"use server";
// ทะเบียนผู้ขาย (ล็อต 15) — เจ้าของร้านเท่านั้น (เกี่ยวกับต้นทุน)
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireOwner } from "@/lib/auth";
import { isValidThaiTaxId } from "@/lib/format";
import { diffOf } from "@/lib/log-diff";
import { prisma } from "@/lib/prisma";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const back = (id: string, q: string) => redirect(`/admin/suppliers/${id || "new"}?${q}`);

export async function saveSupplier(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  const data = {
    name: str(f, "name", 160),
    contact: str(f, "contact", 120) || null,
    phone: str(f, "phone", 40).replace(/[^\d+]/g, "") || null,
    lineId: str(f, "lineId", 60) || null,
    email: str(f, "email", 120).toLowerCase() || null,
    address: str(f, "address", 500) || null,
    taxId: str(f, "taxId", 20).replace(/\D/g, "") || null,
    terms: str(f, "terms", 120) || null,
    note: str(f, "note", 2000) || null,
    isActive: f.get("isActive") === "on",
  };
  if (data.name.length < 2) back(id, "err=name");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) back(id, "err=email");
  if (data.taxId && !isValidThaiTaxId(data.taxId)) back(id, "err=taxId");
  const dup = await prisma.supplier.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (dup) back(id, "err=dup");
  if (id) {
    const before = await prisma.supplier.findUnique({ where: { id } });
    if (!before) redirect("/admin/suppliers");
    await prisma.supplier.update({ where: { id }, data });
    const diff = diffOf(before, data);
    if (diff) await logAdmin(admin.id, "SUPPLIER", `แก้ไขผู้ขาย ${data.name}`, { entity: `Supplier:${id}`, diff });
    redirect(`/admin/suppliers/${id}?saved=1`);
  }
  const s = await prisma.supplier.create({ data });
  await logAdmin(admin.id, "SUPPLIER", `เพิ่มผู้ขาย ${data.name}`, { entity: `Supplier:${s.id}` });
  redirect(`/admin/suppliers/${s.id}?saved=1`);
}

export async function toggleSupplier(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  const s = await prisma.supplier.findUnique({ where: { id }, select: { name: true, isActive: true } });
  if (!s) return;
  await prisma.supplier.update({ where: { id }, data: { isActive: !s.isActive } });
  await logAdmin(admin.id, "SUPPLIER", `${s.isActive ? "ปิด" : "เปิด"}ใช้ผู้ขาย ${s.name}`, { entity: `Supplier:${id}` });
  redirect(String(f.get("back") ?? "") === "list" ? "/admin/suppliers" : `/admin/suppliers/${id}`);
}

export async function deleteSupplier(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  const s = await prisma.supplier.findUnique({ where: { id }, select: { name: true, _count: { select: { orders: true } } } });
  if (!s) redirect("/admin/suppliers");
  // มีใบสั่งซื้อแล้ว → ลบไม่ได้ (เก็บประวัติ) ใช้ "ปิดใช้" แทน
  if (s._count.orders) redirect(`/admin/suppliers/${id}?err=used`);
  await prisma.supplier.delete({ where: { id } });
  await logAdmin(admin.id, "SUPPLIER", `ลบผู้ขาย ${s.name}`);
  redirect("/admin/suppliers?deleted=1");
}
