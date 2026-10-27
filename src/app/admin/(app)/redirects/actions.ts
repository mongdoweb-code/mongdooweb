"use server";
// redirect 301 (A13/A14): เพิ่ม/แก้/ลบเอง (ตรวจรูปแบบ กัน loop ย่อสาย) + สร้างจากบันทึกหน้า 404 ในคลิกเดียว
import { redirect } from "next/navigation";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RedirectError, invalidateRedirects, saveRedirect } from "@/lib/redirects";

const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);
function back(f: FormData, flag: string, msg = ""): never {
  const b = str(f, "back", 400);
  const u = new URL(/^\/admin\/redirects(\?[^\s]*)?$/.test(b) ? b : "/admin/redirects", "http://x");
  u.searchParams.set("done", flag);
  if (msg) u.searchParams.set("msg", msg.slice(0, 200));
  else u.searchParams.delete("msg");
  redirect(u.pathname + u.search);
}

export async function saveRedirectAction(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40) || undefined;
  let saved;
  try {
    saved = await saveRedirect({ id, from: str(f, "from"), to: str(f, "to"), source: f.get("source") === "NOT_FOUND" ? "NOT_FOUND" : "MANUAL" });
  } catch (e) {
    if (e instanceof RedirectError) back(f, "err", e.message);
    throw e;
  }
  await logAdmin(admin.id, "REDIRECT", `${id ? "แก้" : "เพิ่ม"} redirect ${saved.fromPath} → ${saved.toPath}`);
  back(f, "saved", `${saved.fromPath} → ${saved.toPath}`);
}

export async function deleteRedirect(f: FormData) {
  const admin = await requireAdmin();
  const r = await prisma.redirect.findUnique({ where: { id: str(f, "id", 40) } });
  if (r) {
    await prisma.redirect.delete({ where: { id: r.id } });
    invalidateRedirects();
    await logAdmin(admin.id, "REDIRECT", `ลบ redirect ${r.fromPath} → ${r.toPath}`);
  }
  back(f, "deleted");
}

/** ไม่สนใจหน้า 404 นี้ (ลบออกจากรายการ — ถ้ามีคนเรียกอีกจะกลับมา) */
export async function dismissNotFound(f: FormData) {
  await requireAdmin();
  await prisma.notFoundLog.deleteMany({ where: { path: str(f, "path", 300) } });
  back(f, "dismissed");
}

export async function clearNotFound(f: FormData) {
  const admin = await requireOwner();
  const r = await prisma.notFoundLog.deleteMany({});
  await logAdmin(admin.id, "REDIRECT", `ล้างบันทึกหน้า 404 ${r.count} รายการ`);
  back(f, "cleared");
}
