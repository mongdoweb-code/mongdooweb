"use server";
// วิดีโอ (/admin/videos): เพิ่มจากลิงก์ (YouTube/Facebook/TikTok/Instagram) หรือไฟล์ที่อัปโหลด · แก้ไข · ซ่อน/แสดง · เรียงลำดับ · ลบ
// ลิงก์ตรวจซ้ำที่ server เสมอ (parseVideoLink) · ไฟล์/รูปปกรับเฉพาะ key ที่ระบบสร้าง · ทุกการเปลี่ยนแปลงบันทึกประวัติ + ล้างแคชหน้าร้าน
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { isPosterKey, isVideoKey } from "@/lib/video";
import { VIDEO_SOURCES, cleanTitle, cleanTopic, linkError, parseVideoLink, youtubeThumb } from "@/lib/video-links";

export type VideoResult = { ok?: string; error?: string; fields?: string[]; id?: string };
export type VideoPayload = {
  id?: string;
  /** link = ลิงก์แพลตฟอร์ม · upload = ไฟล์ที่อัปโหลด (เฉพาะตอนสร้าง) */
  kind: "link" | "upload";
  url?: string;
  fileKey?: string | null;
  seconds?: number | null;
  hevc?: boolean;
  posterKey?: string | null;
  title: string;
  topic?: string;
  vertical: boolean;
  productId?: string | null;
  /** now = แสดงทันที · hidden = ซ่อน · schedule = ตั้งเวลา (publishAt "YYYY-MM-DDTHH:mm" เวลาไทย) */
  publish: "now" | "hidden" | "schedule";
  publishAt?: string;
  featured: boolean;
};

/** ดึงชื่อคลิปจาก oEmbed ของ YouTube / TikTok (ไม่ต้องใช้คีย์) — ใช้ไม่ได้ก็ไม่เป็นไร ผู้ใช้พิมพ์ชื่อเอง */
export async function fetchVideoMeta(url: string): Promise<{ title?: string; error?: string }> {
  await requireAdmin();
  const p = parseVideoLink(String(url ?? ""));
  if (!p) return { error: linkError(String(url ?? "")) };
  const api = p.source === "YOUTUBE" ? "https://www.youtube.com/oembed?format=json&url=" : p.source === "TIKTOK" ? "https://www.tiktok.com/oembed?url=" : null;
  if (!api) return {};
  try {
    const r = await fetch(api + encodeURIComponent(p.url), { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return r.status === 404 || r.status === 401 || r.status === 403 ? { error: "คลิปนี้เป็นส่วนตัวหรือถูกลบ — ตรวจลิงก์อีกครั้ง (คลิปต้องเปิดสาธารณะจึงฝังในเว็บได้)" } : {};
    const j = (await r.json()) as { title?: unknown };
    return { title: cleanTitle(j.title) || undefined };
  } catch {
    return {};
  }
}

/** "YYYY-MM-DDTHH:mm" (เวลาไทย) → Date */
const bkk = (s: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00+07:00`) : null);

export async function saveVideo(p: VideoPayload): Promise<VideoResult> {
  const admin = await requireAdmin();
  if (!p || typeof p !== "object") return { error: "ข้อมูลไม่ถูกต้อง ลองโหลดหน้าใหม่" };
  const id = typeof p.id === "string" ? p.id.slice(0, 40) : "";
  const old = id ? await prisma.video.findUnique({ where: { id } }) : null;
  if (id && !old) return { error: "ไม่พบคลิป (อาจถูกลบไปแล้ว)" };
  const bad: string[] = [], msgs: string[] = [];

  // แหล่งคลิป
  let source = old?.source ?? (p.kind === "upload" ? "UPLOAD" : null);
  let url: string | null = old?.url ?? null, externalId: string | null = old?.externalId ?? null, thumbUrl: string | null = old?.thumbUrl ?? null;
  let fileKey: string | null = old?.fileKey ?? null, seconds: number | null = old?.seconds ?? null, hevc = old?.hevc ?? false;
  if (source !== "UPLOAD") {
    const link = parseVideoLink(String(p.url ?? ""));
    if (!link) { bad.push("url"); msgs.push(linkError(String(p.url ?? ""))); }
    else {
      source = link.source;
      url = link.url;
      externalId = link.id;
      thumbUrl = link.source === "YOUTUBE" && link.id ? youtubeThumb(link.id) : null;
    }
  } else if (!old) {
    if (!isVideoKey(p.fileKey) || (await storage().size(p.fileKey).catch(() => null)) == null) { bad.push("file"); msgs.push("อัปโหลดไฟล์วิดีโอก่อน (หรือรอให้อัปโหลดเสร็จ)"); }
    else {
      fileKey = p.fileKey;
      seconds = Number.isInteger(p.seconds) && p.seconds! > 0 && p.seconds! <= 10800 ? p.seconds! : null;
      hevc = p.hevc === true;
    }
  }
  const title = cleanTitle(p.title);
  if (title.length < 2) { bad.push("title"); msgs.push("กรุณาใส่ชื่อคลิป"); }
  const topic = cleanTopic(p.topic) || null;
  const posterKey = p.posterKey == null || p.posterKey === "" ? null : isPosterKey(p.posterKey) ? p.posterKey : undefined;
  if (posterKey === undefined) { bad.push("poster"); msgs.push("รูปปกไม่ถูกต้อง — อัปโหลดใหม่"); }
  let productId: string | null = null;
  if (p.productId) {
    const pr = await prisma.product.findUnique({ where: { id: String(p.productId).slice(0, 40) }, select: { id: true } });
    if (!pr) { bad.push("product"); msgs.push("ไม่พบสินค้าที่เลือก — เลือกใหม่จากรายการ"); }
    else productId = pr.id;
  }
  let publishAt: Date | null = null;
  if (p.publish === "schedule") {
    publishAt = bkk(String(p.publishAt ?? ""));
    if (!publishAt) { bad.push("publishAt"); msgs.push("กรุณาเลือกวันและเวลาเผยแพร่"); }
  }
  if (bad.length || !source) return { error: msgs.join(" · ") || "กรุณาตรวจข้อมูล", fields: bad };

  const data = {
    url, externalId, thumbUrl, fileKey, seconds, hevc, title, topic,
    posterKey: posterKey ?? null,
    vertical: p.vertical === true,
    productId,
    isActive: p.publish !== "hidden",
    publishAt: p.publish === "schedule" ? publishAt : null,
    featured: p.featured === true,
  };
  let saved;
  if (old) {
    saved = await prisma.video.update({ where: { id: old.id }, data: { ...data, source } });
    // รูปปกเดิมที่ถูกแทน → ลบไฟล์
    if (old.posterKey && old.posterKey !== saved.posterKey) await removeFiles([old.posterKey]);
  } else {
    const top = await prisma.video.aggregate({ _min: { sortOrder: true } });
    saved = await prisma.video.create({ data: { ...data, source, sortOrder: (top._min.sortOrder ?? 0) - 10 } });
  }
  await logAdmin(admin.id, "VIDEO", `${old ? "แก้ไข" : "เพิ่ม"}คลิป ${VIDEO_SOURCES[source].name}: ${title}${data.isActive ? "" : " (ซ่อน)"}${publishAt ? ` · เผยแพร่ ${p.publishAt?.replace("T", " ")}` : ""}`, { entity: `Video:${saved.id}` });
  refreshStorefront();
  return { ok: old ? "บันทึกการแก้ไขแล้ว — หน้าเว็บเปลี่ยนทันที" : "เพิ่มคลิปแล้ว — แสดงที่หน้าวิดีโอ", id: saved.id };
}

async function removeFiles(keys: (string | null | undefined)[]) {
  const ks = keys.filter((k): k is string => !!k);
  // ไฟล์ที่ยังใช้ที่อื่น (คลิปอื่น/วิดีโอสินค้า) ไม่ลบ
  for (const k of ks) {
    const used = await prisma.video.count({ where: { OR: [{ fileKey: k }, { posterKey: k }] } });
    const usedByProduct = await prisma.product.count({ where: { OR: [{ videoKey: k }, { videoPosterKey: k }] } });
    if (used || usedByProduct) continue;
    await storage().delete(k).catch(() => {});
    if (k.endsWith(".webp")) await storage().delete(k.replace(/\.webp$/, "-sm.webp")).catch(() => {});
  }
}

/** ลบคลิป (เจ้าของร้าน) + ไฟล์ที่อัปโหลด */
export async function deleteVideo(f: FormData) {
  const admin = await requireOwner();
  const id = String(f.get("id") ?? "").slice(0, 40);
  const v = await prisma.video.findUnique({ where: { id } });
  if (!v) redirect("/admin/videos");
  await prisma.video.delete({ where: { id } });
  await removeFiles([v.fileKey, v.posterKey]);
  await logAdmin(admin.id, "VIDEO", `ลบคลิป: ${v.title}`, { entity: `Video:${v.id}` });
  refreshStorefront();
  redirect("/admin/videos?deleted=1");
}

/** ซ่อน/แสดง · แนะนำ/เลิกแนะนำ (ปุ่มในตาราง) */
export async function toggleVideo(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id") ?? "").slice(0, 40);
  const what = String(f.get("what") ?? "");
  const v = await prisma.video.findUnique({ where: { id }, select: { title: true, isActive: true, featured: true } });
  if (!v || (what !== "active" && what !== "featured")) return;
  const data = what === "active" ? { isActive: !v.isActive } : { featured: !v.featured };
  await prisma.video.update({ where: { id }, data });
  await logAdmin(admin.id, "VIDEO", `${v.title}: ${what === "active" ? (v.isActive ? "ซ่อน" : "แสดง") : v.featured ? "เลิกแนะนำ" : "แนะนำ"}`, { entity: `Video:${id}` });
  refreshStorefront();
  refresh();
}

/** ลากเรียงลำดับในตาราง (ทั้งรายการ) */
export async function saveVideoOrder(ids: string[]): Promise<{ ok?: string; error?: string }> {
  const admin = await requireAdmin();
  const all = await prisma.video.findMany({ select: { id: true } });
  if (!Array.isArray(ids) || ids.length !== all.length || new Set(ids).size !== ids.length || !all.every((v) => ids.includes(v.id)))
    return { error: "รายการคลิปเปลี่ยนไประหว่างลาก — รีเฟรชหน้าแล้วลองใหม่" };
  await prisma.$transaction(ids.map((id, k) => prisma.video.update({ where: { id }, data: { sortOrder: (k + 1) * 10 } })));
  await logAdmin(admin.id, "VIDEO", "จัดลำดับคลิปใหม่ (ลากวาง)");
  refreshStorefront();
  return { ok: "บันทึกลำดับแล้ว — หน้าวิดีโอเรียงตามนี้" };
}
