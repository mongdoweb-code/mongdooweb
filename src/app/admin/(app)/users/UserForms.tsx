"use client";
// ฟอร์มจัดการผู้ใช้หลังบ้าน (เจ้าของร้าน) — รหัสผ่านชั่วคราวแสดงครั้งเดียวหลังเพิ่ม/รีเซ็ต
import { useFormAction } from "../../_components/useFormAction";
import { CopyButton } from "../../_components/AdminClient";
import { createUser, resetPassword, resetTwoFactor, revokeAllOfUser, updateUser, type UserState } from "./actions";

export type UserView = {
  id: string; username: string; displayName: string; role: "OWNER" | "STAFF"; isActive: boolean; totpEnabled: boolean;
  mustChangePassword: boolean; lastLogin: string | null; sessions: number; created: string;
};

const bad = (s: UserState, k: string) => (s.fields?.includes(k) ? " has-err" : "");

function Msg({ s }: { s: UserState }) {
  if (s.error) return <div className="err-box" role="alert">{s.error}</div>;
  if (s.ok && !s.temp) return <div className="ok-box" role="status">{s.ok}</div>;
  return null;
}

function TempPassword({ t }: { t: NonNullable<UserState["temp"]> }) {
  return (
    <div className="temp-pw" role="status">
      <b>รหัสผ่านชั่วคราวของ {t.username} (แสดงครั้งเดียว)</b>
      <code className="num">{t.password}</code>
      <span className="sub">ส่งให้ผู้ใช้ทางช่องทางส่วนตัว — ผู้ใช้ต้องตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งแรก</span>
      <CopyButton text={t.password} done="คัดลอกรหัสผ่านชั่วคราวแล้ว">คัดลอก</CopyButton>
    </div>
  );
}

export function NewUserForm() {
  const [s, onSubmit, pending] = useFormAction<UserState>(createUser, {});
  return (
    <form className="box acc-form" onSubmit={onSubmit} id="new-user">
      <h3>เพิ่มผู้ใช้ใหม่</h3>
      <Msg s={s} />
      {s.temp && <TempPassword t={s.temp} />}
      <div className="two">
        <div className={`field${bad(s, "username")}`}>
          <label htmlFor="nu-u">ชื่อผู้ใช้ (a-z 0-9)</label>
          <input id="nu-u" name="username" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._\-]+" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="nu-n">ชื่อที่แสดง</label>
          <input id="nu-n" name="displayName" maxLength={80} placeholder="เช่น น้องแพร (แพ็กของ)" />
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="nu-r">สิทธิ์</label>
          <select id="nu-r" name="role" defaultValue="STAFF">
            <option value="STAFF">พนักงาน</option>
            <option value="OWNER">เจ้าของร้าน</option>
          </select>
        </div>
        <div className={`field${bad(s, "password")}`}>
          <label htmlFor="nu-p">รหัสผ่านเริ่มต้น</label>
          <input id="nu-p" name="password" type="password" autoComplete="new-password" placeholder="เว้นว่าง = สร้างให้อัตโนมัติ" />
        </div>
      </div>
      <small className="sub">ผู้ใช้ใหม่ต้องตั้งรหัสผ่านของตัวเอง (อย่างน้อย 10 ตัวอักษร) ตอนเข้าสู่ระบบครั้งแรก</small>
      <div><button className="btn btn-dark" type="submit" disabled={pending}>เพิ่มผู้ใช้</button></div>
    </form>
  );
}

export function UserCard({ u, me }: { u: UserView; me: string }) {
  const [s, onSave, p1] = useFormAction<UserState>(updateUser, {});
  const [r, onReset, p2] = useFormAction<UserState>(resetPassword, {});
  const [t, onTwo, p3] = useFormAction<UserState>(resetTwoFactor, {});
  const self = u.id === me;
  return (
    <li className={`u-card${u.isActive ? "" : " off"}`} data-user={u.username}>
      <div className="u-top">
        <div className="u-name">
          <b>{u.displayName}{self && <span className="chip new">คุณ</span>}</b>
          <span className="sub">{u.username} · สร้างเมื่อ {u.created}</span>
        </div>
        <div className="u-tags">
          <span className={`chip ${u.role === "OWNER" ? "warn" : "gray"}`}>{u.role === "OWNER" ? "เจ้าของร้าน" : "พนักงาน"}</span>
          {!u.isActive && <span className="chip bad">ปิดบัญชี</span>}
          {u.totpEnabled ? <span className="dst dst-ok">2FA</span> : <span className="chip gray">ไม่มี 2FA</span>}
          {u.mustChangePassword && <span className="chip warn">รอตั้งรหัสใหม่</span>}
        </div>
        <div className="u-meta sub">
          {u.lastLogin ? `เข้าใช้ล่าสุด ${u.lastLogin}` : "ยังไม่เคยเข้าใช้"} · ออนไลน์ {u.sessions} เครื่อง
        </div>
      </div>
      <Msg s={s} />
      <Msg s={r} />
      {r.temp && <TempPassword t={r.temp} />}
      <Msg s={t} />
      <details className="acc-det">
        <summary>แก้ไข / รีเซ็ต</summary>
        <form className="u-edit" onSubmit={onSave}>
          <input type="hidden" name="id" value={u.id} />
          <div className="field">
            <label htmlFor={`dn-${u.id}`}>ชื่อที่แสดง</label>
            <input id={`dn-${u.id}`} name="displayName" defaultValue={u.displayName} maxLength={80} />
          </div>
          <div className="field">
            <label htmlFor={`rl-${u.id}`}>สิทธิ์</label>
            {self && <input type="hidden" name="role" value="OWNER" />}
            <select id={`rl-${u.id}`} name={self ? undefined : "role"} defaultValue={u.role} disabled={self}>
              <option value="OWNER">เจ้าของร้าน</option>
              <option value="STAFF">พนักงาน</option>
            </select>
          </div>
          <label className="chk-row">
            {self && <input type="hidden" name="isActive" value="on" />}
            <input type="checkbox" name={self ? undefined : "isActive"} defaultChecked={u.isActive} disabled={self} /> เปิดใช้งานบัญชี
          </label>
          <div><button className="btn btn-dark btn-sm" type="submit" disabled={p1}>บันทึก</button></div>
        </form>
        {!self && (
          <div className="u-danger">
            <form onSubmit={onReset}>
              <input type="hidden" name="id" value={u.id} />
              <button className="btn btn-outline btn-sm" type="submit" disabled={p2}>รีเซ็ตรหัสผ่าน (สร้างรหัสชั่วคราว)</button>
            </form>
            {u.sessions > 0 && (
              <form action={revokeAllOfUser}>
                <input type="hidden" name="id" value={u.id} />
                <button className="btn btn-outline btn-sm" type="submit">ออกจากระบบทุกเครื่อง</button>
              </form>
            )}
            {u.totpEnabled && (
              <form onSubmit={onTwo}>
                <input type="hidden" name="id" value={u.id} />
                <button className="btn btn-danger btn-sm" type="submit" disabled={p3}>ล้าง 2FA (โทรศัพท์หาย)</button>
              </form>
            )}
          </div>
        )}
      </details>
    </li>
  );
}
