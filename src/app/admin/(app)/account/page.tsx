// /admin/account — บัญชีของฉัน: รหัสผ่าน (บังคับเปลี่ยนครั้งแรก/หลังรีเซ็ต), ชื่อที่แสดง, ยืนยันตัวตน 2 ขั้น, อุปกรณ์ที่เข้าสู่ระบบ
import QRCode from "qrcode";
import { listSessions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { otpauthUrl } from "@/lib/totp";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { PasswordForm, ProfileForm, TwoFactorBox } from "./AccountForms";
import { SessionList } from "./SessionList";
import { revokeMyOtherSessions, revokeMySession } from "./actions";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AccountPage({ searchParams }: PageProps<"/admin/account">) {
  const admin = await requireAdmin({ allowPasswordChange: true });
  const sp = await searchParams;
  const row = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
  const forced = row.mustChangePassword;
  const sessions = await listSessions(admin, admin.id);
  const setup =
    !row.totpEnabled && row.totpSecret
      ? { key: row.totpSecret, qr: await QRCode.toDataURL(otpauthUrl(row.totpSecret, row.username), { errorCorrectionLevel: "M", margin: 1, width: 220 }) }
      : null;
  const backupLeft = Array.isArray(row.backupCodes) ? row.backupCodes.length : 0;
  const revoked = one(sp.revoked);
  const loginBackup = one(sp.backup);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>บัญชีของฉัน</h1>
          <p>รหัสผ่าน การยืนยันตัวตน 2 ขั้น และอุปกรณ์ที่เข้าสู่ระบบด้วยบัญชี {row.username}</p>
        </div>
      </div>
      <div className="notice-stack">
        {forced && (
          <div className="warn-box" role="alert">
            <b>ต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน</b> — บัญชีนี้ใช้รหัสผ่านชั่วคราว (สร้างใหม่หรือถูกรีเซ็ต) กรุณาตั้งรหัสผ่านของคุณเองอย่างน้อย 10 ตัวอักษร
          </div>
        )}
        {/^\d+$/.test(loginBackup) && (
          <div className={Number(loginBackup) <= 2 ? "warn-box" : "info-box"} role="status">
            เข้าสู่ระบบด้วยรหัสสำรองแล้ว — เหลือรหัสสำรอง {loginBackup} รหัส{Number(loginBackup) <= 2 ? " ควรสร้างชุดใหม่ด้านล่าง" : ""}
          </div>
        )}
        {/^\d+$/.test(revoked) && <div className="ok-box" role="status">ออกจากระบบอุปกรณ์อื่นแล้ว {revoked} เครื่อง</div>}
        {one(sp.err) === "current" && <div className="err-box" role="alert">ใช้ปุ่ม &quot;ออกจากระบบ&quot; ที่เมนูเพื่อออกจากเครื่องนี้</div>}
      </div>

      <div className="set-grid acc-grid">
        <PasswordForm forced={forced} />
        {!forced && <ProfileForm displayName={row.displayName} username={row.username} role={row.role} />}
        {!forced && (
          <div className="full">
            <TwoFactorBox enabled={row.totpEnabled} setup={setup} backupLeft={backupLeft} />
          </div>
        )}
        <section className="panel full" id="sessions">
          <div className="panel-head">
            <div>
              <h2>อุปกรณ์ที่เข้าสู่ระบบอยู่</h2>
              <p>ไม่รู้จักเครื่องไหน ให้กดออกจากระบบ แล้วเปลี่ยนรหัสผ่านทันที</p>
            </div>
            {sessions.length > 1 && (
              <form action={revokeMyOtherSessions}>
                <ConfirmSubmit className="btn btn-outline btn-sm" title="ออกจากระบบทุกเครื่อง?" body="ทุกอุปกรณ์ยกเว้นเครื่องนี้จะต้องเข้าสู่ระบบใหม่" confirmLabel="ออกจากระบบทุกเครื่อง">
                  ออกจากระบบทุกเครื่อง (ยกเว้นเครื่องนี้)
                </ConfirmSubmit>
              </form>
            )}
          </div>
          <SessionList rows={sessions} action={revokeMySession} />
        </section>
      </div>
    </main>
  );
}
