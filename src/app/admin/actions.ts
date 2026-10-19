"use server";
// เข้าสู่ระบบ / ออกจากระบบ หลังบ้าน
import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";

export type LoginState = { error?: string; locked?: string; username?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!username.trim() || !password) return { error: "กรอกชื่อผู้ใช้และรหัสผ่าน", username };
  const r = await login(username, password.slice(0, 200));
  if (r.ok) redirect("/admin");
  if (r.reason === "locked") {
    const t = r.until.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
    return { locked: `ใส่รหัสผ่านผิดหลายครั้ง ลองใหม่ได้หลังเวลา ${t} น.`, username };
  }
  return {
    error: `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง${r.triesLeft > 0 ? ` — เหลืออีก ${r.triesLeft} ครั้งก่อนถูกล็อกชั่วคราว 15 นาที` : ""}`,
    username,
  };
}

export async function logoutAction(formData: FormData) {
  await logout(formData.get("reason") === "idle" ? "idle" : "manual");
  redirect(formData.get("reason") === "idle" ? "/admin/login?idle=1" : "/admin/login");
}
