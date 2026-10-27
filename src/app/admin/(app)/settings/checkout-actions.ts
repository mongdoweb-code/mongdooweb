"use server";
// ตั้งค่ารอบ 3 (A18/A19): เก็บเงินปลายทาง · ค่าส่งพื้นที่ห่างไกล/ตามน้ำหนัก · รับที่ร้าน · อีเมลลูกค้า (แม่แบบ + ส่งทดสอบ)
// ค่าเชื่อมต่อ SMTP อยู่ใน env เท่านั้น — หน้านี้แสดงสถานะ ไม่รับ/ไม่เก็บรหัสผ่าน
import { refresh } from "next/cache";
import { diffOf, logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireOwner } from "@/lib/auth";
import { EMAIL_TEMPLATES, TEMPLATE_LABEL, parseTemplates, sendTestEmail, type EmailTemplate } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { parseRemoteZips } from "@/lib/shipping";

export type CheckoutSettingsState = { ok?: string; error?: string; fields?: string[] };

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const satang = (v: string) => {
  const n = Number((v || "0").replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) : NaN;
};

export async function saveCheckoutSettings(_prev: CheckoutSettingsState, f: FormData): Promise<CheckoutSettingsState> {
  const admin = await requireOwner();
  const bad: string[] = [];
  const msgs: string[] = [];
  const codFee = satang(str(f, "codFee", 20));
  const codMax = satang(str(f, "codMax", 20));
  const remoteFee = satang(str(f, "remoteFee", 20));
  if (Number.isNaN(codFee)) bad.push("codFee");
  if (Number.isNaN(codMax)) bad.push("codMax");
  if (Number.isNaN(remoteFee)) bad.push("remoteFee");
  // รหัสไปรษณีย์: ตัวเลข 2–5 หลัก คั่นด้วยเว้นวรรค/จุลภาค/ขึ้นบรรทัด
  const zipText = str(f, "remoteZips", 20000);
  const zips = parseRemoteZips(zipText);
  const junk = zipText.split(/[\s,;]+/).filter((x) => x && !/^\d{2,5}$/.test(x));
  if (junk.length) { bad.push("remoteZips"); msgs.push(`รหัสไปรษณีย์ไม่ถูกต้อง: ${junk.slice(0, 5).join(", ")}`); }
  let weightTiers: { maxGram: number; extraSatang: number }[] = [];
  try {
    const raw = JSON.parse(str(f, "weightTiers", 5000) || "[]") as { maxKg: string; extra: string }[];
    weightTiers = raw
      .filter((t) => String(t.maxKg ?? "").trim() !== "" || String(t.extra ?? "").trim() !== "")
      .map((t) => ({ maxGram: Math.round(Number(String(t.maxKg).replace(/,/g, "")) * 1000), extraSatang: satang(String(t.extra)) }));
  } catch {
    bad.push("weightTiers");
  }
  if (weightTiers.some((t) => !(t.maxGram > 0) || Number.isNaN(t.extraSatang))) { bad.push("weightTiers"); msgs.push("ขั้นน้ำหนักต้องมีน้ำหนัก (กก.) มากกว่า 0 และค่าส่งเพิ่มเป็นตัวเลข"); }
  if (new Set(weightTiers.map((t) => t.maxGram)).size !== weightTiers.length) { bad.push("weightTiers"); msgs.push("น้ำหนักแต่ละขั้นต้องไม่ซ้ำกัน"); }
  weightTiers.sort((a, b) => a.maxGram - b.maxGram);

  const templates: Record<string, { subject: string; body: string }> = {};
  for (const k of EMAIL_TEMPLATES) {
    const subject = str(f, `tpl_${k}_subject`, 200);
    const body = String(f.get(`tpl_${k}_body`) ?? "").slice(0, 5000);
    if (subject || body.trim()) templates[k] = { subject, body };
  }
  if (bad.length) return { error: `กรุณาตรวจช่องที่มีกรอบสีแดง${msgs.length ? ` — ${msgs.join(" · ")}` : ""}`, fields: bad };

  const before = await getSettings();
  const after = await prisma.shopSetting.update({
    where: { id: "shop" },
    data: {
      codEnabled: f.get("codEnabled") === "on", codFeeSatang: codFee, codMaxSatang: codMax,
      remoteZips: zips, remoteFeeSatang: remoteFee, weightTiers,
      pickupEnabled: f.get("pickupEnabled") === "on", pickupNote: str(f, "pickupNote", 300) || null,
      emailEnabled: f.get("emailEnabled") === "on", emailTemplates: templates,
    },
  });
  const changed = [
    before.codEnabled !== (f.get("codEnabled") === "on") ? `COD ${f.get("codEnabled") === "on" ? "เปิด" : "ปิด"}` : "",
    before.pickupEnabled !== (f.get("pickupEnabled") === "on") ? `รับที่ร้าน ${f.get("pickupEnabled") === "on" ? "เปิด" : "ปิด"}` : "",
    before.emailEnabled !== (f.get("emailEnabled") === "on") ? `อีเมลลูกค้า ${f.get("emailEnabled") === "on" ? "เปิด" : "ปิด"}` : "",
  ].filter(Boolean);
  await logAdmin(admin.id, "SETTINGS", `บันทึกตั้งค่าการชำระเงิน/จัดส่ง/อีเมล${changed.length ? ` (${changed.join(", ")})` : ""} · ห่างไกล ${zips.length} รหัส · ขั้นน้ำหนัก ${weightTiers.length} ขั้น`, {
    entity: "ShopSetting",
    diff: diffOf(before, after, ["codEnabled", "codFeeSatang", "codMaxSatang", "remoteZips", "remoteFeeSatang", "weightTiers", "pickupEnabled", "pickupNote", "emailEnabled", "emailTemplates"]),
  });
  refreshStorefront();
  refresh();
  return { ok: "บันทึกแล้ว — หน้าชำระเงินใช้ค่าใหม่ทันที" };
}

export async function sendTestEmailAction(_prev: CheckoutSettingsState, f: FormData): Promise<CheckoutSettingsState> {
  const admin = await requireOwner();
  const to = str(f, "testTo", 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "กรุณากรอกอีเมลผู้รับให้ถูกต้อง", fields: ["testTo"] };
  const tpl = (EMAIL_TEMPLATES as readonly string[]).includes(str(f, "testTemplate", 30)) ? (str(f, "testTemplate", 30) as EmailTemplate) : "ORDER_RECEIVED";
  const s = await getSettings();
  const r = await sendTestEmail(to, tpl, parseTemplates(s.emailTemplates), s.legalName);
  await logAdmin(admin.id, "SETTINGS", `ส่งอีเมลทดสอบ "${TEMPLATE_LABEL[tpl]}" ถึง ${to}: ${r.status}${r.error ? ` (${r.error})` : ""}`);
  refresh();
  if (r.status === "SENT") return { ok: `ส่งอีเมลทดสอบถึง ${to} แล้ว — ตรวจกล่องจดหมาย (และโฟลเดอร์สแปม)` };
  if (r.status === "SKIPPED") return { error: `ยังไม่ได้ตั้งค่า SMTP ในเซิร์ฟเวอร์ (SMTP_HOST / SMTP_FROM) — บันทึกเป็น "ข้าม" แล้ว` };
  return { error: `ส่งไม่สำเร็จ: ${r.error ?? "ไม่ทราบสาเหตุ"}` };
}
