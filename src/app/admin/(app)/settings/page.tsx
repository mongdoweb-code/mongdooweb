// /admin/settings — ตั้งค่าร้าน (เจ้าของร้านเท่านั้น): ข้อมูลร้าน, การชำระเงิน + ตัวอย่าง QR พร้อมเพย์, ค่าส่ง, แถบประกาศ,
// รหัส GA4/Meta Pixel, งานอัตโนมัติ, เอกสารขาย — รหัสผ่านอยู่ที่ /admin/account, ผู้ใช้อยู่ที่ /admin/users
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { BANKS, getSettings, parseBankAccounts, parseShippingTiers } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";
import { CheckoutSettings } from "./CheckoutSettings";
import { DEFAULT_TEMPLATES, TEMPLATE_LABEL, TEMPLATE_VARS, smtpStatus } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { parseRemoteZips, parseWeightTiers } from "@/lib/shipping";

const baht = (satang: number) => String(satang / 100);

export default async function SettingsPage() {
  await requireOwner();
  const s = await getSettings();
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>ตั้งค่าร้าน</h1>
          <p>ค่าที่บันทึกใช้กับหน้าร้าน หน้าชำระเงิน ใบปะหน้า และเอกสารขายทันที</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href="/admin/users">ผู้ใช้หลังบ้าน</Link>
          <Link className="btn btn-outline" href="/admin/system">สถานะระบบ / สำรองข้อมูล</Link>
        </div>
      </div>
      <SettingsForm
          banks={BANKS}
          v={{
            legalName: s.legalName, phone: s.phone, email: s.email ?? "", lineId: s.lineId ?? "", lineOaUrl: s.lineOaUrl ?? "",
            website: s.website ?? "", addressText: s.addressText, businessHours: s.businessHours ?? "",
            facebookUrl: s.facebookUrl ?? "", youtubeUrl: s.youtubeUrl ?? "", tiktokUrl: s.tiktokUrl ?? "",
            bankAccounts: parseBankAccounts(s.bankAccounts), promptpayId: s.promptpayId ?? "", promptpayName: s.promptpayName,
            tiers: parseShippingTiers(s.shippingTiers).map((t) => ({ min: baht(t.minSatang), fee: baht(t.feeSatang) })),
            expressEnabled: s.expressEnabled, expressExtra: baht(s.expressExtraSatang),
            slipCheckWithin: s.slipCheckWithin, newOrderSound: s.newOrderSound,
            taxId: s.taxId ?? "", branch: s.branch ?? "", vatEnabled: s.vatEnabled, vatMode: s.vatMode,
            prefixQuote: s.prefixQuote, prefixInvoice: s.prefixInvoice, prefixReceipt: s.prefixReceipt, dateEra: s.dateEra,
            quoteValidDays: s.quoteValidDays, invoiceDueDays: s.invoiceDueDays,
            termsQuote: s.termsQuote ?? "", termsInvoice: s.termsInvoice ?? "", termsReceipt: s.termsReceipt ?? "", showSignature: s.showSignature,
            logoUrl: mediaUrl(s.logoKey),
            announcementEnabled: s.announcementEnabled, announcementText: s.announcementText, announcementHref: s.announcementHref ?? "",
            ga4Id: s.ga4Id ?? "", metaPixelId: s.metaPixelId ?? "",
            autoCancelDays: s.autoCancelDays, lowStockThreshold: s.lowStockThreshold, lineLowStock: s.lineLowStock, lineDailySummary: s.lineDailySummary,
          }}
        />
      <CheckoutSettings
        v={{
          codEnabled: s.codEnabled, codFee: baht(s.codFeeSatang), codMax: baht(s.codMaxSatang),
          remoteZips: parseRemoteZips(s.remoteZips).join(" "), remoteFee: baht(s.remoteFeeSatang),
          weightTiers: parseWeightTiers(s.weightTiers).map((t) => ({ maxKg: String(t.maxGram / 1000), extra: baht(t.extraSatang) })),
          pickupEnabled: s.pickupEnabled, pickupNote: s.pickupNote ?? "",
          emailEnabled: s.emailEnabled,
          templates: (s.emailTemplates && typeof s.emailTemplates === "object" && !Array.isArray(s.emailTemplates) ? s.emailTemplates : {}) as Record<string, { subject: string; body: string }>,
          defaults: DEFAULT_TEMPLATES, smtp: smtpStatus(), vars: TEMPLATE_VARS,
        }}
      />
      <EmailLogBox />
    </main>
  );
}

/** อีเมลที่ส่งล่าสุด (สถานะ ส่งแล้ว / ไม่สำเร็จ / ข้าม) */
async function EmailLogBox() {
  const rows = await prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  if (!rows.length) return null;
  const ST: Record<string, string> = { SENT: "ส่งแล้ว", FAILED: "ไม่สำเร็จ", SKIPPED: "ข้าม (ยังไม่ตั้ง SMTP/ปิดอยู่)" };
  return (
    <section className="box" id="emailLog" style={{ marginTop: 16 }}>
      <h3>อีเมลล่าสุด</h3>
      <table className="tbl">
        <thead><tr><th>เวลา</th><th>ถึง</th><th>แม่แบบ</th><th>สถานะ</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.createdAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" })}</td>
              <td>{r.to}</td>
              <td>{TEMPLATE_LABEL[r.template as keyof typeof TEMPLATE_LABEL] ?? r.template}</td>
              <td title={r.error ?? undefined}>{ST[r.status] ?? r.status}{r.error ? ` — ${r.error.slice(0, 80)}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
