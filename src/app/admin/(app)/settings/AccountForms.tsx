"use client";
// เปลี่ยนรหัสผ่านของตัวเอง + จัดการผู้ใช้หลังบ้าน (เฉพาะเจ้าของร้าน)
import { useFormAction } from "../../_components/useFormAction";
import { changePassword, saveAdminUser, type FormState } from "./actions";

export function PasswordForm() {
  const [state, onSubmit, pending] = useFormAction<FormState>(changePassword, {});
  return (
    <form className="box" onSubmit={onSubmit}>
      <h3>เปลี่ยนรหัสผ่านของฉัน</h3>
      {state.error && <div className="login-err" role="alert">{state.error}</div>}
      {state.ok && <div className="login-info" role="status">{state.ok}</div>}
      <div className="field"><label htmlFor="pw-cur">รหัสผ่านปัจจุบัน</label><input id="pw-cur" name="current" type="password" autoComplete="current-password" required /></div>
      <div className="two">
        <div className="field"><label htmlFor="pw-new">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input id="pw-new" name="next" type="password" autoComplete="new-password" minLength={8} required /></div>
        <div className="field"><label htmlFor="pw-cf">ยืนยันรหัสผ่านใหม่</label><input id="pw-cf" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></div>
      </div>
      <div><button className="btn btn-dark btn-sm" type="submit" disabled={pending}>เปลี่ยนรหัสผ่าน</button></div>
    </form>
  );
}

type User = { id: string; username: string; displayName: string; role: string; isActive: boolean; lastLoginAt: string | null };

function UserRow({ u, me }: { u: User; me: string }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveAdminUser, {});
  return (
    <form className="user-row" onSubmit={onSubmit}>
      <input type="hidden" name="id" value={u.id} />
      <div><b>{u.username}</b><span className="sub">{u.lastLoginAt ? `เข้าใช้ล่าสุด ${u.lastLoginAt}` : "ยังไม่เคยเข้าใช้"}</span></div>
      <input name="displayName" defaultValue={u.displayName} aria-label="ชื่อที่แสดง" />
      <select name="role" defaultValue={u.role} aria-label="สิทธิ์" disabled={u.id === me}>
        <option value="OWNER">เจ้าของร้าน</option>
        <option value="STAFF">พนักงาน</option>
      </select>
      {u.id === me && <input type="hidden" name="role" value="OWNER" />}
      <select name="isActive" defaultValue={u.isActive ? "on" : "off"} aria-label="สถานะ" disabled={u.id === me}>
        <option value="on">ใช้งาน</option>
        <option value="off">ปิดบัญชี</option>
      </select>
      <input name="password" type="password" placeholder="รีเซ็ตรหัสผ่าน (ไม่บังคับ)" autoComplete="new-password" aria-label="รหัสผ่านใหม่" />
      <button className="btn btn-outline btn-sm" type="submit" disabled={pending}>บันทึก</button>
      {(state.error || state.ok) && <span className={state.error ? "err-msg" : "sub"}>{state.error ?? state.ok}</span>}
    </form>
  );
}

export function UsersForm({ users, me }: { users: User[]; me: string }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveAdminUser, {});
  return (
    <div className="box full">
      <h3>ผู้ใช้หลังบ้าน</h3>
      <p className="sub">เจ้าของร้านแก้ได้ทุกอย่าง · พนักงานตรวจสลิป จัดส่ง และออกเอกสารได้ แต่แก้ตั้งค่าร้านไม่ได้</p>
      <div className="users">{users.map((u) => <UserRow key={u.id} u={u} me={me} />)}</div>
      <form className="user-row new" onSubmit={onSubmit}>
        <div><b>เพิ่มผู้ใช้ใหม่</b></div>
        <input name="username" placeholder="ชื่อผู้ใช้ (a-z 0-9)" aria-label="ชื่อผู้ใช้" required />
        <input name="displayName" placeholder="ชื่อที่แสดง" aria-label="ชื่อที่แสดง" />
        <select name="role" defaultValue="STAFF" aria-label="สิทธิ์"><option value="STAFF">พนักงาน</option><option value="OWNER">เจ้าของร้าน</option></select>
        <input name="password" type="password" placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)" aria-label="รหัสผ่าน" autoComplete="new-password" required minLength={8} />
        <button className="btn btn-dark btn-sm" type="submit" disabled={pending}>เพิ่มผู้ใช้</button>
        {(state.error || state.ok) && <span className={state.error ? "err-msg" : "sub"}>{state.error ?? state.ok}</span>}
      </form>
    </div>
  );
}
