// /admin/login — ล็อกอินอยู่แล้วให้ไปหน้าคำสั่งซื้อเลย · มีขั้นตอนรอรหัส 2 ขั้นค้างอยู่ให้แสดงช่องกรอกรหัสต่อ
import { redirect } from "next/navigation";
import { getCurrentAdmin, pendingTwoFactor } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await getCurrentAdmin()) redirect("/admin");
  const idle = (await searchParams).idle === "1";
  const pending = await pendingTwoFactor();
  return (
    <div className="login">
      <LoginForm idle={idle} pending2fa={pending?.username} />
    </div>
  );
}
