// รีวิวสินค้าจากผู้ซื้อจริง (U4/A4)
// - ยืนยันผู้ซื้อด้วย "เลขที่คำสั่งซื้อ + เบอร์โทร" ของคำสั่งซื้อที่ชำระแล้ว/ส่งแล้ว และมีสินค้านั้นอยู่จริง
// - รีวิวได้ครั้งเดียวต่อ (คำสั่งซื้อ, สินค้า) — ฐานข้อมูลบังคับด้วย @@unique([orderId, productId])
// - รีวิวใหม่ = รออนุมัติ (PENDING) ไม่แสดงหน้าร้านจนกว่าแอดมินอนุมัติ
// - คะแนนเฉลี่ย/จำนวนรีวิวของสินค้า (Product.ratingAvg/ratingCount) คำนวณใหม่จากรีวิวที่อนุมัติแล้วใน transaction เดียวกับการเปลี่ยนสถานะ
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Prisma, ReviewStatus } from "../../generated/prisma/client";
import { phoneDigits } from "@/lib/format";
import { MediaError, mediaUrl, saveImage } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";
import { storage } from "@/lib/storage";

type Tx = Prisma.TransactionClient;

export const REVIEW_STATUS: Record<ReviewStatus, string> = { PENDING: "รออนุมัติ", APPROVED: "แสดงอยู่", HIDDEN: "ซ่อน" };
export const REVIEW_MAX_FILES = 3;
export const REVIEW_FILE_MAX = 10 * 1024 * 1024;

export class ReviewError extends Error {
  constructor(message: string, public status = 400, public fields: string[] = []) {
    super(message);
  }
}

/** ชื่อที่แสดง: ชื่อต้น + อักษรแรกของนามสกุล ("สมชาย ใจดี" → "สมชาย ใ.") */
export function shortName(full: string) {
  const parts = full.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "ลูกค้า";
  const first = parts[0].slice(0, 30);
  return parts.length > 1 ? `${first} ${[...parts[parts.length - 1]][0]}.` : first;
}

/** คะแนนเฉลี่ย/จำนวนจากรีวิวที่อนุมัติแล้ว → เขียนลง Product (เรียกใน transaction ของงานที่เปลี่ยนสถานะ) */
export async function recomputeRating(tx: Tx, productId: string) {
  const agg = await tx.review.aggregate({ where: { productId, status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } });
  const count = agg._count._all;
  const avg = count ? Math.round((agg._avg.rating ?? 0) * 100) / 100 : null;
  await tx.product.update({ where: { id: productId }, data: { ratingAvg: avg, ratingCount: count } });
  return { avg, count };
}

/** คำสั่งซื้อที่ใช้ยืนยันรีวิวได้ (ชำระแล้ว/ส่งแล้ว เบอร์ตรง มีสินค้านี้) — ข้อความผิดพลาดไม่บอกว่าส่วนไหนผิด (กันเดาข้อมูล) */
export async function verifiedOrder(orderNoRaw: string, phoneRaw: string, productId: string) {
  const orderNo = orderNoRaw.trim().toUpperCase().slice(0, 40);
  const phone = phoneDigits(phoneRaw).slice(0, 15);
  if (!orderNo || phone.length < 9) throw new ReviewError("กรุณากรอกเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่งซื้อ", 400, ["orderNo", "phone"]);
  const o = await prisma.order.findUnique({
    where: { orderNo },
    select: { id: true, phone: true, status: true, customerName: true, items: { select: { productId: true } } },
  });
  if (!o || phoneDigits(o.phone) !== phone) throw new ReviewError("ไม่พบคำสั่งซื้อ ตรวจเลขที่และเบอร์โทรอีกครั้ง", 404, ["orderNo", "phone"]);
  if (!o.items.some((i) => i.productId === productId)) throw new ReviewError("คำสั่งซื้อนี้ไม่มีสินค้านี้ — รีวิวได้เฉพาะสินค้าที่ซื้อจริง", 403, ["orderNo"]);
  if (o.status !== "PAID" && o.status !== "SHIPPED") throw new ReviewError("รีวิวได้หลังร้านยืนยันการชำระเงินแล้ว", 403, ["orderNo"]);
  return o;
}

/** สร้างรีวิว (รออนุมัติ) จากฟอร์มหน้าร้าน */
export async function createReview(form: FormData) {
  const slug = String(form.get("product") ?? "").trim().slice(0, 120);
  const product = slug ? await prisma.product.findFirst({ where: { slug, isActive: true }, select: { id: true, name: true } }) : null;
  if (!product) throw new ReviewError("ไม่พบสินค้า", 404);
  const rating = Math.floor(Number(form.get("rating")));
  const body = String(form.get("body") ?? "").normalize("NFC").replace(/\r\n?/g, "\n").trim().slice(0, 2000);
  const fields: string[] = [];
  if (!(rating >= 1 && rating <= 5)) fields.push("rating");
  if (body.length < 10) fields.push("body");
  if (fields.length) throw new ReviewError(fields[0] === "rating" ? "กรุณาให้คะแนน 1–5 ดาว" : "กรุณาเขียนรีวิวอย่างน้อย 10 ตัวอักษร", 400, fields);
  const order = await verifiedOrder(String(form.get("orderNo") ?? ""), String(form.get("phone") ?? ""), product.id);
  if (await prisma.review.findUnique({ where: { orderId_productId: { orderId: order.id, productId: product.id } }, select: { id: true } }))
    throw new ReviewError("คุณรีวิวสินค้านี้จากคำสั่งซื้อนี้แล้ว ขอบคุณครับ/ค่ะ", 409, ["orderNo"]);

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > REVIEW_MAX_FILES) throw new ReviewError(`แนบรูปได้ไม่เกิน ${REVIEW_MAX_FILES} รูป`, 400, ["files"]);
  const keys: string[] = [];
  try {
    for (const f of files) {
      if (f.size > REVIEW_FILE_MAX) throw new ReviewError("รูปใหญ่เกิน 10 MB", 400, ["files"]);
      // ตรวจชนิดจากไบต์จริง + ย่อเป็น WebP (ตัดข้อมูล EXIF/ตำแหน่ง GPS ทิ้งไปด้วย)
      keys.push(await saveImage(Buffer.from(await f.arrayBuffer()), "reviews", { full: 1200, thumb: 320 }));
    }
    const name = String(form.get("name") ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 40) || shortName(order.customerName);
    return await prisma.review.create({
      data: { productId: product.id, orderId: order.id, name, phone: phoneDigits(order.phone), rating, body, images: keys, status: "PENDING" },
      select: { id: true, rating: true, name: true, body: true, images: true, product: { select: { name: true, sku: true } } },
    });
  } catch (e) {
    await deleteImages(keys);
    if (e instanceof MediaError) throw new ReviewError(e.message, 400, ["files"]);
    if ((e as { code?: string }).code === "P2002") throw new ReviewError("คุณรีวิวสินค้านี้จากคำสั่งซื้อนี้แล้ว ขอบคุณครับ/ค่ะ", 409, ["orderNo"]);
    throw e;
  }
}

export async function deleteImages(keys: string[]) {
  await Promise.all(
    keys
      .filter((k) => k.startsWith("reviews/"))
      .flatMap((k) => [k, k.replace(/\.webp$/, "-sm.webp")])
      .map((k) => storage().delete(k).catch(() => {})),
  );
}

/** ข้อความแจ้งร้านทาง LINE เมื่อมีรีวิวใหม่รออนุมัติ */
export function reviewLineText(r: { rating: number; name: string; body: string; images: string[]; product: { name: string; sku: string } }, base: string) {
  return [
    `⭐ รีวิวใหม่รออนุมัติ ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}`,
    `${r.product.name} (${r.product.sku})`,
    `โดย ${r.name}${r.images.length ? ` · รูป ${r.images.length}` : ""}`,
    `"${r.body.slice(0, 120)}${r.body.length > 120 ? "…" : ""}"`,
    "",
    `ตรวจ: ${base}/admin/reviews`,
  ].join("\n");
}

// ---------- หน้าร้าน ----------

export type PublicReview = { id: string; name: string; rating: number; body: string; images: { full: string; sm: string }[]; reply: string | null; date: string };
export type ReviewSummary = { avg: number; count: number; dist: number[]; list: PublicReview[] };

/** รีวิวที่อนุมัติแล้วของสินค้า (แคช — ล้างด้วย tag storefront เมื่อหลังบ้านอนุมัติ/ซ่อน/ตอบ) */
export async function getProductReviews(slug: string): Promise<ReviewSummary | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const p = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
  if (!p) return null;
  const [rows, groups] = await Promise.all([
    prisma.review.findMany({ where: { productId: p.id, status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.review.groupBy({ by: ["rating"], where: { productId: p.id, status: "APPROVED" }, _count: { _all: true } }),
  ]);
  const dist = [1, 2, 3, 4, 5].map((n) => groups.find((g) => g.rating === n)?._count._all ?? 0);
  const count = dist.reduce((a, b) => a + b, 0);
  const avg = count ? Math.round((dist.reduce((s, c, i) => s + c * (i + 1), 0) / count) * 10) / 10 : 0;
  return {
    avg,
    count,
    dist,
    list: rows.map((r) => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      body: r.body,
      images: r.images.map((k) => ({ full: mediaUrl(k)!, sm: mediaUrl(k, "sm")! })),
      reply: r.reply,
      date: r.createdAt.toISOString(),
    })),
  };
}

/** คะแนนรวมทั้งร้าน (ส่วนความน่าเชื่อถือหน้าแรก) */
export async function getShopRating() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const agg = await prisma.review.aggregate({ where: { status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } });
  const count = agg._count._all;
  return { avg: count ? Math.round((agg._avg.rating ?? 0) * 10) / 10 : 0, count };
}
