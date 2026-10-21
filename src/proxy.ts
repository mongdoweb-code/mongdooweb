// - หลังบ้าน: ไม่มี cookie session เลย → ส่งไปหน้าเข้าสู่ระบบทันที (HTTP 307)
//   การตรวจ session จริง (หมดอายุ/ถูกลบ) ทำใน requireAdmin() ของทุกหน้าและทุก action
// - URL สินค้าเดิมของเว็บ WooCommerce (มีภาษาไทยใน path) → ส่งต่อให้ /api/legacy-product ตอบ 301
// - /track/receipt/:id ไม่มีโทเคน ?t= ที่ถูกรูปแบบ → 404
// - /category/<slug> ที่ไม่ใช่หมวดที่เปิดอยู่ (หมวดบทความ WordPress เดิม) → 301 (src/lib/legacy-category.ts)
import { NextResponse, type NextRequest } from "next/server";
import { categoryRedirect } from "@/lib/legacy-category";

// หน้า 404 แบบเรียบง่าย (ตอบจาก proxy ได้ทันที ไม่ต้อง render แอป) — ไม่บอกว่าเอกสารมีอยู่จริงหรือไม่
const RECEIPT_404 = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ไม่พบเอกสาร — มองดูเว็บ</title></head>
<body style="margin:0;background:#f7f5f1;font-family:system-ui,'Noto Sans Thai',sans-serif;color:#161616"><main style="display:grid;place-items:center;min-height:100vh;padding:16px">
<div data-testid="receipt-404" style="background:#fff;padding:36px 28px;max-width:520px;text-align:center"><p style="font-size:13px;color:#77726a;letter-spacing:1px">404</p>
<h1 style="font-size:22px;margin:6px 0 10px">ไม่พบเอกสาร หรือลิงก์ไม่ถูกต้อง</h1><p style="color:#77726a;margin-bottom:20px">เปิดใบเสร็จได้จากหน้าติดตามคำสั่งซื้อ โดยกรอกเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่งซื้อ</p>
<a href="/track" style="display:inline-block;background:#F26B38;color:#fff;padding:12px 22px;text-decoration:none;font-weight:600">ไปหน้าติดตามคำสั่งซื้อ</a></div></main></body></html>`;

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // หมวด/บทความเดิมของ WordPress (/category/...) ที่ไม่ใช่หมวดที่เปิดอยู่ → 301 ไปหมวดใหม่หรือสินค้าทั้งหมด
  if (pathname.startsWith("/category/")) {
    const raw = pathname.slice("/category/".length).split("/")[0];
    let slug = raw;
    try {
      slug = decodeURIComponent(raw);
    } catch {}
    const to = slug ? await categoryRedirect(slug) : "/products";
    return to ? NextResponse.redirect(new URL(to, req.url), 301) : undefined;
  }
  // ใบเสร็จฝั่งลูกค้า: ไม่มีโทเคนหรือรูปแบบผิด → 404 จริง (ตรวจโทเคนกับฐานข้อมูลอีกครั้งในหน้าเพจ)
  if (pathname.startsWith("/track/receipt/")) {
    const t = req.nextUrl.searchParams.get("t") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(t)) return new NextResponse(RECEIPT_404, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" } });
    return;
  }
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
  matcher: ["/admin", "/admin/((?!login).*)", "/product/:path*", "/category/:path*", "/track/receipt/:path*"],
};
