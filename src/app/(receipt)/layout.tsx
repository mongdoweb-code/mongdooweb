// หน้าเอกสารสำหรับลูกค้า (ใบเสร็จ A4) — ใช้ CSS แผ่นเอกสารชุดเดียวกับหน้าพิมพ์หลังบ้าน จึงแยกจากโครงหน้าร้าน
// (route group แยก: ไม่มีหัว/ท้ายเว็บ, พิมพ์/บันทึก PDF ได้เหมือนหลังบ้านทุกประการ)
import type { Metadata } from "next";
import "../admin/admin.css";

export const instant = false;

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function ReceiptLayout({ children }: LayoutProps<"/">) {
  return children;
}
