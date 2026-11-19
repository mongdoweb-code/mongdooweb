// ค่าใช้จ่ายร้าน — ไฟล์หลักฐาน (ส่วนตัว) + สรุปตามช่วงเวลา (ใช้ในหน้าค่าใช้จ่ายและรายงานกำไร)
import "server-only";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { fromYmd } from "@/lib/doc-calc";
import { EXPENSE_FILE_MAX, EXPENSE_FILE_RE, expenseCost } from "@/lib/expense-rules";
import { prisma } from "@/lib/prisma";
import { sniffImage, storage } from "@/lib/storage";

export class ExpenseFileError extends Error {}

const isPdf = (b: Buffer) => b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";

/** เก็บหลักฐาน: รูป → webp (ย่อ ≤ 2000px, ลบข้อมูล EXIF) · PDF → เก็บตามเดิม · คืน key ใต้ expenses/ */
export async function saveExpenseFile(file: File): Promise<string> {
  if (file.size > EXPENSE_FILE_MAX) throw new ExpenseFileError("ไฟล์หลักฐานใหญ่เกิน 10 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const now = new Date();
  const base = `expenses/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
  if (isPdf(buf)) {
    await storage().put(`${base}.pdf`, buf);
    return `${base}.pdf`;
  }
  if (!sniffImage(buf)) throw new ExpenseFileError("หลักฐานต้องเป็นรูป (JPG, PNG, WEBP) หรือ PDF");
  let out: Buffer;
  try {
    out = await sharp(buf, { failOn: "error" }).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new ExpenseFileError("อ่านไฟล์รูปไม่ได้ (ไฟล์อาจเสีย)");
  }
  await storage().put(`${base}.webp`, out);
  return `${base}.webp`;
}

export async function deleteExpenseFile(key: string | null | undefined) {
  if (key && EXPENSE_FILE_RE.test(key)) await storage().delete(key).catch(() => {});
}

export type ExpenseSummary = { total: number; cost: number; vat: number; wht: number; count: number; byCat: Map<string, { amount: number; count: number }> };

/** สรุปค่าใช้จ่ายช่วง [from, to] (YYYY-MM-DD รวมทั้งสองวัน) */
export async function expenseSummary(from: string, to: string, vatRegistered: boolean): Promise<ExpenseSummary> {
  const end = new Date(fromYmd(to).getTime() + 864e5);
  const rows = await prisma.expense.findMany({ where: { date: { gte: fromYmd(from), lt: end } }, select: { category: true, amountSatang: true, vatSatang: true, whtSatang: true } });
  const byCat = new Map<string, { amount: number; count: number }>();
  const s: ExpenseSummary = { total: 0, cost: 0, vat: 0, wht: 0, count: rows.length, byCat };
  for (const r of rows) {
    s.total += r.amountSatang;
    s.cost += expenseCost(r, vatRegistered);
    s.vat += r.vatSatang;
    s.wht += r.whtSatang;
    const c = byCat.get(r.category) ?? { amount: 0, count: 0 };
    c.amount += expenseCost(r, vatRegistered);
    c.count++;
    byCat.set(r.category, c);
  }
  return s;
}
