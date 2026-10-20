import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
