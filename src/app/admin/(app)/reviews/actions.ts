"use server";
// ตรวจรีวิว (A4): อนุมัติ / ซ่อน / ตอบกลับ / ลบ — คำนวณคะแนนเฉลี่ยสินค้าใหม่ใน transaction เดียวกัน แล้วล้างแคชหน้าร้าน
import { redirect } from "next/navigation";
import type { ReviewStatus } from "../../../../../generated/prisma/client";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REVIEW_STATUS, deleteImages, recomputeRating } from "@/lib/reviews";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
/** กลับไปหน้าเดิม (เฉพาะ /admin/reviews… กัน open redirect) */
function back(f: FormData, flag: string): never {
  const b = str(f, "back", 400);
  const u = new URL(/^\/admin\/reviews(\?[^\s]*)?$/.test(b) ? b : "/admin/reviews", "http://x");
  u.searchParams.set("done", flag);
  redirect(u.pathname + u.search);
}

export async function setReviewStatus(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const to = str(f, "status", 20) as ReviewStatus;
  if (!(to in REVIEW_STATUS)) back(f, "err");
  const r = await prisma.review.findUnique({ where: { id }, include: { product: { select: { name: true, sku: true } } } });
  if (!r) back(f, "missing");
  if (r.status !== to) {
    await prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id }, data: { status: to } });
      await recomputeRating(tx, r.productId);
    });
    await logAdmin(admin.id, "REVIEW", `รีวิว ${r.rating} ดาวของ ${r.name} (${r.product.sku}): ${REVIEW_STATUS[r.status]} → ${REVIEW_STATUS[to]}`);
    refreshStorefront();
  }
  back(f, to === "APPROVED" ? "approved" : to === "HIDDEN" ? "hidden" : "status");
}

export async function replyReview(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const reply = String(f.get("reply") ?? "").normalize("NFC").replace(/\r\n?/g, "\n").trim().slice(0, 1500);
  const r = await prisma.review.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!r) back(f, "missing");
  await prisma.review.update({ where: { id }, data: { reply: reply || null, repliedAt: reply ? new Date() : null } });
  await logAdmin(admin.id, "REVIEW", `${reply ? "ตอบกลับ" : "ลบคำตอบ"}รีวิวของ ${r.name}`);
  if (r.status === "APPROVED") refreshStorefront();
  back(f, "replied");
}

export async function deleteReview(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  const r = await prisma.review.findUnique({ where: { id }, include: { product: { select: { sku: true } } } });
  if (r) {
    await prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });
      await recomputeRating(tx, r.productId);
    });
    await deleteImages(r.images);
    await logAdmin(admin.id, "REVIEW", `ลบรีวิว ${r.rating} ดาวของ ${r.name} (${r.product.sku})`);
    refreshStorefront();
  }
  back(f, "deleted");
}
