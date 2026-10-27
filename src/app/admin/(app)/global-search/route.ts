// GET /admin/global-search?q= — ค้นหาทั้งระบบ (กล่อง Ctrl+K) · ตามสิทธิ์ผู้ใช้ · ตอบ JSON
import { routeAdmin } from "@/lib/auth";
import { globalSearch } from "@/lib/global-search";

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ q, hits: await globalSearch(q, admin) }, { headers: { "Cache-Control": "no-store" } });
}
