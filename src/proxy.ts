// ด่านแรกของหลังบ้าน: ไม่มี cookie session เลย → ส่งไปหน้าเข้าสู่ระบบทันที (HTTP 307)
// การตรวจ session จริง (หมดอายุ/ถูกลบ) ทำใน requireAdmin() ของทุกหน้าและทุก action
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  if (!req.cookies.has("mdw_admin")) return NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = {
  matcher: ["/admin", "/admin/((?!login).*)"],
};
