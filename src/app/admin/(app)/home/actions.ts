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
