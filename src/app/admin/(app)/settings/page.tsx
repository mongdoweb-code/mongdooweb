// /admin/settings — ตั้งค่าร้าน (เจ้าของร้านเท่านั้น): ข้อมูลร้าน, การชำระเงิน + ตัวอย่าง QR พร้อมเพย์, ค่าส่ง, แถบประกาศ,
// รหัส GA4/Meta Pixel, งานอัตโนมัติ, เอกสารขาย — รหัสผ่านอยู่ที่ /admin/account, ผู้ใช้อยู่ที่ /admin/users
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { BANKS, getSettings, parseBankAccounts, parseShippingTiers } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";

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
    </main>
  );
}
