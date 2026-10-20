// URL ที่ไม่มีอยู่จริง → แสดงหน้า "ไม่พบหน้า" ในโครงหน้าร้าน (มีเมนู/ค้นหา/ตะกร้า) พร้อมสถานะ 404
import { notFound } from "next/navigation";

export const instant = false;

export default function Missing() {
  notFound();
}
