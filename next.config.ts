import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // อัปโหลดรูปสินค้า/สไลด์/โลโก้จากหลังบ้าน (หลายรูปต่อครั้ง รูปละไม่เกิน 10 MB)
    serverActions: { bodySizeLimit: "40mb" },
    proxyClientMaxBodySize: "40mb",
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
