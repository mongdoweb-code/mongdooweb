"use client";
// ฟอร์มเข้าสู่ระบบ (markup ตามต้นแบบ) — ตรวจรหัสและจำกัดจำนวนครั้งที่ server
import { useActionState } from "react";
import { loginAction, type LoginState } from "../actions";

export function LoginForm({ idle }: { idle: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
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
      <h1>เข้าสู่ระบบ</h1>
      <p>สำหรับผู้ดูแลร้านเท่านั้น</p>
      {idle && !state.error && !state.locked && (
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
    </form>
  );
}
