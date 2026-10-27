// GET /admin/notifications/count — จำนวนแจ้งเตือนที่ยังไม่อ่าน (กระดิ่งเรียกทุก 60 วินาที) — ตอบแค่ตัวเลข ไม่แคช
import { routeAdmin } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";

export async function GET() {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  return Response.json({ unread: await unreadCount(admin) }, { headers: { "Cache-Control": "no-store" } });
}
