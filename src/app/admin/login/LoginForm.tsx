"use client";
// ฟอร์มเข้าสู่ระบบ (markup ตามต้นแบบ) — ตรวจรหัสและจำกัดจำนวนครั้งที่ server
// บัญชีที่เปิดยืนยันตัวตน 2 ขั้น: หลังรหัสผ่านถูกจะถามรหัส 6 หลักจากแอป (หรือรหัสสำรอง)
import { useActionState } from "react";
import { loginAction, type LoginState } from "../actions";

export function LoginForm({ idle, pending2fa }: { idle: boolean; pending2fa?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, pending2fa ? { step: "2fa", username: pending2fa } : {});
  const twoFa = state.step === "2fa";
  return (
    <form className="login-card" action={action}>
      <div className="logo">
        <div className="logo-mark">
          <span />
        </div>
        <div>
          มองดูเว็บ<small>ระบบหลังร้าน</small>
        </div>
      </div>
      <h1>{twoFa ? "ยืนยันตัวตน 2 ขั้น" : "เข้าสู่ระบบ"}</h1>
      <p>{twoFa ? `เปิดแอปยืนยันตัวตน (เช่น Google Authenticator) แล้วกรอกรหัส 6 หลักของบัญชี ${state.username ?? ""}` : "สำหรับผู้ดูแลร้านเท่านั้น"}</p>
      {idle && !twoFa && !state.error && !state.locked && (
        <div className="login-info" role="status">
          ออกจากระบบอัตโนมัติเพราะไม่มีการใช้งานนาน กรุณาเข้าสู่ระบบอีกครั้ง
        </div>
      )}
      {state.locked && (
        <div className="login-lock" role="alert">
          <b>ล็อกการเข้าสู่ระบบชั่วคราว</b>
          {state.locked}
        </div>
      )}
      {state.error && (
        <div className="login-err" role="alert">
          {state.error}
        </div>
      )}
      {twoFa ? (
        <>
          <input type="hidden" name="step" value="2fa" />
          <input type="hidden" name="username" value={state.username ?? ""} />
          <div className="field">
            <label htmlFor="otp">รหัสยืนยัน</label>
            <input id="otp" name="code" className="otp-in" autoComplete="one-time-code" placeholder="123456" maxLength={20} required autoFocus key={state.error ?? "otp"} />
            <small>
              ทำโทรศัพท์หาย? กรอก<b>รหัสสำรอง</b> (เช่น abcd-ef23) ในช่องเดียวกันได้ — ใช้ได้รหัสละครั้ง
            </small>
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "กำลังตรวจสอบ…" : "ยืนยัน"}
          </button>
          <button className="btn btn-ghost" type="submit" name="cancel" value="1" formNoValidate disabled={pending}>
            ยกเลิก กลับไปหน้าเข้าสู่ระบบ
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="u">ชื่อผู้ใช้</label>
            <input id="u" name="username" autoComplete="username" defaultValue={state.username} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="pw">รหัสผ่าน</label>
            <input id="pw" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
          </button>
        </>
      )}
    </form>
  );
}
