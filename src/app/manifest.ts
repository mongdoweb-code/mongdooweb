// /manifest.webmanifest — ติดตั้งเว็บเป็นแอปบนมือถือได้ (Add to Home Screen) ไอคอนสร้างจากโลโก้ร้าน (scripts/make-icons.ts)
import type { MetadataRoute } from "next";

/** สีหลักของร้าน (ปุ่มส้ม --c-orange ใน shop.css) */
export const THEME_COLOR = "#F26B38";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "มองดูเว็บ — ไฟ LED ใต้น้ำ สระว่ายน้ำ น้ำพุ และไฟสวน",
    short_name: "มองดูเว็บ",
    description: "ร้านมองดูเว็บ จำหน่ายไฟ LED ใต้น้ำ ไฟสระว่ายน้ำ ไฟส่องน้ำพุ ไฟสวน และไฟส่องอาคาร",
    lang: "th",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: THEME_COLOR,
    categories: ["shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "สินค้าทั้งหมด", url: "/products" },
      { name: "ติดตามคำสั่งซื้อ", url: "/track" },
    ],
  };
}
