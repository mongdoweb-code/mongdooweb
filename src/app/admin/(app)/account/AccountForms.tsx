"use client";
// ฟอร์มในหน้า "บัญชีของฉัน" — รหัสผ่าน, ชื่อที่แสดง, ยืนยันตัวตน 2 ขั้น (QR + รหัสสำรอง)
import { useState } from "react";
import { useFormAction } from "../../_components/useFormAction";
import { CopyButton } from "../../_components/AdminClient";
import { cancelTotp, changePassword, disableTotp, enableTotp, regenerateBackupCodes, startTotp, updateProfile, type AccountState } from "./actions";

const bad = (s: AccountState, k: string) => (s.fields?.includes(k) ? " has-err" : "");

function Msg({ s }: { s: AccountState }) {
  if (s.error) return <div className="login-err" role="alert">{s.error}</div>;
  if (s.ok) return <div className="login-info" role="status">{s.ok}</div>;
  return null;
}

/** ความแข็งแรงรหัสผ่านแบบคร่าวๆ (ตรวจจริงที่ server) */
function strength(pw: string) {
  if (!pw) return { n: 0, label: "" };
  let n = 0;
  if (pw.length >= 10) n++;
  if (pw.length >= 14) n++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
  if (/\d/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  if (pw.length < 10) return { n: 1, label: "สั้นเกินไป (อย่างน้อย 10 ตัว)" };
  return { n, label: n >= 4 ? "แข็งแรง" : n >= 3 ? "พอใช้" : "อ่อน — เพิ่มความยาว ตัวพิมพ์ใหญ่ ตัวเลข หรือสัญลักษณ์" };
}

export function PasswordForm({ forced }: { forced: boolean }) {
  const [state, onSubmit, pending] = useFormAction<AccountState>(changePassword, {});
  const [pw, setPw] = useState("");
  const st = strength(pw);
  return (
    <form className="box acc-form" onSubmit={onSubmit} id="password">
      <h3>{forced ? "ตั้งรหัสผ่านใหม่" : "เปลี่ยนรหัสผ่าน"}</h3>
      <Msg s={state} />
      <div className={`field${bad(state, "current")}`}>
        <label htmlFor="pw-cur">{forced ? "รหัสผ่านชั่วคราว / รหัสผ่านปัจจุบัน" : "รหัสผ่านปัจจุบัน"}</label>
        <input id="pw-cur" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className={`field${bad(state, "next")}`}>
        <label htmlFor="pw-new">รหัสผ่านใหม่ (อย่างน้อย 10 ตัวอักษร)</label>
        <input id="pw-new" name="next" type="password" autoComplete="new-password" minLength={10} required value={pw} onChange={(e) => setPw(e.target.value)} />
        {pw && (
          <span className={`pw-meter s${Math.min(st.n, 4)}`} aria-live="polite">
            <i /><i /><i /><i />
            <em>{st.label}</em>
          </span>
        )}
      </div>
      <div className={`field${bad(state, "confirm")}`}>
        <label htmlFor="pw-cf">ยืนยันรหัสผ่านใหม่</label>
        <input id="pw-cf" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <small className="sub">แนะนำ: ใช้วลียาวๆ ที่จำง่าย เช่น 4–5 คำต่อกัน · ห้ามใช้ชื่อผู้ใช้ · เปลี่ยนแล้วเครื่องอื่นที่ล็อกอินค้างไว้จะถูกออกจากระบบ</small>
      <div><button className="btn btn-dark" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : forced ? "ตั้งรหัสผ่านใหม่" : "เปลี่ยนรหัสผ่าน"}</button></div>
    </form>
  );
}

export function ProfileForm({ displayName, username, role }: { displayName: string; username: string; role: string }) {
  const [state, onSubmit, pending] = useFormAction<AccountState>(updateProfile, {});
  return (
    <form className="box acc-form" onSubmit={onSubmit}>
      <h3>ข้อมูลบัญชี</h3>
      <Msg s={state} />
      <div className="kv"><span>ชื่อผู้ใช้</span><b>{username}</b><span>สิทธิ์</span><b>{role === "OWNER" ? "เจ้าของร้าน" : "พนักงาน"}</b></div>
      <div className={`field${bad(state, "displayName")}`}>
        <label htmlFor="dn">ชื่อที่แสดง (ในบันทึกการใช้งานและเมนู)</label>
        <input id="dn" name="displayName" defaultValue={displayName} maxLength={80} required />
      </div>
      <div><button className="btn btn-outline btn-sm" type="submit" disabled={pending}>บันทึกชื่อ</button></div>
    </form>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const text = `รหัสสำรองยืนยันตัวตน 2 ขั้น — หลังร้านมองดูเว็บ\n(ใช้ได้รหัสละ 1 ครั้ง)\n\n${codes.join("\n")}\n`;
  return (
    <div className="bk-box">
      <b>รหัสสำรอง (แสดงครั้งเดียว)</b>
      <p className="sub">ใช้แทนรหัสจากแอปเมื่อโทรศัพท์หาย — รหัสละ 1 ครั้ง เก็บไว้ในที่ปลอดภัย (พิมพ์/จดไว้ ไม่เก็บในโทรศัพท์เครื่องเดียวกัน)</p>
      <ol className="bk-codes num">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
      <div className="mini-acts">
        <CopyButton text={codes.join("\n")} done="คัดลอกรหัสสำรองแล้ว">คัดลอก</CopyButton>
        <a className="btn btn-outline btn-sm" download="mongdoweb-backup-codes.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}>ดาวน์โหลด .txt</a>
      </div>
    </div>
  );
}

export function TwoFactorBox({ enabled, setup, backupLeft }: { enabled: boolean; setup: { qr: string; key: string } | null; backupLeft: number }) {
  const [en, onEnable, p1] = useFormAction<AccountState>(enableTotp, {});
  const [rg, onRegen, p2] = useFormAction<AccountState>(regenerateBackupCodes, {});
  const [ds, onDisable, p3] = useFormAction<AccountState>(disableTotp, {});
  const codes = enabled ? (rg.codes ?? en.codes) : undefined;
  return (
    <section className="box acc-form" id="twofa">
      <h3>
        ยืนยันตัวตน 2 ขั้น (2FA)
        {enabled ? <span className="dst dst-ok">เปิดใช้อยู่</span> : <span className="dst dst-pend">ยังไม่เปิด</span>}
      </h3>
      <p className="sub">เข้าสู่ระบบต้องใช้ทั้งรหัสผ่านและรหัส 6 หลักจากแอปในโทรศัพท์ (Google Authenticator, Microsoft Authenticator ฯลฯ) — รหัสผ่านรั่วก็ยังเข้าไม่ได้</p>
      {!enabled && ds.ok && <Msg s={ds} />}
      {codes && <><Msg s={rg.codes ? rg : en} /><BackupCodes codes={codes} /></>}
      {!enabled && !setup && !codes && (
        <form action={startTotp}><button className="btn btn-primary" type="submit">เริ่มตั้งค่า</button></form>
      )}
      {!enabled && setup && (
        <div className="totp-setup">
          <ol className="totp-steps">
            <li>เปิดแอปยืนยันตัวตน แล้วกด <b>+</b> › <b>สแกนคิวอาร์โค้ด</b></li>
            <li>สแกนรูปนี้ (หรือพิมพ์รหัสตั้งค่าด้วยมือ)</li>
            <li>กรอกรหัส 6 หลักที่แอปแสดง แล้วกด &quot;ยืนยันและเปิดใช้&quot;</li>
          </ol>
          <div className="totp-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="คิวอาร์โค้ดสำหรับแอปยืนยันตัวตน" width={200} height={200} />
            <div>
              <span className="sub">รหัสตั้งค่า (ถ้าสแกนไม่ได้)</span>
              <code className="totp-key" id="totpKey">{setup.key.replace(/(.{4})/g, "$1 ").trim()}</code>
              <CopyButton text={setup.key} done="คัดลอกรหัสตั้งค่าแล้ว">คัดลอกรหัส</CopyButton>
            </div>
          </div>
          <form className="totp-verify" onSubmit={onEnable}>
            <Msg s={en.codes ? {} : en} />
            <div className={`field${bad(en, "code")}`}>
              <label htmlFor="totp-code">รหัส 6 หลักจากแอป</label>
              <input id="totp-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required placeholder="123456" />
            </div>
            <div><button className="btn btn-primary" type="submit" disabled={p1}>ยืนยันและเปิดใช้</button></div>
          </form>
          <form action={cancelTotp}><button className="btn btn-ghost btn-sm" type="submit">ยกเลิกการตั้งค่า</button></form>
        </div>
      )}
      {enabled && (
        <div className="totp-on">
          <p className={backupLeft <= 2 ? "warn-box" : "sub"}>
            รหัสสำรองเหลือ <b>{backupLeft}</b> รหัส{backupLeft <= 2 ? " — ควรสร้างชุดใหม่" : ""}
          </p>
          <details className="acc-det">
            <summary>สร้างรหัสสำรองชุดใหม่</summary>
            <form onSubmit={onRegen}>
              {!rg.codes && <Msg s={rg} />}
              <div className={`field${bad(rg, "password")}`}>
                <label htmlFor="rg-pw">ยืนยันด้วยรหัสผ่าน</label>
                <input id="rg-pw" name="password" type="password" autoComplete="current-password" required />
              </div>
              <button className="btn btn-outline btn-sm" type="submit" disabled={p2}>สร้างชุดใหม่</button>
            </form>
          </details>
          <details className="acc-det">
            <summary>ปิดการยืนยันตัวตน 2 ขั้น</summary>
            <form onSubmit={onDisable}>
              <Msg s={ds} />
              <div className={`field${bad(ds, "password")}`}>
                <label htmlFor="ds-pw">รหัสผ่าน</label>
                <input id="ds-pw" name="password" type="password" autoComplete="current-password" required />
              </div>
              <div className={`field${bad(ds, "code")}`}>
                <label htmlFor="ds-code">รหัสจากแอป หรือรหัสสำรอง</label>
                <input id="ds-code" name="code" autoComplete="one-time-code" maxLength={20} required />
              </div>
              <button className="btn btn-danger btn-sm" type="submit" disabled={p3}>ปิด 2FA</button>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}
