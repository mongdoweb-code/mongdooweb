"use server";
// คูปองส่วนลด (A2): สร้าง/แก้/เปิด-ปิด/ลบ (ลบได้เฉพาะที่ยังไม่ถูกใช้ — ที่ใช้แล้วให้ปิดแทน เพื่อเก็บรายงาน)
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { couponEnd, couponLabel, couponStart, normCouponCode } from "@/lib/coupon-calc";
import { prisma } from "@/lib/prisma";
import { Prisma } from "../../../../../generated/prisma/client";

export type CouponState = { error?: string; fields?: string[] };

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const satang = (v: string) => {
  const n = Number(v.replace(/[,\s฿]/g, ""));
  return v === "" ? null : Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) : NaN;
};
const intOrNull = (v: string) => (v === "" ? null : /^\d{1,7}$/.test(v) && Number(v) > 0 ? Number(v) : NaN);

export async function saveCoupon(_prev: CouponState, f: FormData): Promise<CouponState> {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const bad: string[] = [];
  const msgs: string[] = [];
  const code = normCouponCode(str(f, "code", 40));
  if (!code) { bad.push("code"); msgs.push("โค้ดต้องเป็น A–Z, 0–9 หรือ - ยาว 3–30 ตัว"); }
  const kind = f.get("kind") === "FIXED" ? "FIXED" : "PERCENT";
  const rawValue = Number(str(f, "value", 20).replace(/[,\s฿%]/g, ""));
  const value = kind === "PERCENT" ? Math.round(rawValue * 100) : Math.round(rawValue * 100);
  if (!Number.isFinite(rawValue) || rawValue <= 0 || (kind === "PERCENT" && value > 10000)) { bad.push("value"); msgs.push(kind === "PERCENT" ? "ส่วนลด % ต้องมากกว่า 0 และไม่เกิน 100" : "ส่วนลด (บาท) ต้องมากกว่า 0"); }
  const minOrder = satang(str(f, "minOrder", 20)) ?? 0;
  if (Number.isNaN(minOrder)) { bad.push("minOrder"); msgs.push("ยอดขั้นต่ำไม่ถูกต้อง"); }
  const maxDiscount = kind === "PERCENT" ? satang(str(f, "maxDiscount", 20)) : null;
  if (maxDiscount != null && Number.isNaN(maxDiscount)) { bad.push("maxDiscount"); msgs.push("เพดานส่วนลดไม่ถูกต้อง"); }
  const startsAt = str(f, "startsAt", 10) ? couponStart(str(f, "startsAt", 10)) : null;
  const endsAt = str(f, "endsAt", 10) ? couponEnd(str(f, "endsAt", 10)) : null;
  if (str(f, "startsAt", 10) && !startsAt) bad.push("startsAt");
  if (str(f, "endsAt", 10) && !endsAt) bad.push("endsAt");
  if (startsAt && endsAt && startsAt >= endsAt) { bad.push("endsAt"); msgs.push("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม"); }
  const usageLimit = intOrNull(str(f, "usageLimit", 8));
  const perPhoneLimit = intOrNull(str(f, "perPhoneLimit", 8));
  if (Number.isNaN(usageLimit)) { bad.push("usageLimit"); msgs.push("จำนวนครั้งทั้งหมดต้องเป็นจำนวนเต็มบวก"); }
  if (Number.isNaN(perPhoneLimit)) { bad.push("perPhoneLimit"); msgs.push("จำนวนครั้งต่อเบอร์ต้องเป็นจำนวนเต็มบวก"); }
  const cats = f.getAll("categoryIds").map(String).filter((x) => /^[\w-]{1,40}$/.test(x)).slice(0, 100);
  const valid = cats.length ? await prisma.category.findMany({ where: { id: { in: cats } }, select: { id: true } }) : [];
  if (bad.length) return { error: msgs.length ? `กรุณาแก้ไข: ${[...new Set(msgs)].join(" · ")}` : "กรุณาตรวจช่องที่มีกรอบสีแดง", fields: bad };

  const data = {
    code, kind, value, minOrderSatang: minOrder as number, maxDiscountSatang: maxDiscount as number | null, startsAt, endsAt,
    usageLimit: usageLimit as number | null, perPhoneLimit: perPhoneLimit as number | null, categoryIds: valid.map((c) => c.id),
    isActive: f.get("isActive") === "on", note: str(f, "note", 300) || null,
  } as const;
  let saved;
  try {
    saved = id ? await prisma.coupon.update({ where: { id }, data }) : await prisma.coupon.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: `มีโค้ด ${code} อยู่แล้ว`, fields: ["code"] };
    throw e;
  }
  await logAdmin(admin.id, "COUPON", `${id ? "แก้" : "สร้าง"}คูปอง ${code} (${couponLabel(saved)})${saved.isActive ? "" : " · ปิดใช้"}`);
  redirect(`/admin/coupons/${saved.id}?saved=1`);
}

export async function toggleCoupon(f: FormData) {
  const admin = await requireAdmin();
  const c = await prisma.coupon.findUnique({ where: { id: str(f, "id", 40) } });
  if (c) {
    await prisma.coupon.update({ where: { id: c.id }, data: { isActive: !c.isActive } });
    await logAdmin(admin.id, "COUPON", `${c.isActive ? "ปิด" : "เปิด"}คูปอง ${c.code}`);
  }
  redirect(str(f, "ret") === "detail" && c ? `/admin/coupons/${c.id}` : "/admin/coupons");
}

export async function deleteCoupon(f: FormData) {
  const admin = await requireAdmin();
  const c = await prisma.coupon.findUnique({ where: { id: str(f, "id", 40) }, include: { _count: { select: { redemptions: true } } } });
  if (!c) redirect("/admin/coupons");
  if (c._count.redemptions > 0) redirect(`/admin/coupons/${c.id}?err=used`);
  await prisma.coupon.delete({ where: { id: c.id } });
  await logAdmin(admin.id, "COUPON", `ลบคูปอง ${c.code}`);
  redirect("/admin/coupons?deleted=1");
}
