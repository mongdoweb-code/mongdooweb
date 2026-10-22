// ลิงก์ "ประวัติของรายการนี้" (A29) → /admin/log กรองเฉพาะ entity นี้ — ใส่ในหน้าสินค้า/คำสั่งซื้อ/ลูกค้า/ใบสั่งซื้อ
import Link from "next/link";

export function HistoryLink({ entity, className = "link" }: { entity: string; className?: string }) {
  return (
    <Link className={className} href={`/admin/log?entity=${encodeURIComponent(entity)}`} data-history={entity}>
      ประวัติการแก้ไขของรายการนี้
    </Link>
  );
}
