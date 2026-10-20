// /admin/settings — ตั้งค่าร้าน (เจ้าของร้าน), เปลี่ยนรหัสผ่าน, ผู้ใช้หลังบ้าน
import { requireAdmin } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { BANKS, getSettings, parseBankAccounts, parseShippingTiers } from "@/lib/settings";
import { PasswordForm, UsersForm } from "./AccountForms";
import { SettingsForm } from "./SettingsForm";

const baht = (satang: number) => String(satang / 100);

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const s = await getSettings();
  const users = admin.role === "OWNER" ? await prisma.admin.findMany({ orderBy: { createdAt: "asc" } }) : [];
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>ตั้งค่าร้าน</h1>
          <p>ค่าที่บันทึกใช้กับหน้าร้าน หน้าชำระเงิน ใบปะหน้า และเอกสารขายทันที</p>
        </div>
      </div>
      {admin.role === "OWNER" ? (
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
          }}
        />
      ) : (
        <div className="warn-box">เฉพาะเจ้าของร้านเท่านั้นที่แก้ตั้งค่าร้านได้ — คุณเปลี่ยนรหัสผ่านของตัวเองได้ด้านล่าง</div>
      )}
      <div className="set-grid" style={{ marginTop: 24 }}>
        <PasswordForm />
        {admin.role === "OWNER" && (
          <UsersForm
            me={admin.id}
            users={users.map((u) => ({
              id: u.id, username: u.username, displayName: u.displayName, role: u.role, isActive: u.isActive,
              lastLoginAt: u.lastLoginAt?.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) ?? null,
            }))}
          />
        )}
      </div>
    </main>
  );
}
