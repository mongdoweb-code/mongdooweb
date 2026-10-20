// GET /api/health — ใช้ให้โฮสต์ (Railway) ตรวจว่าเว็บพร้อมรับคำสั่งซื้อ: ตอบ 200 เมื่อเชื่อมฐานข้อมูลได้, 503 เมื่อไม่ได้
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "database" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
