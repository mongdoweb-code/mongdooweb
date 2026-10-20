// - หลังบ้าน: ไม่มี cookie session เลย → ส่งไปหน้าเข้าสู่ระบบทันที (HTTP 307)
//   การตรวจ session จริง (หมดอายุ/ถูกลบ) ทำใน requireAdmin() ของทุกหน้าและทุก action
// - URL สินค้าเดิมของเว็บ WooCommerce (มีภาษาไทยใน path) → ส่งต่อให้ /api/legacy-product ตอบ 301
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/product/")) {
    const raw = pathname.slice("/product/".length).replace(/\/+$/, "");
    let slug = raw;
    try {
      slug = decodeURIComponent(raw);
    } catch {}
    // slug ใหม่เป็น a-z 0-9 - เท่านั้น; มีอักษรอื่น (เช่นภาษาไทย) = URL เดิม
    if (/[^\x00-\x7F]/.test(slug)) {
      const url = req.nextUrl.clone();
      url.pathname = "/api/legacy-product";
      url.search = "";
      const headers = new Headers(req.headers);
      headers.set("x-legacy-path", encodeURIComponent(`/product/${slug}`));
      return NextResponse.rewrite(url, { request: { headers } });
    }
    return;
  }
  if (!req.cookies.has("mdw_admin")) return NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = {
  matcher: ["/admin", "/admin/((?!login).*)", "/product/:path*"],
};
