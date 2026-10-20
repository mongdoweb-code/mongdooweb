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
    ];
  },
};

export default nextConfig;
