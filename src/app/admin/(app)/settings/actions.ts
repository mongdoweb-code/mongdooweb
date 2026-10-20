"use server";
// บันทึกตั้งค่าร้าน / โลโก้ / ผู้ใช้หลังบ้าน / เปลี่ยนรหัสผ่าน
import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { refreshStorefront, logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { isValidThaiTaxId } from "@/lib/format";
import { MediaError, saveImage } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { BANKS, parseBankAccounts, parseShippingTiers } from "@/lib/settings";

export type FormState = { ok?: string; error?: string; fields?: string[] };

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const opt = (f: FormData, k: string, max = 200) => str(f, k, max) || null;
const baht = (v: string) => {
  const n = Number(v.replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};
const httpUrl = (v: string | null) => (v && !/^https?:\/\/\S+$/i.test(v) ? "bad" : v);

export async function saveSettings(_prev: FormState, f: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (admin.role !== "OWNER") return { error: "เฉพาะเจ้าของร้าน (OWNER) เท่านั้นที่แก้ตั้งค่าร้านได้" };
  const bad: string[] = [];

  let banks: { bank: string; account: string; holder: string }[] = [];
  let tiers: { minSatang: number; feeSatang: number }[] = [];
  try {
    banks = parseBankAccounts(JSON.parse(str(f, "bankAccounts", 5000) || "[]"));
    const rawTiers = JSON.parse(str(f, "shippingTiers", 5000) || "[]") as { min: string; fee: string }[];
    tiers = rawTiers.map((t) => ({ minSatang: baht(String(t.min)), feeSatang: baht(String(t.fee)) }));
  } catch {
    return { error: "ข้อมูลบัญชีหรือค่าส่งไม่ถูกต้อง" };
  }
  if (banks.some((b) => !BANKS[b.bank] || !/^[\d-]{6,20}$/.test(b.account))) bad.push("bankAccounts");
  if (tiers.some((t) => !Number.isFinite(t.minSatang) || !Number.isFinite(t.feeSatang)) || !tiers.length) bad.push("shippingTiers");

  const promptpay = str(f, "promptpayId", 20).replace(/\D/g, "");
  if (promptpay && ![10, 13, 15].includes(promptpay.length)) bad.push("promptpayId");
  const taxId = str(f, "taxId", 20).replace(/\D/g, "");
  if (taxId && !isValidThaiTaxId(taxId)) bad.push("taxId");
  const email = opt(f, "email", 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad.push("email");
  const urls = { lineOaUrl: httpUrl(opt(f, "lineOaUrl", 300)), website: httpUrl(opt(f, "website", 300)), facebookUrl: httpUrl(opt(f, "facebookUrl", 300)), youtubeUrl: httpUrl(opt(f, "youtubeUrl", 300)), tiktokUrl: httpUrl(opt(f, "tiktokUrl", 300)) };
  for (const [k, v] of Object.entries(urls)) if (v === "bad") bad.push(k);
  const expressExtra = baht(str(f, "expressExtra", 20) || "0");
  if (!Number.isFinite(expressExtra)) bad.push("expressExtra");
  const prefixes = { prefixQuote: str(f, "prefixQuote", 6).toUpperCase(), prefixInvoice: str(f, "prefixInvoice", 6).toUpperCase(), prefixReceipt: str(f, "prefixReceipt", 6).toUpperCase() };
  for (const [k, v] of Object.entries(prefixes)) if (!/^[A-Z]{1,6}$/.test(v)) bad.push(k);
  if (new Set(Object.values(prefixes)).size < 3) bad.push("prefixReceipt");
  const days = { quoteValidDays: Math.floor(Number(str(f, "quoteValidDays", 4))), invoiceDueDays: Math.floor(Number(str(f, "invoiceDueDays", 4))) };
  for (const [k, v] of Object.entries(days)) if (!(v >= 0 && v <= 365)) bad.push(k);
  for (const k of ["legalName", "phone", "addressText", "promptpayName", "slipCheckWithin"]) if (!str(f, k)) bad.push(k);
  if (bad.length) return { error: "กรุณาตรวจช่องที่มีกรอบสีแดง", fields: bad };

  // โลโก้ (ไม่บังคับ)
  let logoKey: string | undefined;
  const logo = f.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      logoKey = await saveImage(Buffer.from(await logo.arrayBuffer()), "logo", { full: 600, thumb: 240 });
    } catch (e) {
      return { error: e instanceof MediaError ? e.message : "อัปโหลดโลโก้ไม่สำเร็จ", fields: ["logo"] };
    }
  }

  await prisma.shopSetting.update({
    where: { id: "shop" },
    data: {
      legalName: str(f, "legalName", 120),
      phone: str(f, "phone", 40),
      email,
      lineId: opt(f, "lineId", 60),
      addressText: str(f, "addressText", 300),
      businessHours: opt(f, "businessHours", 120),
      ...(urls as Record<string, string | null>),
      bankAccounts: banks,
      promptpayId: promptpay || null,
      promptpayName: str(f, "promptpayName", 120),
      shippingTiers: parseShippingTiers(tiers),
      expressEnabled: f.get("expressEnabled") === "on",
      expressExtraSatang: expressExtra,
      slipCheckWithin: str(f, "slipCheckWithin", 120),
      newOrderSound: f.get("newOrderSound") === "on",
      taxId: taxId || null,
      branch: opt(f, "branch", 40),
      vatEnabled: f.get("vatEnabled") === "on",
      vatMode: f.get("vatMode") === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE",
      ...prefixes,
      dateEra: f.get("dateEra") === "BE" ? "BE" : "AD",
      ...days,
      termsQuote: opt(f, "termsQuote", 600),
      termsInvoice: opt(f, "termsInvoice", 600),
      termsReceipt: opt(f, "termsReceipt", 600),
      showSignature: f.get("showSignature") === "on",
      ...(logoKey ? { logoKey } : {}),
      ...(f.get("removeLogo") === "on" && !logoKey ? { logoKey: null } : {}),
    },
  });
  await logAdmin(admin.id, "SETTINGS", "บันทึกตั้งค่าร้าน");
  refreshStorefront();
  refresh();
  return { ok: "บันทึกการตั้งค่าแล้ว — หน้าร้านและหน้าชำระเงินใช้ค่าใหม่ทันที" };
}

export async function changePassword(_prev: FormState, f: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const current = String(f.get("current") ?? "");
  const next = String(f.get("next") ?? "");
  if (next.length < 8) return { error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร", fields: ["next"] };
  if (next !== String(f.get("confirm") ?? "")) return { error: "ยืนยันรหัสผ่านไม่ตรงกัน", fields: ["confirm"] };
  const row = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
  if (!(await bcrypt.compare(current, row.passwordHash))) return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง", fields: ["current"] };
  await prisma.admin.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  await logAdmin(admin.id, "PASSWORD", "เปลี่ยนรหัสผ่านของตัวเอง");
  return { ok: "เปลี่ยนรหัสผ่านแล้ว" };
}

/** เพิ่มผู้ใช้/รีเซ็ตรหัสผ่าน/เปิด-ปิดบัญชี — เฉพาะ OWNER */
export async function saveAdminUser(_prev: FormState, f: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (admin.role !== "OWNER") return { error: "เฉพาะเจ้าของร้านเท่านั้น" };
  const id = str(f, "id", 40);
  const username = str(f, "username", 40).toLowerCase();
  const displayName = str(f, "displayName", 80);
  const role = f.get("role") === "OWNER" ? "OWNER" : "STAFF";
  const password = String(f.get("password") ?? "");
  const isActive = f.get("isActive") !== "off";
  if (!id) {
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: "ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - อย่างน้อย 3 ตัว", fields: ["username"] };
    if (password.length < 8) return { error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร", fields: ["password"] };
    if (await prisma.admin.findUnique({ where: { username } })) return { error: "มีชื่อผู้ใช้นี้แล้ว", fields: ["username"] };
    await prisma.admin.create({ data: { username, displayName: displayName || username, role, passwordHash: await bcrypt.hash(password, 12) } });
    await logAdmin(admin.id, "ADMIN_USER", `เพิ่มผู้ใช้ ${username} (${role})`);
    refresh();
    return { ok: `เพิ่มผู้ใช้ ${username} แล้ว` };
  }
  if (id === admin.id && (!isActive || role !== "OWNER")) return { error: "ปิดบัญชีหรือลดสิทธิ์ของตัวเองไม่ได้" };
  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) return { error: "ไม่พบผู้ใช้" };
  if (password && password.length < 8) return { error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" };
  await prisma.admin.update({
    where: { id },
    data: { displayName: displayName || target.displayName, role, isActive, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
  });
  // ปิดบัญชีหรือรีเซ็ตรหัส → ตัด session เดิมทั้งหมด
  if (!isActive || password) await prisma.adminSession.deleteMany({ where: { adminId: id } });
  await logAdmin(admin.id, "ADMIN_USER", `แก้ไขผู้ใช้ ${target.username}${password ? " (รีเซ็ตรหัสผ่าน)" : ""}${!isActive ? " (ปิดบัญชี)" : ""}`);
  refresh();
  return { ok: `บันทึกผู้ใช้ ${target.username} แล้ว` };
}
