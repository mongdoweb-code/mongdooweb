"use server";
// หน้าแรก (A30): ลำดับ/แสดงส่วนต่างๆ · ส่วนความน่าเชื่อถือ (U30): โลโก้ลูกค้า ตัวเลข คะแนนรีวิว · เวลาทำการ (U27)
import { redirect } from "next/navigation";
import type { Prisma } from "../../../../../generated/prisma/client";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { HOME_SECTIONS, parseHomeSections, parseOpeningHours, parseTrust, type HomeSectionKey } from "@/lib/home";
import { MediaError, saveImage } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { parsePopular, safePopularHref } from "@/lib/popular-cats";
import { WHY_IMAGE_MODES, WHY_IMG_RE, WHY_MAX_ITEMS, parseWhyUs, safeWhyHref } from "@/lib/why-us";
import { NAV_CUSTOM_MAX, NAV_VISIBLE_MAX, navMenuToJson, parseNavMenu, safeNavHref } from "@/lib/nav-menu";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").normalize("NFC").trim().slice(0, max);
const done = (flag: string, msg = ""): never => redirect(`/admin/home?done=${flag}${msg ? `&msg=${encodeURIComponent(msg.slice(0, 160))}` : ""}`);
const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function saveHomeSections(f: FormData) {
  const admin = await requireAdmin();
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(f.get("sections") ?? "[]"));
  } catch {}
  const sections = parseHomeSections(raw);
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { homeSections: json(sections) } });
  await logAdmin(admin.id, "HOME", `จัดลำดับหน้าแรก: ${sections.filter((s) => s.show).map((s) => HOME_SECTIONS[s.key as HomeSectionKey].split(" (")[0]).join(" → ")}`);
  refreshStorefront();
  done("sections");
}

export async function saveTrust(f: FormData) {
  const admin = await requireAdmin();
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { trust: true } });
  const old = parseTrust(s?.trust);
  // โลโก้เดิม: แก้ชื่อ/ลิงก์ หรือติ๊กลบ (ลำดับตามที่แสดง)
  const keep: { name: string; key: string; href: string }[] = [];
  const removed: string[] = [];
  old.logos.forEach((l, i) => {
    if (str(f, `logoKey${i}`, 200) !== l.key) return;
    if (f.get(`logoDel${i}`) === "on") removed.push(l.key);
    else keep.push({ key: l.key, name: str(f, `logoName${i}`, 80), href: str(f, `logoHref${i}`, 300) });
  });
  const added: { name: string; key: string; href: string }[] = [];
  for (const file of f.getAll("newLogos").slice(0, 12)) {
    if (!(file instanceof File) || file.size === 0) continue;
    try {
      added.push({ key: await saveImage(Buffer.from(await file.arrayBuffer()), "trust", { full: 600, thumb: 300 }), name: file.name.replace(/\.\w+$/, "").slice(0, 80), href: "" });
    } catch (e) {
      done("err", e instanceof MediaError ? `${file.name}: ${e.message}` : `อัปโหลด ${file.name} ไม่สำเร็จ`);
    }
  }
  const stats = [0, 1, 2, 3, 4, 5].map((i) => ({ value: str(f, `statValue${i}`, 20), label: str(f, `statLabel${i}`, 60) })).filter((x) => x.value && x.label);
  const bad = [0, 1, 2, 3, 4, 5].some((i) => !!str(f, `statValue${i}`) !== !!str(f, `statLabel${i}`));
  const trust = parseTrust({ title: str(f, "title", 80), showRating: f.get("showRating") === "on", stats, logos: [...keep, ...added] });
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { trust: json(trust) } });
  await Promise.all(removed.flatMap((k) => [k, k.replace(/\.webp$/, "-sm.webp")]).map((k) => storage().delete(k).catch(() => {})));
  await logAdmin(admin.id, "HOME", `ส่วนความน่าเชื่อถือ: โลโก้ ${trust.logos.length} · ตัวเลข ${trust.stats.length} · คะแนนรีวิว ${trust.showRating ? "แสดง" : "ซ่อน"}`);
  refreshStorefront();
  done(bad ? "trustPartial" : "trust");
}

export async function saveHours(f: FormData) {
  const admin = await requireAdmin();
  const rows: { day: number; open: string; close: string }[] = [];
  for (let d = 0; d < 7; d++) {
    if (f.get(`on${d}`) !== "on") continue;
    for (const n of [1, 2]) {
      const open = str(f, `open${d}_${n}`, 5);
      const close = str(f, `close${d}_${n}`, 5);
      if (open || close) rows.push({ day: d, open, close });
    }
  }
  const hours = parseOpeningHours(rows);
  if (hours.length !== rows.length) done("hoursErr");
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { openingHours: json(hours) } });
  await logAdmin(admin.id, "HOME", `ตั้งเวลาทำการ ${hours.length} ช่วง`);
  refreshStorefront();
  done("hours");
}

/** หมวดยอดนิยมหน้าแรก: บันทึกการ์ด (หมวด สีพื้น ลิงก์ย่อย ลำดับ) · reset = กลับไปเลือกอัตโนมัติ */
export async function savePopular(f: FormData): Promise<{ ok?: string; error?: string }> {
  const admin = await requireAdmin();
  let raw: unknown = {};
  try {
    raw = JSON.parse(String(f.get("data") ?? "{}"));
  } catch {
    return { error: "ข้อมูลไม่ถูกต้อง ลองโหลดหน้าใหม่" };
  }
  if (f.get("intent") === "reset") {
    await prisma.shopSetting.update({ where: { id: "shop" }, data: { popularCats: json({}) } });
    await logAdmin(admin.id, "HOME", "หมวดยอดนิยมหน้าแรก: กลับไปเลือกอัตโนมัติ");
    refreshStorefront();
    return { ok: "กลับไปเลือกหมวดอัตโนมัติแล้ว" };
  }
  // ลิงก์ที่กรอกไม่ครบ/ผิดรูปแบบ → แจ้งก่อนบันทึก (ไม่ตัดทิ้งเงียบๆ)
  const items = (raw as { items?: { cat?: string; links?: { label?: string; href?: string }[] }[] }).items ?? [];
  for (const it of Array.isArray(items) ? items : []) {
    for (const l of Array.isArray(it?.links) ? it.links : []) {
      const label = String(l?.label ?? "").trim(), href = String(l?.href ?? "").trim();
      if (!label && !href) continue;
      if (!label || !safePopularHref(href)) return { error: `ลิงก์ "${label || href}" ไม่ถูกต้อง — ต้องมีข้อความ และลิงก์ขึ้นต้นด้วย / หรือ https://` };
    }
  }
  const cfg = parsePopular(raw);
  const cats = new Set((await prisma.category.findMany({ select: { slug: true } })).map((c) => c.slug));
  cfg.items = cfg.items.filter((i) => cats.has(i.cat));
  if (!cfg.items.length) return { error: "เพิ่มหมวดอย่างน้อย 1 หมวด (หรือกด “ให้ระบบเลือกอัตโนมัติ”)" };
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { popularCats: json(cfg) } });
  const own = cfg.items.filter((i) => i.img).length;
  await logAdmin(admin.id, "HOME", `หมวดยอดนิยมหน้าแรก: ${cfg.items.length} หมวด (${cfg.items.map((i) => i.cat).join(", ")})${own ? ` · รูปอัปโหลดเอง ${own} การ์ด` : ""}`);
  refreshStorefront();
  return { ok: `บันทึกแล้ว — หน้าแรกแสดง ${cfg.items.length} หมวด` };
}

/** ส่วน "ทำไมต้องมองดูเว็บ" (/admin/home/why) — บันทึก หรือคืนค่าเดิม (intent=reset) */
export async function saveWhyUs(f: FormData): Promise<{ ok?: string; error?: string; field?: string }> {
  const admin = await requireAdmin();
  if (f.get("intent") === "reset") {
    await prisma.shopSetting.update({ where: { id: "shop" }, data: { whyUs: json({}) } });
    await logAdmin(admin.id, "HOME", "ทำไมต้องมองดูเว็บ: คืนค่าข้อความเดิม");
    refreshStorefront();
    return { ok: "คืนค่าข้อความเดิมแล้ว" };
  }
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(String(f.get("data") ?? "{}"));
  } catch {
    return { error: "ข้อมูลไม่ถูกต้อง ลองโหลดหน้าใหม่" };
  }
  // ตรวจก่อนบันทึก (แจ้งให้แก้ ไม่ตัดทิ้งเงียบๆ)
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (!str(raw.title)) return { error: "กรอกหัวข้อ", field: "title" };
  const items = Array.isArray(raw.items) ? (raw.items as { title?: unknown; text?: unknown }[]) : [];
  if (!items.some((i) => str(i?.title))) return { error: "ต้องมีจุดเด่นอย่างน้อย 1 ข้อ", field: "items" };
  const blank = items.findIndex((i) => !str(i?.title) && str(i?.text));
  if (blank >= 0) return { error: `จุดเด่นข้อที่ ${blank + 1}: กรอกหัวข้อ`, field: `item-${blank}` };
  if (items.length > WHY_MAX_ITEMS) return { error: `จุดเด่นได้สูงสุด ${WHY_MAX_ITEMS} ข้อ`, field: "items" };
  if (str(raw.href) && !safeWhyHref(raw.href)) return { error: "ลิงก์ต้องขึ้นต้นด้วย / หรือ https://", field: "href" };
  if (raw.imageMode === "upload" && !(typeof raw.imageKey === "string" && WHY_IMG_RE.test(raw.imageKey))) return { error: "อัปโหลดรูปก่อน หรือเลือกแบบอื่น", field: "image" };
  const cfg = parseWhyUs(raw);
  const before = parseWhyUs((await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { whyUs: true } }))?.whyUs);
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { whyUs: json(cfg) } });
  const changed = (Object.keys(cfg) as (keyof typeof cfg)[]).filter((k) => JSON.stringify(cfg[k]) !== JSON.stringify(before[k]));
  const NAMES: Record<string, string> = { eyebrow: "หัวข้อเล็ก", title: "หัวข้อ", items: "จุดเด่น", imageMode: "รูป", imageKey: "รูป", capTitle: "คำบรรยายรูป", capSub: "คำบรรยายรูป", href: "ลิงก์" };
  await logAdmin(admin.id, "HOME", `ทำไมต้องมองดูเว็บ: ${changed.length ? [...new Set(changed.map((k) => NAMES[k]))].join(", ") : "บันทึก (ไม่มีการเปลี่ยนแปลง)"} · จุดเด่น ${cfg.items.length} ข้อ · ${WHY_IMAGE_MODES[cfg.imageMode]}`);
  refreshStorefront();
  return { ok: "บันทึกแล้ว — หน้าแรกเปลี่ยนตามทันที" };
}

/** เมนูหลักหน้าร้าน (Navbar): ซ่อน/แสดง · เรียงลำดับ · เปลี่ยนชื่อ · ลิงก์เพิ่มเอง · ไอคอนด้านขวา — intent=reset = กลับเป็นเมนูเดิม */
export async function saveNavMenu(f: FormData): Promise<{ ok?: string; error?: string; field?: string }> {
  const admin = await requireAdmin();
  if (f.get("intent") === "reset") {
    await prisma.shopSetting.update({ where: { id: "shop" }, data: { navMenu: json({}) } });
    await logAdmin(admin.id, "HOME", "เมนูหน้าร้าน: คืนค่าเมนูเดิม");
    refreshStorefront();
    return { ok: "คืนค่าเมนูเดิมแล้ว" };
  }
  let raw: { items?: unknown; icons?: unknown } = {};
  try {
    raw = JSON.parse(String(f.get("data") ?? "{}"));
  } catch {
    return { error: "ข้อมูลไม่ถูกต้อง ลองโหลดหน้าใหม่" };
  }
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  // ตรวจก่อนบันทึก (แจ้งให้แก้ ไม่ตัดทิ้งเงียบ ๆ)
  const customs = items.filter((i) => typeof i?.key === "string" && /^c\d+$/.test(i.key as string));
  if (customs.length > NAV_CUSTOM_MAX) return { error: `ลิงก์เพิ่มเองได้สูงสุด ${NAV_CUSTOM_MAX} รายการ` };
  for (const c of customs) {
    if (!String(c.label ?? "").trim()) return { error: "กรอกชื่อเมนูของลิงก์ที่เพิ่มเอง", field: `label-${c.key}` };
    if (!safeNavHref(c.href)) return { error: `ลิงก์ “${String(c.label).slice(0, 30)}” ต้องขึ้นต้นด้วย / (หน้าในเว็บ) หรือ https://`, field: `href-${c.key}` };
  }
  const shown = items.filter((i) => i?.show !== false).length;
  if (!shown) return { error: "ต้องแสดงอย่างน้อย 1 เมนู" };
  if (shown > NAV_VISIBLE_MAX) return { error: `แสดงบนแถบเมนูได้สูงสุด ${NAV_VISIBLE_MAX} รายการ (ตอนนี้ ${shown}) — ซ่อนบางเมนูก่อน` };
  const cfg = parseNavMenu(raw);
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { navMenu: json(navMenuToJson(cfg)) } });
  const on = cfg.items.filter((i) => i.show).map((i) => i.label);
  const icons = (Object.keys(cfg.icons) as (keyof typeof cfg.icons)[]).filter((k) => !cfg.icons[k]);
  await logAdmin(admin.id, "HOME", `เมนูหน้าร้าน: ${on.join(" · ")}${icons.length ? ` · ซ่อนไอคอน ${icons.join(", ")}` : ""}`.slice(0, 900));
  refreshStorefront();
  return { ok: "บันทึกเมนูหน้าร้านแล้ว — หน้าร้านเปลี่ยนทันที" };
}
