// /admin/login — ล็อกอินอยู่แล้วให้ไปหน้าคำสั่งซื้อเลย
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await getCurrentAdmin()) redirect("/admin");
  const idle = (await searchParams).idle === "1";
  return (
    <div className="login">
      <LoginForm idle={idle} />
    </div>
  );
}
