"use server";
// สไลด์หน้าแรก: เพิ่ม/แก้ไข/เรียง/ลบ/คัดลอก + ย้อนกลับเวอร์ชัน (สูงสุด 8 สไลด์)
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { baseline, snapshot } from "@/lib/content-version";
import { MediaError, saveImage } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export type SlideState = { error?: string; fields?: string[]; ok?: string };
const MAX_SLIDES = 8;
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
/** ลิงก์ที่อนุญาต: #..., /..., http(s)://, tel:, mailto: (เหมือนต้นแบบ) */
const safeHref = (h: string) => /^#[^\s]*$/.test(h) || /^\/(?!\/)\S*$/.test(h) || /^https?:\/\/\S+$/i.test(h) || /^(tel|mailto):\S+$/i.test(h);
/** datetime-local (เวลาไทย) → Date */
const bkk = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00+07:00`) : null);

export async function saveSlide(_prev: SlideState, f: FormData): Promise<SlideState> {
  const admin = await requireAdmin();
  await baseline("SLIDES", admin.displayName);
  const id = str(f, "id", 40);
  if (!id && (await prisma.heroSlide.count()) >= MAX_SLIDES) return { error: `มีสไลด์ครบ ${MAX_SLIDES} สไลด์แล้ว ลบสไลด์เก่าก่อน` };
  const bad: string[] = [];
  const title = str(f, "title", 120);
  if (!title) bad.push("title");
  const cta1Label = str(f, "cta1Label", 40);
  const cta1Href = str(f, "cta1Href", 300);
  if (!cta1Label) bad.push("cta1Label");
  if (!safeHref(cta1Href)) bad.push("cta1Href");
  const cta2Label = str(f, "cta2Label", 40);
  const cta2Href = str(f, "cta2Href", 300);
  if ((cta2Label || cta2Href) && (!cta2Label || !safeHref(cta2Href))) bad.push("cta2Href");
  const imageUrl = str(f, "imageUrl", 500);
  if (imageUrl && !/^https:\/\/[^\s"'<>]+$/i.test(imageUrl)) bad.push("imageUrl");
  const startAt = str(f, "startAt", 20) ? bkk(str(f, "startAt", 20)) : null;
  const endAt = str(f, "endAt", 20) ? bkk(str(f, "endAt", 20)) : null;
  if ((str(f, "startAt", 20) && !startAt) || (str(f, "endAt", 20) && !endAt) || (startAt && endAt && startAt >= endAt)) bad.push("endAt");
  const alt = str(f, "alt", 200);
  if (!alt) bad.push("alt");
  if (bad.length) return { error: bad.includes("endAt") ? "วันเวลาสิ้นสุดต้องอยู่หลังวันเริ่ม" : bad.some((b) => b.endsWith("Href")) ? "ลิงก์ปุ่มต้องขึ้นต้นด้วย / # https:// tel: หรือ mailto:" : "กรุณาตรวจช่องที่มีกรอบสีแดง", fields: bad };

  let imageKey: string | null | undefined = undefined;
  const file = f.get("image");
  if (file instanceof File && file.size > 0) {
    try {
      imageKey = await saveImage(Buffer.from(await file.arrayBuffer()), "slides", { full: 2400, thumb: 828 });
    } catch (e) {
      return { error: e instanceof MediaError ? e.message : "อัปโหลดรูปไม่สำเร็จ", fields: ["image"] };
    }
  } else if (f.get("clearImage") === "on") imageKey = null;
  const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(Number.isFinite(n) ? n : a)));
  const data = {
    title,
    eyebrow: str(f, "eyebrow", 60),
    subtitle: str(f, "subtitle", 240),
    alt,
    credit: str(f, "credit", 120),
    cta1Label,
    cta1Href,
    cta2Label: cta2Label || null,
    cta2Href: cta2Label ? cta2Href : null,
    align: f.get("align") === "CENTER" ? ("CENTER" as const) : ("LEFT" as const),
    overlay: clamp(Number(str(f, "overlay", 3)), 30, 90),
    focalX: clamp(Number(str(f, "focalX", 3)), 0, 100),
    focalY: clamp(Number(str(f, "focalY", 3)), 0, 100),
    startAt,
    endAt,
    isActive: f.get("isActive") === "on",
    imageUrl: imageUrl || null,
    ...(imageKey !== undefined ? { imageKey } : {}),
  };
  // ต้องมีรูปอย่างใดอย่างหนึ่ง
  const prev = id ? await prisma.heroSlide.findUnique({ where: { id } }) : null;
  if (!(data.imageKey ?? prev?.imageKey) && !data.imageUrl) return { error: "กรุณาอัปโหลดรูป หรือใส่ URL รูป https://", fields: ["image"] };

  let saved;
  if (id) saved = await prisma.heroSlide.update({ where: { id }, data });
  else {
    const last = await prisma.heroSlide.aggregate({ _max: { sortOrder: true } });
    saved = await prisma.heroSlide.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  await snapshot("SLIDES", admin.displayName);
  await logAdmin(admin.id, "SLIDES", `${id ? "แก้ไข" : "เพิ่ม"}สไลด์ "${title}"`);
  refreshStorefront();
  if (!id) redirect(`/admin/slides/${saved.id}?saved=1`);
  refresh();
  return { ok: "บันทึกสไลด์แล้ว — หน้าแรกแสดงทันที" };
}

export async function moveSlide(f: FormData) {
  const admin = await requireAdmin();
  await baseline("SLIDES", admin.displayName);
  const id = str(f, "id", 40);
  const dir = f.get("dir") === "up" ? -1 : 1;
  const list = await prisma.heroSlide.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } });
  const i = list.findIndex((s) => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await prisma.$transaction(list.map((s, k) => prisma.heroSlide.update({ where: { id: s.id }, data: { sortOrder: k + 1 } })));
  await snapshot("SLIDES", admin.displayName);
  refreshStorefront();
  refresh();
}

export async function toggleSlide(f: FormData) {
  const admin = await requireAdmin();
  await baseline("SLIDES", admin.displayName);
  const s = await prisma.heroSlide.findUnique({ where: { id: str(f, "id", 40) } });
  if (!s) return;
  if (s.isActive && (await prisma.heroSlide.count({ where: { isActive: true } })) <= 1) redirect("/admin/slides?err=last");
  await prisma.heroSlide.update({ where: { id: s.id }, data: { isActive: !s.isActive } });
  await snapshot("SLIDES", admin.displayName);
  await logAdmin(admin.id, "SLIDES", `${s.isActive ? "ซ่อน" : "แสดง"}สไลด์ "${s.title}"`);
  refreshStorefront();
  refresh();
}

export async function duplicateSlide(f: FormData) {
  const admin = await requireAdmin();
  await baseline("SLIDES", admin.displayName);
  if ((await prisma.heroSlide.count()) >= MAX_SLIDES) redirect("/admin/slides?err=max");
  const s = await prisma.heroSlide.findUnique({ where: { id: str(f, "id", 40) } });
  if (!s) return;
  const last = await prisma.heroSlide.aggregate({ _max: { sortOrder: true } });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, updatedAt, ...rest } = s;
  const copy = await prisma.heroSlide.create({ data: { ...rest, title: `${s.title} (สำเนา)`.slice(0, 120), isActive: false, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  await snapshot("SLIDES", admin.displayName);
  await logAdmin(admin.id, "SLIDES", `คัดลอกสไลด์ "${s.title}"`);
  redirect(`/admin/slides/${copy.id}`);
}

export async function deleteSlide(f: FormData) {
  const admin = await requireAdmin();
  await baseline("SLIDES", admin.displayName);
  const s = await prisma.heroSlide.findUnique({ where: { id: str(f, "id", 40) } });
  if (!s) redirect("/admin/slides");
  if ((await prisma.heroSlide.count()) <= 1) redirect("/admin/slides?err=last");
  await prisma.heroSlide.delete({ where: { id: s.id } });
  await snapshot("SLIDES", admin.displayName);
  await logAdmin(admin.id, "SLIDES", `ลบสไลด์ "${s.title}"`);
  refreshStorefront();
  redirect("/admin/slides?deleted=1");
}

/** ย้อนกลับสไลด์ทั้งชุดเป็นเวอร์ชันที่เลือก (แทนที่ทั้งหมด) */
export async function rollbackSlides(f: FormData) {
  const admin = await requireAdmin();
  const v = await prisma.contentVersion.findUnique({ where: { id: str(f, "versionId", 40) } });
  if (!v || v.kind !== "SLIDES" || !Array.isArray(v.snapshot) || !v.snapshot.length) redirect("/admin/slides");
  type Row = Record<string, unknown>;
  const rows = (v.snapshot as Row[]).slice(0, MAX_SLIDES);
  const date = (x: unknown) => (typeof x === "string" ? new Date(x) : null);
  await prisma.$transaction([
    prisma.heroSlide.deleteMany({}),
    ...rows.map((r) =>
      prisma.heroSlide.create({
        data: {
          sortOrder: Number(r.sortOrder) || 0, isActive: !!r.isActive, imageKey: (r.imageKey as string) ?? null, imageUrl: (r.imageUrl as string) ?? null,
          focalX: Number(r.focalX) || 50, focalY: Number(r.focalY) || 50, alt: String(r.alt ?? ""), eyebrow: String(r.eyebrow ?? ""), title: String(r.title ?? ""),
          subtitle: String(r.subtitle ?? ""), cta1Label: String(r.cta1Label ?? ""), cta1Href: String(r.cta1Href ?? "#"), cta2Label: (r.cta2Label as string) ?? null,
          cta2Href: (r.cta2Href as string) ?? null, align: r.align === "CENTER" ? "CENTER" : "LEFT", overlay: Number(r.overlay) || 55,
          startAt: date(r.startAt), endAt: date(r.endAt), credit: String(r.credit ?? ""),
        },
      }),
    ),
  ]);
  await snapshot("SLIDES", admin.displayName);
  await logAdmin(admin.id, "CONTENT_ROLLBACK", `ย้อนสไลด์เป็นเวอร์ชัน ${v.publishedAt.toISOString()}`);
  refreshStorefront();
  redirect("/admin/slides?rolledback=1");
}
