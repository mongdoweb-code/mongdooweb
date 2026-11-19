// GET /admin/expenses/export?month=YYYY-MM — ค่าใช้จ่ายรายเดือนเป็น CSV (ให้นักบัญชี)
import { logAdmin } from "@/lib/admin-log";
import { routeAdmin } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { docDate, fromYmd, ymdBkk } from "@/lib/doc-calc";
import { expenseCash, expenseCatLabel } from "@/lib/expense-rules";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const m = new URL(req.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : ymdBkk(new Date()).slice(0, 7);
  const [y, mo] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo, 1));
  const rows = await prisma.expense.findMany({
    where: { date: { gte: fromYmd(`${month}-01`), lt: fromYmd(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`) } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const b = (x: number) => (x / 100).toFixed(2);
  const t = rows.reduce((s, r) => ({ a: s.a + r.amountSatang, v: s.v + r.vatSatang, w: s.w + r.whtSatang }), { a: 0, v: 0, w: 0 });
  const out: unknown[][] = [
    ["ค่าใช้จ่ายร้าน", `${month.slice(5, 7)}/${y + 543}`],
    [],
    ["ลำดับ", "วันที่", "หมวด", "รายละเอียด", "จ่ายให้", "เลขที่บิล/อ้างอิง", "วิธีจ่าย", "ยอดรวมตามบิล", "ภาษีซื้อ", "ภาษีหัก ณ ที่จ่าย", "จ่ายจริง", "มีหลักฐาน", "หมายเหตุ"],
    ...rows.map((r, i) => [i + 1, docDate(ymdBkk(r.date), "BE"), expenseCatLabel(r.category), r.description, r.payee ?? "", r.reference ?? "", r.method, b(r.amountSatang), b(r.vatSatang), b(r.whtSatang), b(expenseCash(r)), r.fileKey ? "มี" : "ไม่มี", r.note ?? ""]),
    ["", "", "", "รวม", "", "", "", b(t.a), b(t.v), b(t.w), b(t.a - t.w), "", ""],
  ];
  await logAdmin(admin.id, "ORDERS_EXPORT", `ส่งออกค่าใช้จ่ายร้าน ${month} (${rows.length} รายการ)`);
  return csvResponse(`expenses-${month}.csv`, out);
}
