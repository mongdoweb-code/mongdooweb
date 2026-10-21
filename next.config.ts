import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // อัปโหลดรูปสินค้า/สไลด์/โลโก้จากหลังบ้าน (หลายรูปต่อครั้ง รูปละไม่เกิน 10 MB)
    serverActions: { bodySizeLimit: "40mb" },
    proxyClientMaxBodySize: "40mb",
  },
  // header ความปลอดภัยพื้นฐานทุกหน้า: กันฝังเว็บในเฟรม (clickjacking), กันเดาชนิดไฟล์, บังคับ https, จำกัดสิทธิ์อุปกรณ์
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [
      { source: "/:path*", headers: common },
      // หลังบ้าน/หน้าพิมพ์: ห้ามเก็บแคชและห้ามค้นหา
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
  // URL เดิมของเว็บ WooCommerce ที่ไม่ได้ผูกกับสินค้า/หมวด (สินค้า/หมวดจัดการใน route ของตัวเอง)
  async redirects() {
    return [
      { source: "/shop", destination: "/products", permanent: true },
      { source: "/shop/:path*", destination: "/products", permanent: true },
      { source: "/cart", destination: "/#cart", permanent: false },
      { source: "/checkout/:path+", destination: "/checkout", permanent: false },
      { source: "/my-account/:path*", destination: "/track", permanent: false },
      // ---- URL เดิมของ WordPress ที่เหลือ → หน้าที่ใกล้ที่สุด (301 ไม่ใช่ 404) ----
      // "/?p=", "/?product=", "/?s=", "/?product_cat=" ... → /api/legacy-wp ค้นจากฐานข้อมูลแล้วส่งต่ออีกทอด
      ...["p", "page_id", "attachment_id", "product", "product_cat", "product_tag", "tag", "cat", "s", "post_type", "add-to-cart"].map(
        (key) => ({ source: "/", has: [{ type: "query" as const, key }], destination: "/api/legacy-wp", statusCode: 301 as const }),
      ),
      // แท็กบทความ/สินค้า → ค้นหาด้วยชื่อแท็ก
      { source: "/tag/:tag/:rest*", destination: "/search?q=:tag", statusCode: 301 },
      { source: "/product-tag/:tag/:rest*", destination: "/search?q=:tag", statusCode: 301 },
      // หน้าแบ่งหน้าของบล็อก/หน้าแรก, ผู้เขียน, คลังรายเดือน
      { source: "/page/:n*", destination: "/", statusCode: 301 },
      { source: "/author/:path*", destination: "/", statusCode: 301 },
      { source: "/:year(\\d{4})/:path*", destination: "/", statusCode: 301 },
      // หมวดบทความแบบซ้อน/แบ่งหน้า → หน้าหมวด (หน้าหมวดส่งต่อหมวดเดิมที่ไม่มีแล้วเอง)
      { source: "/category/:slug/:rest+", destination: "/category/:slug", statusCode: 301 },
      // RSS feed
      { source: "/feed/:path*", destination: "/", statusCode: 301 },
      { source: "/comments/feed/:path*", destination: "/", statusCode: 301 },
      { source: "/product/:slug/feed/:path*", destination: "/product/:slug", statusCode: 301 },
      { source: "/category/:slug/feed/:path*", destination: "/category/:slug", statusCode: 301 },
      // ไฟล์/ระบบของ WordPress
      { source: "/wp-admin/:path*", destination: "/admin/login", statusCode: 301 },
      { source: "/wp-login.php", destination: "/admin/login", statusCode: 301 },
      { source: "/wp-sitemap:rest(.*)", destination: "/sitemap.xml", statusCode: 301 },
      { source: "/sitemap_index.xml", destination: "/sitemap.xml", statusCode: 301 },
      { source: "/xmlrpc.php", destination: "/", statusCode: 301 },
      { source: "/:dir(wp-[^/]+)/:path*", destination: "/", statusCode: 301 },
    ];
  },
};

export default nextConfig;
