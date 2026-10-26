// - หลังบ้าน: ไม่มี cookie session เลย → ส่งไปหน้าเข้าสู่ระบบทันที (HTTP 307)
//   การตรวจ session จริง (หมดอายุ/ถูกลบ) ทำใน requireAdmin() ของทุกหน้าและทุก action
// - URL สินค้าเดิมของเว็บ WooCommerce (มีภาษาไทยใน path) → ส่งต่อให้ /api/legacy-product ตอบ 301
// - /track/receipt/:id ไม่มีโทเคน ?t= ที่ถูกรูปแบบ → 404
// - /category/<slug> ที่ไม่ใช่หมวดที่เปิดอยู่ (หมวดบทความ WordPress เดิม) → 301 (src/lib/legacy-category.ts)
// - /product/<slug> /blog/<slug> /projects/<slug> ที่ไม่มี/ปิดอยู่, /faq ที่ไม่มีเนื้อหา → 404 จริง (หน้า "ไม่พบหน้า" ของหน้าร้าน)
//   แทน soft 404 และ /track/receipt/:id ที่โทเคนไม่ตรง → 404 (src/lib/route-checks.ts)
// - ตาราง Redirect (หลังบ้าน /admin/redirects + เปลี่ยน slug อัตโนมัติ) → 301 พร้อมนับครั้ง (หลังตอบแล้ว ไม่ขวางคำขอ)
//   หน้าสินค้า/หมวด/บทความ/ผลงานที่ยังมีอยู่จริงไม่ถูก redirect ทับ · ตาราง redirect อยู่ในหน่วยความจำ (src/lib/redirects.ts)
// - URL บทความเดิมของ WordPress (Post.legacyPath เช่น /2019/05/ชื่อบทความ/) → /blog/<slug>
// - ทุกหน้าหน้าร้านได้ header x-mdw-path (path จริงที่ลูกค้าเรียก) → หน้า "ไม่พบหน้า" ใช้บันทึก 404 (NotFoundLog)
// ไฟล์ static (/_next, /js, /img, รูป, CSS) และ /api, /media ไม่ผ่าน proxy นี้เลย (ดู matcher)
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { categoryRedirect } from "@/lib/legacy-category";
import { countRedirectHit, findLegacyPost, findRedirect } from "@/lib/redirects";
import { checkPost, checkProduct, checkProject, faqEmpty, receiptTokenOk, type RouteCheck } from "@/lib/route-checks";

// path ที่ไม่มีหน้าอยู่จริง → catch-all (shop)/[...missing] ตอบหน้า "ไม่พบหน้า" พร้อมโครงหน้าร้านและสถานะ 404
const SHOP_404_PATH = "/_mdw/not-found";
const PATH_HEADER = "x-mdw-path";

/** ส่งต่อคำขอตามปกติ พร้อมบอก path จริงให้หน้า "ไม่พบหน้า" (เขียนทับค่าที่ลูกค้าส่งมาเองเสมอ) */
function pass(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, encodeURIComponent(req.nextUrl.pathname.slice(0, 400)));
  return NextResponse.next({ request: { headers } });
}
function shop404(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = SHOP_404_PATH;
  url.search = "";
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, encodeURIComponent(req.nextUrl.pathname.slice(0, 400)));
  return NextResponse.rewrite(url, { request: { headers }, headers: { "X-Robots-Tag": "noindex" } });
}
const receipt404 = () => new NextResponse(RECEIPT_404, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" } });
const moved = (req: NextRequest, to: string) => NextResponse.redirect(new URL(to, req.url), 301);

// หน้า 404 แบบเรียบง่าย (ตอบจาก proxy ได้ทันที ไม่ต้อง render แอป) — ไม่บอกว่าเอกสารมีอยู่จริงหรือไม่
const RECEIPT_404 = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ไม่พบเอกสาร — มองดูเว็บ</title></head>
<body style="margin:0;background:#f7f5f1;font-family:system-ui,'Noto Sans Thai',sans-serif;color:#161616"><main style="display:grid;place-items:center;min-height:100vh;padding:16px">
<div data-testid="receipt-404" style="background:#fff;padding:36px 28px;max-width:520px;text-align:center"><p style="font-size:13px;color:#77726a;letter-spacing:1px">404</p>
<h1 style="font-size:22px;margin:6px 0 10px">ไม่พบเอกสาร หรือลิงก์ไม่ถูกต้อง</h1><p style="color:#77726a;margin-bottom:20px">เปิดใบเสร็จได้จากหน้าติดตามคำสั่งซื้อ โดยกรอกเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่งซื้อ</p>
<a href="/track" style="display:inline-block;background:#F26B38;color:#fff;padding:12px 22px;text-decoration:none;font-weight:600">ไปหน้าติดตามคำสั่งซื้อ</a></div></main></body></html>`;

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** redirect จากตาราง (ถ้ามี) — นับครั้งหลังตอบ */
async function tableRedirect(req: NextRequest, event: NextFetchEvent) {
  const r = await findRedirect(req.nextUrl.pathname);
  if (!r) return null;
  event.waitUntil(countRedirectHit(r.id));
  return moved(req, r.to);
}

/** หน้ารายละเอียดที่ตรวจกับฐานข้อมูลแล้ว: ok = แสดงหน้า · ไม่มี = redirect จากตาราง (เช่น slug เดิม) หรือ 404 จริง */
async function detail(req: NextRequest, event: NextFetchEvent, r: RouteCheck) {
  if (r.kind === "redirect") return moved(req, r.to);
  if (r.kind === "missing") return (await tableRedirect(req, event)) ?? shop404(req);
  return pass(req);
}

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname.startsWith("/admin/login")) return;
    return req.cookies.has("mdw_admin") ? undefined : NextResponse.redirect(new URL("/admin/login", req.url));
  }
  // POST ของ server action / ฟอร์ม → ไม่ต้อง redirect หรือตรวจหน้า
  if (req.method !== "GET" && req.method !== "HEAD") return pass(req);

  // หมวด/บทความเดิมของ WordPress (/category/...) ที่ไม่ใช่หมวดที่เปิดอยู่ → redirect ในตาราง (slug หมวดที่เปลี่ยน)
  // หรือ 301 ไปหมวดใหม่ / สินค้าทั้งหมด
  if (pathname.startsWith("/category/")) {
    const slug = decode(pathname.slice("/category/".length).split("/")[0]);
    const to = slug ? await categoryRedirect(slug) : "/products";
    if (!to) return pass(req);
    return (await tableRedirect(req, event)) ?? moved(req, to);
  }
  // ใบเสร็จฝั่งลูกค้า: ไม่มีโทเคนหรือรูปแบบผิด → 404 จริง (ตรวจโทเคนกับฐานข้อมูลอีกครั้งในหน้าเพจ)
  if (pathname.startsWith("/track/receipt/")) {
    const t = req.nextUrl.searchParams.get("t") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(t)) return receipt404();
    const id = decode(pathname.slice("/track/receipt/".length).replace(/\/+$/, ""));
    return (await receiptTokenOk(id, t)) ? undefined : receipt404();
  }
  if (pathname === "/faq" || pathname === "/faq/") {
    return (await faqEmpty()) ? shop404(req) : pass(req);
  }
  if (pathname.startsWith("/product/")) {
    const slug = decode(pathname.slice("/product/".length).replace(/\/+$/, ""));
    // slug ใหม่เป็น a-z 0-9 - เท่านั้น; มีอักษรอื่น (เช่นภาษาไทย) = URL เดิม (ตาราง redirect ก่อน แล้วค่อยค้น legacyPath)
    if (/[^\x00-\x7F]/.test(slug)) {
      const r = await tableRedirect(req, event);
      if (r) return r;
      const url = req.nextUrl.clone();
      url.pathname = "/api/legacy-product";
      url.search = "";
      const headers = new Headers(req.headers);
      headers.set("x-legacy-path", encodeURIComponent(`/product/${slug}`));
      return NextResponse.rewrite(url, { request: { headers } });
    }
    return detail(req, event, await checkProduct(slug));
  }
  if (pathname.startsWith("/blog/") && !pathname.startsWith("/blog/rss")) {
    const slug = decode(pathname.slice("/blog/".length).replace(/\/+$/, ""));
    return detail(req, event, await checkPost(slug));
  }
  if (pathname.startsWith("/projects/")) {
    const slug = decode(pathname.slice("/projects/".length).replace(/\/+$/, ""));
    return detail(req, event, await checkProject(slug));
  }

  const r = await tableRedirect(req, event);
  if (r) return r;
  // บทความเดิมของ WordPress (permalink /ชื่อบทความ/ หรือ /ปี/เดือน/ชื่อบทความ/)
  const post = await findLegacyPost(pathname);
  if (post) return moved(req, post);
  // คลังบทความรายปี/เดือนของ WordPress ที่ไม่มีบทความตรง → หน้าแรก (เหมือนเดิม)
  if (/^\/\d{4}(\/|$)/.test(pathname)) return moved(req, "/");
  return pass(req);
}

export const config = {
  // ทุกหน้า ยกเว้นไฟล์ static/รูป/สคริปต์, API, รูปที่อัปโหลด — ไม่มีการถามฐานข้อมูลสำหรับไฟล์เหล่านี้เลย
  matcher: [
    "/((?!_next/|api/|media/|js/|img/|icons/|favicon\\.ico|sw\\.js|offline\\.html|.*\\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|txt|xml|webmanifest|json|glb|pdf)$).*)",
  ],
};
