"use server";
// บันทึกตั้งค่าร้าน / โลโก้ / แถบประกาศ / รหัสวิเคราะห์ / งานอัตโนมัติ — เจ้าของร้านเท่านั้น
// (รหัสผ่านย้ายไป /admin/account, ผู้ใช้ย้ายไป /admin/users)
import { refresh } from "next/cache";
import { refreshStorefront, logAdmin } from "@/lib/admin-log";
import { requireOwner } from "@/lib/auth";
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
  const admin = await requireOwner();
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
  // แถบประกาศ + รหัสวิเคราะห์ + งานอัตโนมัติ
  const announcementEnabled = f.get("announcementEnabled") === "on";
  const announcementText = str(f, "announcementText", 120);
  if (announcementEnabled && !announcementText) bad.push("announcementText");
  const announcementHref = opt(f, "announcementHref", 300);
  if (announcementHref && !/^(\/(?!\/)|#|https:\/\/|tel:|mailto:)\S*$/i.test(announcementHref)) bad.push("announcementHref");
  const ga4Id = str(f, "ga4Id", 20).toUpperCase();
  if (ga4Id && !/^G-[A-Z0-9]{6,12}$/.test(ga4Id)) bad.push("ga4Id");
  const metaPixelId = str(f, "metaPixelId", 20).replace(/\s/g, "");
  if (metaPixelId && !/^\d{15,16}$/.test(metaPixelId)) bad.push("metaPixelId");
  const intIn = (k: string, min: number, max: number) => {
    const raw = str(f, k, 6) || "0";
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || n < min || n > max) bad.push(k);
    return n;
  };
  const autoCancelDays = intIn("autoCancelDays", 0, 60);
  const lowStockThreshold = intIn("lowStockThreshold", 0, 9999);

  for (const k of ["legalName", "phone", "addressText", "promptpayName", "slipCheckWithin"]) if (!str(f, k)) bad.push(k);
  if (bad.length) {
    const why: Record<string, string> = {
      ga4Id: "รหัส GA4 ต้องเป็นรูปแบบ G-XXXXXXXXXX",
      metaPixelId: "Meta Pixel ID ต้องเป็นตัวเลข 15–16 หลัก",
      announcementHref: "ลิงก์แถบประกาศต้องขึ้นต้นด้วย /, https://, tel: หรือ mailto:",
      announcementText: "กรอกข้อความแถบประกาศ",
      autoCancelDays: "วันยกเลิกอัตโนมัติต้องเป็น 0–60",
      lowStockThreshold: "เกณฑ์สินค้าใกล้หมดต้องเป็น 0–9999",
      promptpayId: "เลขพร้อมเพย์ต้องเป็น 10, 13 หรือ 15 หลัก",
      taxId: "เลขผู้เสียภาษีไม่ถูกต้อง",
    };
    const detail = bad.map((b) => why[b]).filter(Boolean);
    return { error: `กรุณาตรวจช่องที่มีกรอบสีแดง${detail.length ? ` — ${detail.join(" · ")}` : ""}`, fields: bad };
  }

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
      announcementEnabled,
      announcementText: announcementText || undefined,
      announcementHref,
      ga4Id: ga4Id || null,
      metaPixelId: metaPixelId || null,
      autoCancelDays,
      lowStockThreshold,
      lineLowStock: f.get("lineLowStock") === "on",
      lineDailySummary: f.get("lineDailySummary") === "on",
      ...(logoKey ? { logoKey } : {}),
      ...(f.get("removeLogo") === "on" && !logoKey ? { logoKey: null } : {}),
    },
  });
  await logAdmin(admin.id, "SETTINGS", "บันทึกตั้งค่าร้าน");
  refreshStorefront();
  refresh();
  return { ok: "บันทึกการตั้งค่าแล้ว — หน้าร้านและหน้าชำระเงินใช้ค่าใหม่ทันที" };
}
