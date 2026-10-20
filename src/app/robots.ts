// /robots.txt — ให้ค้นหาได้เฉพาะหน้าร้าน (ไม่ให้เก็บหลังบ้าน, API, ตะกร้า/ชำระเงิน, ผลค้นหา)
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/checkout", "/track", "/search", "/media/slips/"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
