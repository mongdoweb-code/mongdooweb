// redirect 301 (A13/A14) + บันทึกหน้า 404 — ใช้ทั้งใน src/proxy.ts และหลังบ้าน
// - ตาราง Redirect ถูกโหลดเข้าหน่วยความจำ (หมดอายุ 60 วินาที) proxy จึงไม่ถามฐานข้อมูลทุกคำขอ
//   หลังบ้านแก้ redirect → invalidateRedirects() ล้างแคชทันที (เก็บบน globalThis เพราะ proxy กับ server action
//   ถูก bundle แยกกันแต่รันในโปรเซสเดียวกัน — ระบบนี้รันเครื่องเดียว)
// - เปลี่ยน slug สินค้า/หมวด/บทความ/ผลงาน → recordSlugChange(เดิม, ใหม่) สร้าง redirect อัตโนมัติ
//   และย่อสาย redirect (A→B แล้ว B→C = A→C) ไม่ให้ลูกค้า/Google ต้องเด้งหลายทอด
import { prisma } from "@/lib/prisma";

const TTL = 60_000;

type Entry = { id: string; to: string };
type Cache = { at: number; map: Map<string, Entry>; posts: Map<string, string>; loading: Promise<void> | null };
const g = globalThis as unknown as { __mdwRedirects?: Cache };
const cache = (): Cache => (g.__mdwRedirects ??= { at: 0, map: new Map(), posts: new Map(), loading: null });

/** path ที่ใช้เทียบ: ถอดรหัส %xx, NFC, ไม่มี query/hash, ไม่มี / ท้าย (ยกเว้น "/") */
export function normalizePath(raw: string) {
  let p = raw.split(/[?#]/)[0] ?? "";
  try {
    p = decodeURIComponent(p);
  } catch {}
  p = p.normalize("NFC").replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/** ล้างแคช (เรียกหลังแก้ redirect / slug / บทความที่มี URL เดิม) */
export function invalidateRedirects() {
  cache().at = 0;
}

async function load() {
  const c = cache();
  if (Date.now() - c.at < TTL) return;
  c.loading ??= (async () => {
    try {
      const [rows, posts] = await Promise.all([
        prisma.redirect.findMany({ select: { id: true, fromPath: true, toPath: true } }),
        prisma.post.findMany({ where: { legacyPath: { not: null }, status: "PUBLISHED" }, select: { slug: true, legacyPath: true } }),
      ]);
      c.map = new Map(rows.map((r) => [normalizePath(r.fromPath), { id: r.id, to: r.toPath }]));
      c.posts = new Map(posts.map((p) => [normalizePath(p.legacyPath!), `/blog/${encodeURIComponent(p.slug)}`]));
      c.at = Date.now();
    } catch {
      // ฐานข้อมูลมีปัญหา → ใช้ของเดิมไปก่อน ลองใหม่ใน 10 วินาที
      c.at = Date.now() - TTL + 10_000;
    } finally {
      c.loading = null;
    }
  })();
  await c.loading;
}

/** redirect ที่ตรงกับ path (ไม่มี = null) — ใช้ใน proxy */
export async function findRedirect(pathname: string): Promise<Entry | null> {
  await load();
  return cache().map.get(normalizePath(pathname)) ?? null;
}

/** URL เดิมของบทความ WordPress (Post.legacyPath) → /blog/<slug> */
export async function findLegacyPost(pathname: string): Promise<string | null> {
  await load();
  return cache().posts.get(normalizePath(pathname)) ?? null;
}

/** นับครั้งที่ใช้ redirect (เรียกหลังตอบแล้ว ไม่ขวางคำขอ) */
export async function countRedirectHit(id: string) {
  await prisma.redirect.update({ where: { id }, data: { hits: { increment: 1 }, lastHitAt: new Date() } }).catch(() => {});
}

// ---------- ตรวจความถูกต้อง ----------

/** path ต้นทางที่ห้ามทำ redirect (ระบบภายใน) */
const RESERVED = /^\/(admin|api|_next|media|_mdw)(\/|$)/;

export class RedirectError extends Error {}

/** ต้นทาง: path ภายใน /... เท่านั้น ไม่มี query ไม่ใช่หน้าแรก ไม่ใช่ระบบภายใน */
export function cleanFromPath(raw: string) {
  const s = raw.trim();
  let p = s;
  // วาง URL เต็มของเว็บเรามาได้ → เอาแต่ path
  const m = /^https?:\/\/[^/]+(\/.*)?$/i.exec(s);
  if (m) p = m[1] ?? "/";
  if (!p.startsWith("/") || p.startsWith("//")) throw new RedirectError("ลิงก์ต้นทางต้องขึ้นต้นด้วย / เช่น /old-page");
  if (/[\s<>"'\\]/.test(p) || /[\u0000-\u001f]/.test(p)) throw new RedirectError("ลิงก์ต้นทางมีอักขระที่ใช้ไม่ได้");
  const n = normalizePath(p);
  if (n === "/") throw new RedirectError("ทำ redirect จากหน้าแรกไม่ได้");
  if (RESERVED.test(n)) throw new RedirectError("ทำ redirect จากหน้าระบบ (/admin, /api, /media) ไม่ได้");
  if (n.length > 300) throw new RedirectError("ลิงก์ต้นทางยาวเกินไป");
  return n;
}

/** ปลายทาง: path ภายใน (/..., มี ?query หรือ #ได้) หรือ URL https?:// */
export function cleanToPath(raw: string) {
  const s = raw.trim();
  if (/[\s<>"'\\]/.test(s) || /[\u0000-\u001f]/.test(s)) throw new RedirectError("ลิงก์ปลายทางมีอักขระที่ใช้ไม่ได้");
  if (/^https?:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/i.test(s)) return s.slice(0, 500);
  if (!s.startsWith("/") || s.startsWith("//")) throw new RedirectError("ลิงก์ปลายทางต้องเป็น path ในเว็บ (ขึ้นต้นด้วย /) หรือ URL ที่ขึ้นต้นด้วย https://");
  const [path, rest = ""] = s.split(/(?=[?#])/, 2);
  const n = normalizePath(path) + rest;
  if (n.length > 500) throw new RedirectError("ลิงก์ปลายทางยาวเกินไป");
  return n;
}

const internal = (to: string) => to.startsWith("/");

/**
 * ปลายทางสุดท้ายเมื่อเดินตามสาย redirect ที่มีอยู่ (A→B, B→C ⇒ C) — วนกลับมาที่ต้นทาง = loop
 * ignoreFrom: redirect ที่กำลังแก้ (ไม่นับตัวเอง)
 */
async function finalTarget(from: string, to: string, ignoreFrom?: string) {
  let cur = to;
  const seen = new Set([from]);
  for (let i = 0; i < 20 && internal(cur); i++) {
    const p = normalizePath(cur);
    if (seen.has(p)) throw new RedirectError("redirect นี้ทำให้วนซ้ำ (ลิงก์ปลายทางย้อนกลับมาที่ต้นทาง)");
    seen.add(p);
    const next = await prisma.redirect.findUnique({ where: { fromPath: p }, select: { toPath: true } });
    if (!next || p === ignoreFrom) break;
    cur = next.toPath;
  }
  if (internal(cur) && normalizePath(cur) === from) throw new RedirectError("ลิงก์ต้นทางและปลายทางเป็นหน้าเดียวกัน");
  return cur;
}

/**
 * สร้าง/แก้ redirect (หลังบ้าน) — ตรวจรูปแบบ, กัน loop, ย่อสาย (ปลายทางเป็นต้นทางของ redirect อื่น → ชี้ไปปลายสุดเลย)
 * และ redirect อื่นที่ชี้มาที่ต้นทางนี้ จะถูกเปลี่ยนให้ชี้ไปปลายทางใหม่ด้วย
 */
export async function saveRedirect(input: { id?: string; from: string; to: string; source?: "MANUAL" | "SLUG" | "NOT_FOUND" }) {
  const from = cleanFromPath(input.from);
  const to0 = cleanToPath(input.to);
  if (internal(to0) && normalizePath(to0) === from) throw new RedirectError("ลิงก์ต้นทางและปลายทางเป็นหน้าเดียวกัน");
  const old = input.id ? await prisma.redirect.findUnique({ where: { id: input.id } }) : null;
  const to = await finalTarget(from, to0, old?.fromPath);
  const dup = await prisma.redirect.findUnique({ where: { fromPath: from } });
  if (dup && dup.id !== old?.id) throw new RedirectError(`มี redirect จาก ${from} อยู่แล้ว (แก้รายการเดิมแทน)`);
  const saved = await prisma.$transaction(async (tx) => {
    const r = old
      ? await tx.redirect.update({ where: { id: old.id }, data: { fromPath: from, toPath: to } })
      : await tx.redirect.create({ data: { fromPath: from, toPath: to, source: input.source ?? "MANUAL" } });
    // X→from กลายเป็น X→to (ไม่ต้องเด้งสองทอด) — ข้ามตัวที่จะกลายเป็นชี้ตัวเอง
    const pointing = await tx.redirect.findMany({ where: { toPath: from, id: { not: r.id } } });
    for (const p of pointing) {
      if (internal(to) && normalizePath(to) === normalizePath(p.fromPath)) await tx.redirect.delete({ where: { id: p.id } });
      else await tx.redirect.update({ where: { id: p.id }, data: { toPath: to } });
    }
    // หน้า 404 ที่มี redirect แล้ว ไม่ต้องอยู่ในรายการ 404 อีก
    await tx.notFoundLog.deleteMany({ where: { path: from } });
    return r;
  });
  invalidateRedirects();
  return saved;
}

/**
 * เปลี่ยน slug (สินค้า/หมวด/บทความ/ผลงาน) → redirect 301 จาก path เดิมไป path ใหม่อัตโนมัติ
 * oldPath / newPath = path เต็ม เช่น "/product/old-slug" → "/product/new-slug"
 * - path ใหม่เคยเป็นต้นทางของ redirect (เปลี่ยนกลับไปใช้ slug เดิม) → ลบ redirect นั้น เพราะหน้ากลับมามีจริงแล้ว
 * - redirect เดิมที่ชี้มาที่ path เดิม → ชี้ไป path ใหม่ (ย่อสาย)
 * ไม่ throw — ผิดพลาดแล้วงานหลัก (บันทึกสินค้า) ต้องสำเร็จอยู่ดี
 */
export async function recordSlugChange(oldPath: string, newPath: string) {
  try {
    const from = normalizePath(oldPath);
    const to = normalizePath(newPath);
    if (!from || !to || from === to || from === "/") return;
    await prisma.$transaction(async (tx) => {
      await tx.redirect.deleteMany({ where: { fromPath: to } });
      await tx.redirect.upsert({
        where: { fromPath: from },
        create: { fromPath: from, toPath: to, source: "SLUG" },
        update: { toPath: to, source: "SLUG" },
      });
      await tx.redirect.updateMany({ where: { toPath: from }, data: { toPath: to } });
      await tx.notFoundLog.deleteMany({ where: { path: from } });
    });
    invalidateRedirects();
  } catch (e) {
    console.error("recordSlugChange", oldPath, newPath, e);
  }
}

// ---------- บันทึกหน้า 404 ----------

/** บันทึก path ที่ไม่พบ (ไม่เก็บ query เพราะอาจมีข้อมูลส่วนตัว) + referer ล่าสุด (เฉพาะ origin + path) */
export async function logNotFound(rawPath: string, referer: string | null) {
  try {
    const path = normalizePath(rawPath).slice(0, 300);
    if (!path.startsWith("/") || RESERVED.test(path) || path === "/") return;
    let ref: string | null = null;
    if (referer) {
      try {
        const u = new URL(referer);
        if (/^https?:$/.test(u.protocol)) ref = `${u.origin}${u.pathname}`.slice(0, 300);
      } catch {}
    }
    await prisma.notFoundLog.upsert({
      where: { path },
      create: { path, referer: ref },
      update: { hits: { increment: 1 }, lastAt: new Date(), ...(ref ? { referer: ref } : {}) },
    });
    // กันตารางโตไม่หยุด: บางครั้งลบรายการที่เจอครั้งเดียวและเก่ากว่า 60 วัน
    if (Math.random() < 0.01) await prisma.notFoundLog.deleteMany({ where: { hits: { lte: 1 }, lastAt: { lt: new Date(Date.now() - 60 * 864e5) } } });
  } catch {}
}
