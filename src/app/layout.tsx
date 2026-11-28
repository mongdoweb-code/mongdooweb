import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  // ใช้สร้าง URL เต็มของรูปแชร์ (Open Graph) — ตั้ง SITE_URL ใน .env ตอนขึ้นระบบจริง
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "มองดูเว็บ — ไฟ LED ใต้น้ำ สระว่ายน้ำ น้ำพุ และไฟสวน",
  description: "ร้านมองดูเว็บ จำหน่ายไฟ LED ใต้น้ำ ไฟสระว่ายน้ำ ไฟส่องน้ำพุ ไฟสวน และไฟส่องอาคาร",
  // ยืนยันความเป็นเจ้าของเว็บใน Google Search Console (เมตาแท็ก) — อย่าลบแม้ยืนยันแล้ว Google ตรวจซ้ำเป็นระยะ
  // (มีไฟล์ public/google3c2b8063026d3ce6.html เป็นวิธีสำรองด้วย)
  verification: { google: "_2vLXq2W9IbdfK94QOhegMuMjtqT15kzfP0Y5kzSYSs" },
};

// สีแถบเบราว์เซอร์บนมือถือ = สีหลักของร้าน (เหมือน theme_color ใน manifest.ts)
export const viewport: Viewport = { themeColor: "#F26B38" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={notoSansThai.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
