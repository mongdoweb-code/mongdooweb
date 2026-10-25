"use server";
// คิวเคลม/คืนสินค้า (A16): เปลี่ยนสถานะ + ข้อความถึงลูกค้า (แสดงในหน้าติดตามคำสั่งซื้อ) + โน้ตภายใน
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { CLAIM_STATUS, isClaimStatus } from "@/lib/claims";
import { prisma } from "@/lib/prisma";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function updateClaim(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const c = await prisma.claim.findUnique({ where: { id }, include: { order: { select: { id: true, orderNo: true } } } });
  if (!c) redirect("/admin/claims");
  const st = str(f, "status", 20);
  const status = isClaimStatus(st) ? st : c.status;
  const resolution = str(f, "resolution", 2000) || null;
  const note = str(f, "note", 2000) || null;
  if ((status === "REJECTED" || status === "RESOLVED" || status === "APPROVED") && !resolution) redirect(`/admin/claims/${id}?err=resolution`);
  const changes: string[] = [];
  if (status !== c.status) changes.push(`สถานะ ${CLAIM_STATUS[c.status]} → ${CLAIM_STATUS[status]}`);
  if (resolution !== c.resolution) changes.push("แก้ข้อความถึงลูกค้า");
  if (note !== c.note) changes.push("แก้โน้ตภายใน");
  if (changes.length) {
    await prisma.$transaction(async (tx) => {
      await tx.claim.update({ where: { id }, data: { status, resolution, note } });
      // ประวัติในคำสั่งซื้อ (โน้ตภายใน — ลูกค้าไม่เห็น)
      if (c.order) await tx.orderEvent.create({ data: { orderId: c.order.id, type: "NOTE", adminId: admin.id, note: `เคลม ${c.claimNo}: ${changes.join(" · ")}` } });
    });
    await logAdmin(admin.id, "CLAIM", `${c.claimNo}: ${changes.join(" · ")}`);
  }
  redirect(`/admin/claims/${id}?saved=1`);
}
