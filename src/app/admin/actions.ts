"use server";
// เข้าสู่ระบบ (รหัสผ่าน → รหัสยืนยัน 2 ขั้นถ้าเปิดไว้) / ออกจากระบบ หลังบ้าน
import { redirect } from "next/navigation";
import { cancelTwoFactor, login, logout, verifyTwoFactor, type LoginResult } from "@/lib/auth";

export type LoginState = { error?: string; locked?: string; username?: string; step?: "password" | "2fa"; info?: string };

const lockedMsg = (until: Date) =>
  `ใส่รหัสผิดหลายครั้ง ลองใหม่ได้หลังเวลา ${until.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} น.`;

function failState(r: Exclude<LoginResult, { ok: true }>, username: string, step: LoginState["step"]): LoginState {
  if (r.reason === "locked") return { locked: lockedMsg(r.until), username, step: "password" };
  if (r.reason === "expired") return { error: "หมดเวลายืนยันตัวตน กรุณาเข้าสู่ระบบใหม่", username, step: "password" };
  if (r.reason === "2fa") return { username, step: "2fa" };
  const left = r.triesLeft > 0 ? ` — เหลืออีก ${r.triesLeft} ครั้งก่อนถูกล็อกชั่วคราว 15 นาที` : "";
  return step === "2fa"
    ? { error: `รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว${left}`, username, step }
    : { error: `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง${left}`, username, step };
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").slice(0, 60);
  if (formData.get("step") === "2fa") {
    if (formData.get("cancel") === "1") {
      await cancelTwoFactor();
      return { username, step: "password" };
    }
    const code = String(formData.get("code") ?? "");
    if (!code.trim()) return { error: "กรอกรหัส 6 หลักจากแอป หรือรหัสสำรอง", username, step: "2fa" };
    const r = await verifyTwoFactor(code);
    if (!r.ok) return failState(r, username, "2fa");
    redirect(r.backupLeft !== undefined ? `/admin/account?backup=${r.backupLeft}` : "/admin");
  }
  const password = String(formData.get("password") ?? "");
  if (!username.trim() || !password) return { error: "กรอกชื่อผู้ใช้และรหัสผ่าน", username };
  const r = await login(username, password.slice(0, 200));
  if (r.ok) redirect("/admin");
  return failState(r, username, "password");
}

export async function logoutAction(formData: FormData) {
  await logout(formData.get("reason") === "idle" ? "idle" : "manual");
  redirect(formData.get("reason") === "idle" ? "/admin/login?idle=1" : "/admin/login");
}
