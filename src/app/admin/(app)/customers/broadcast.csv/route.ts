// GET /admin/customers/broadcast.csv — รายชื่อสำหรับส่งข่าว/โปรโมชัน (บรอดแคสต์) ตามกลุ่มที่กรองไว้ (A23)
// เฉพาะคอลัมน์ที่ใช้ติดต่อ: ชื่อ เบอร์ (ทั้งแบบไทยและ +66 สำหรับระบบส่ง SMS) อีเมล แท็ก ยอดซื้อ ซื้อล่าสุด — ข้ามรายที่ไม่มีทั้งเบอร์และอีเมล
// หมายเหตุ PDPA: ใช้ส่งข่าวสารได้เฉพาะลูกค้าที่ยินยอม/มีความสัมพันธ์ทางการค้า — ผู้ที่ขอคัดค้าน (คำขอ PDPA) ถูกลบเบอร์/อีเมลออกแล้ว
import { routeAdmin } from "@/lib/auth";
import { fileResponse, csvTime, satangToBaht, toCsv } from "@/lib/csv";
import { parseSegment, segmentCustomers } from "@/lib/customer-segments";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const intl = (p: string) => (/^0\d{8,9}$/.test(p) ? `+66${p.slice(1)}` : p);

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const f = parseSegment(Object.fromEntries(new URL(req.url).searchParams));
  const rows = (await segmentCustomers(f)).filter((c) => c.phone || c.email);
  const head = ["ชื่อ", "ผู้ติดต่อ", "เบอร์โทร", "เบอร์โทร (สากล)", "อีเมล", "แท็ก", "ยอดซื้อรวม (บาท)", "ซื้อล่าสุด", "รหัสลูกค้า"];
  const body = rows.map((c) => [c.name, c.contactName, c.phone ? formatPhone(c.phone) : "", c.phone ? intl(c.phone) : "", c.email, c.tags.join(", "), satangToBaht(c.stats.spendSatang), csvTime(c.stats.lastAt), c.code]);
  const desc = [f.tag && `แท็ก ${f.tag}`, f.minSpend && `ยอด ≥ ${f.minSpend}`, f.maxSpend && `ยอด ≤ ${f.maxSpend}`, f.lastFrom && `ซื้อล่าสุดตั้งแต่ ${f.lastFrom}`, f.lastTo && `ถึง ${f.lastTo}`, f.taxId && `เลขผู้เสียภาษี: ${f.taxId === "yes" ? "มี" : "ไม่มี"}`].filter(Boolean).join(", ");
  await prisma.adminLog.create({ data: { type: "CUSTOMER_EXPORT", note: `ส่งออกรายชื่อสำหรับบรอดแคสต์ ${rows.length} ราย${desc ? ` (${desc})` : ""}`, adminId: admin.id } });
  return fileResponse(toCsv(head, body), `broadcast-${new Date().toISOString().slice(0, 10)}.csv`);
}
