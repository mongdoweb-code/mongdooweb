// GET /admin/notifications/feed — รายการแจ้งเตือนล่าสุดสำหรับเมนูกระดิ่ง (10 รายการ) + จำนวนที่ยังไม่อ่าน
import { routeAdmin } from "@/lib/auth";
import { notificationFeed, unreadCount } from "@/lib/notifications";

export async function GET() {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const [{ items }, unread] = await Promise.all([notificationFeed(admin, 10), unreadCount(admin)]);
  return Response.json({ items, unread }, { headers: { "Cache-Control": "no-store" } });
}
