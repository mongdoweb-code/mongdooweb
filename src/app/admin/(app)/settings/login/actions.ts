"use server";
// บันทึกหน้าเข้าสู่ระบบ (เจ้าของร้านเท่านั้น): ข้อความ/จุดเด่น/ตัวเลข/ธีม + อัปโหลดรูป (≤ 4, prefix login/) → ShopSetting.loginPage
import { refresh } from "next/cache";
import { diffOf, logAdmin } from "@/lib/admin-log";
import { requireOwner } from "@/lib/auth";
import { LOGIN_LIMITS, isLoginImageKey, parseLoginPage } from "@/lib/login-page";
import { MediaError, saveImage } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export type LoginPageState = { ok?: string; error?: string; at?: number };

const s = (f: FormData, k: string) => String(f.get(k) ?? "");
const on = (f: FormData, k: string) => f.get(k) === "on";

export async function saveLoginPage(_: LoginPageState, f: FormData): Promise<LoginPageState> {
  const admin = await requireOwner();
  const row = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { loginPage: true } });
  const before = parseLoginPage(row?.loginPage);

  // รูป: เก็บรูปเดิมตามลำดับที่ส่งมา (ต้องเป็นรูปเดิมของหน้านี้) ตัดที่ติ๊กลบ แล้วต่อรูปใหม่
  const keep = f.getAll("keep").map(String).filter((k) => isLoginImageKey(k) && before.images.includes(k) && !f.getAll("remove").includes(k));
  const files = f.getAll("newImages").filter((x): x is File => x instanceof File && x.size > 0);
  if (keep.length + files.length > LOGIN_LIMITS.images) return { error: `รูปได้สูงสุด ${LOGIN_LIMITS.images} รูป (มีอยู่ ${keep.length} รูป) — ลบรูปเดิมก่อนแล้วค่อยเพิ่ม` };
  const added: string[] = [];
  for (const file of files) {
    try {
      added.push(await saveImage(Buffer.from(await file.arrayBuffer()), "login", { full: 1600, thumb: 480 }));
    } catch (e) {
      return { error: e instanceof MediaError ? `${file.name}: ${e.message}` : `อัปโหลด ${file.name} ไม่สำเร็จ` };
    }
  }

  const next = parseLoginPage({
    eyebrow: s(f, "eyebrow"), headline: s(f, "headline"), glow: s(f, "glow"), sub: s(f, "sub"),
    highlights: f.getAll("highlight").map(String),
    stats: f.getAll("statValue").map((v, i) => ({ value: String(v), label: String(f.getAll("statLabel")[i] ?? "") })),
    images: [...keep, ...added], useProjects: on(f, "useProjects"), caption: s(f, "caption"),
    theme: s(f, "theme"), animate: on(f, "animate"),
    welcome: s(f, "welcome"), welcomeSub: s(f, "welcomeSub"), notice: s(f, "notice"),
    showCategories: on(f, "showCategories"), catCount: s(f, "catCount"), showProducts: on(f, "showProducts"), productCount: s(f, "productCount"),
  });
  if (!s(f, "headline").trim()) return { error: "กรุณาใส่หัวข้อหลัก" };
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { loginPage: next } });
  await logAdmin(admin.id, "SETTINGS", "บันทึกหน้าเข้าสู่ระบบ", { entity: "ShopSetting", diff: diffOf(before, next) });
  refresh();
  return { ok: "บันทึกหน้าเข้าสู่ระบบแล้ว — ตัวอย่างด้านขวาอัปเดตแล้ว", at: Date.now() };
}

export async function resetLoginPage(): Promise<LoginPageState> {
  const admin = await requireOwner();
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { loginPage: {} } });
  await logAdmin(admin.id, "SETTINGS", "คืนค่าเริ่มต้นหน้าเข้าสู่ระบบ", { entity: "ShopSetting" });
  refresh();
  return { ok: "คืนค่าเริ่มต้นแล้ว", at: Date.now() };
}
