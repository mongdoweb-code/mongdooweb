// ตรวจรูปภาพทั้งร้าน (A15): หารูปที่หาย (ไม่มีไฟล์) / เสีย (เปิดไม่ได้) / ยังไม่มีรูปย่อ / ลิงก์ภายนอกเปิดไม่ได้
// + สร้างรูปย่อใหม่เป็นชุด (สำหรับรูปที่อัปโหลดก่อนมีระบบรูปหลายขนาด U14)
import "server-only";
import sharp from "sharp";
import { AVIF_SUPPORTED, generateVariants, variantKey } from "@/lib/media";
import { IMG_WIDTHS } from "@/lib/img-srcset";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export type ImageRef = { where: string; label: string; href: string; key: string; external: boolean };
export type ImageIssue = ImageRef & { problem: "missing" | "broken" | "external" | "no-variants"; detail?: string };
export const PROBLEM_TH: Record<ImageIssue["problem"], string> = {
  missing: "ไม่พบไฟล์รูป", broken: "ไฟล์รูปเสีย/เปิดไม่ได้", external: "ลิงก์รูปภายนอกเปิดไม่ได้", "no-variants": "ยังไม่มีรูปย่อหลายขนาด",
};

/** ทุกรูปที่หน้าร้านใช้: สินค้า สไลด์ โลโก้ บทความ ผลงาน */
export async function imageRefs(): Promise<ImageRef[]> {
  const [products, slides, shop, posts, projects] = await Promise.all([
    prisma.product.findMany({ where: { images: { isEmpty: false } }, select: { id: true, sku: true, name: true, images: true } }),
    prisma.heroSlide.findMany({ select: { id: true, title: true, imageKey: true, imageUrl: true } }),
    prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { logoKey: true } }),
    prisma.post.findMany({ where: { coverKey: { not: null } }, select: { id: true, title: true, coverKey: true } }),
    prisma.project.findMany({ where: { images: { isEmpty: false } }, select: { id: true, title: true, images: true } }),
  ]);
  const ext = (k: string) => /^https?:\/\//i.test(k);
  return [
    ...products.flatMap((p) => p.images.map((k, i) => ({ where: "สินค้า", label: `${p.sku} · ${p.name} (รูปที่ ${i + 1})`, href: `/admin/products/${p.id}`, key: k, external: ext(k) }))),
    ...slides.flatMap((s) => {
      const k = s.imageKey ?? s.imageUrl;
      return k ? [{ where: "สไลด์", label: s.title, href: `/admin/slides/${s.id}`, key: k, external: !s.imageKey }] : [];
    }),
    ...(shop?.logoKey ? [{ where: "โลโก้", label: "โลโก้ร้าน", href: "/admin/settings", key: shop.logoKey, external: ext(shop.logoKey) }] : []),
    ...posts.map((p) => ({ where: "บทความ", label: p.title, href: `/admin/posts/${p.id}`, key: p.coverKey!, external: ext(p.coverKey!) })),
    ...projects.flatMap((p) => p.images.map((k, i) => ({ where: "ผลงาน", label: `${p.title} (รูปที่ ${i + 1})`, href: `/admin/projects/${p.id}`, key: k, external: ext(k) }))),
  ];
}

async function checkExternal(url: string) {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000), redirect: "follow" });
    return r.ok && /^image\//.test(r.headers.get("content-type") ?? "image/") ? null : `HTTP ${r.status}`;
  } catch (e) {
    return e instanceof Error ? e.name : "error";
  }
}

/** ตรวจทุกรูป (อ่านไฟล์จาก storage จริง) — ทำพร้อมกันทีละ 8 */
export async function scanImages() {
  const refs = await imageRefs();
  const issues: ImageIssue[] = [];
  let ok = 0, withVariants = 0;
  const local = refs.filter((r) => !r.external);
  const checkKey = async (r: ImageRef) => {
    let buf: Buffer | null = null;
    try {
      buf = await storage().get(r.key);
    } catch {
      buf = null;
    }
    if (!buf) return issues.push({ ...r, problem: "missing" });
    try {
      const m = await sharp(buf).metadata();
      if (!m.width || !m.height) throw new Error("no size");
    } catch {
      return issues.push({ ...r, problem: "broken" });
    }
    ok++;
    if (!/\.webp$/.test(r.key)) return;
    const has = await storage().get(variantKey(r.key, IMG_WIDTHS[1])).catch(() => null);
    if (has) withVariants++;
    else issues.push({ ...r, problem: "no-variants" });
  };
  for (let i = 0; i < local.length; i += 8) await Promise.all(local.slice(i, i + 8).map(checkKey));
  const externals = [...new Map(refs.filter((r) => r.external).map((r) => [r.key, r])).values()];
  for (let i = 0; i < externals.length; i += 8)
    await Promise.all(externals.slice(i, i + 8).map(async (r) => {
      const why = await checkExternal(r.key);
      if (why) issues.push({ ...r, problem: "external", detail: why });
      else ok++;
    }));
  return { total: refs.length, local: local.length, external: externals.length, ok, withVariants, issues, avif: AVIF_SUPPORTED };
}

/** key ของรูปที่อัปโหลด (ไม่ซ้ำ เรียงคงที่) — ใช้แบ่งชุดตอนสร้างรูปย่อใหม่ */
export async function localKeys() {
  const refs = await imageRefs();
  return [...new Set(refs.filter((r) => !r.external && /\.webp$/.test(r.key) && !r.key.startsWith("logo/")).map((r) => r.key))].sort();
}

/** สร้างรูปย่อของรูปลำดับ [offset, offset+limit) — only: เฉพาะ key ที่มีข้อความนี้ (เช่น ชื่อโฟลเดอร์/รหัสรูป) · ทำพร้อมกัน 3 รูป */
export async function regenerateBatch(offset: number, limit: number, force: boolean, only = "") {
  const keys = (await localKeys()).filter((k) => !only || k.includes(only));
  const slice = keys.slice(offset, offset + limit);
  let created = 0;
  const errors: string[] = [];
  for (let i = 0; i < slice.length; i += 3)
    await Promise.all(slice.slice(i, i + 3).map(async (k) => {
      try {
        created += await generateVariants(k, { force });
      } catch (e) {
        errors.push(`${k}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }));
  return { total: keys.length, next: offset + slice.length, created, errors };
}

/** เอารูปที่ไม่มีไฟล์แล้วออกจากรายการรูปของสินค้า (ไม่แตะรูปที่ยังอยู่) */
/**
 * เอารูปที่ไม่มีไฟล์จริงออกจากสินค้า — ป้องกันการลบผิดพลาดแบบเหมาเข่ง:
 * - อ่านไฟล์ไม่ได้เพราะ error (เช่น S3 ล่ม/ตั้งค่าผิด) = เก็บรูปไว้ ไม่นับว่า "หาย"
 * - ถ้ารูปที่หายมีมากผิดปกติ (> 10 รูป และ > 20% ของรูปทั้งหมดในที่เก็บไฟล์) = ไม่ลบเลย เพราะน่าจะเป็นปัญหาที่เก็บไฟล์ ไม่ใช่รูปหายจริง
 */
export async function dropMissingProductImages(): Promise<{ changed: { id: string; sku: string; removed: string[] }[]; refused?: { missing: number; total: number } }> {
  const products = await prisma.product.findMany({ where: { images: { isEmpty: false } }, select: { id: true, sku: true, images: true } });
  const plan: { id: string; sku: string; keep: string[]; removed: string[] }[] = [];
  let total = 0, missing = 0;
  for (const p of products) {
    const keep: string[] = [], removed: string[] = [];
    for (const k of p.images) {
      if (/^https?:\/\//i.test(k)) { keep.push(k); continue; }
      total++;
      let has: Buffer | null | "error";
      try { has = await storage().get(k); } catch { has = "error"; }
      if (has === null) { removed.push(k); missing++; } else keep.push(k);
    }
    if (removed.length) plan.push({ id: p.id, sku: p.sku, keep, removed });
  }
  if (missing > 10 && missing > total * 0.2) return { changed: [], refused: { missing, total } };
  for (const c of plan) await prisma.product.update({ where: { id: c.id }, data: { images: c.keep } });
  return { changed: plan.map(({ id, sku, removed }) => ({ id, sku, removed })) };
}
