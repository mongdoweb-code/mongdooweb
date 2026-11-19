"use server";
// ค่าใช้จ่ายร้าน: เพิ่ม/แก้ไข (แอดมินทุกคน) · ลบ (เจ้าของร้าน) · ไฟล์หลักฐานส่วนตัว
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { fromYmd, money } from "@/lib/doc-calc";
import { todayYmd } from "@/lib/docs";
import { expenseCatLabel, parseExpense } from "@/lib/expense-rules";
import { ExpenseFileError, deleteExpenseFile, saveExpenseFile } from "@/lib/expenses";
import { diffOf } from "@/lib/log-diff";
import { prisma } from "@/lib/prisma";

export type ExpenseState = { ok?: string; error?: string; fields?: string[] };
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").slice(0, max);

export async function saveExpense(_prev: ExpenseState, f: FormData): Promise<ExpenseState> {
  const admin = await requireAdmin();
  const id = str(f, "id", 40).trim();
  const { errors, data } = parseExpense(
    {
      date: str(f, "date", 10), category: str(f, "category", 20), description: str(f, "description", 300), payee: str(f, "payee", 200),
      amount: str(f, "amount", 20), vat: str(f, "vat", 20), wht: str(f, "wht", 20), method: str(f, "method", 60), reference: str(f, "reference", 150), note: str(f, "note", 1200),
    },
    todayYmd(),
  );
  const fields = Object.keys(errors);
  if (fields.length) return { error: Object.values(errors).join(" · "), fields };
  const before = id ? await prisma.expense.findUnique({ where: { id } }) : null;
  if (id && !before) return { error: "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)" };

  // หลักฐาน: ไฟล์ใหม่แทนไฟล์เดิม · ติ๊ก "ลบหลักฐาน" = เอาออก
  const file = f.get("file");
  let fileKey = before?.fileKey ?? null;
  let oldToDelete: string | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      fileKey = await saveExpenseFile(file);
      oldToDelete = before?.fileKey ?? null;
    } catch (e) {
      if (e instanceof ExpenseFileError) return { error: e.message, fields: ["file"] };
      throw e;
    }
  } else if (f.get("removeFile") === "1") {
    oldToDelete = before?.fileKey ?? null;
    fileKey = null;
  }

  const row = { ...data, date: fromYmd(data.date), fileKey };
  const label = `${expenseCatLabel(data.category)} · ${data.description} ฿${money(data.amountSatang)}`;
  if (before) {
    await prisma.expense.update({ where: { id }, data: row });
    const diff = diffOf(before, row);
    if (diff) await logAdmin(admin.id, "EXPENSE", `แก้ไขค่าใช้จ่าย ${label}`, { entity: `Expense:${id}`, diff });
  } else {
    const e = await prisma.expense.create({ data: { ...row, createdById: admin.id } });
    await logAdmin(admin.id, "EXPENSE", `บันทึกค่าใช้จ่าย ${label}`, { entity: `Expense:${e.id}` });
  }
  await deleteExpenseFile(oldToDelete);
  if (!before) redirect(`/admin/expenses?month=${data.date.slice(0, 7)}&saved=1`);
  refresh();
  return { ok: "บันทึกค่าใช้จ่ายแล้ว" };
}

export async function deleteExpense(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  const e = await prisma.expense.findUnique({ where: { id } });
  if (!e) redirect("/admin/expenses");
  await prisma.expense.delete({ where: { id } });
  await deleteExpenseFile(e.fileKey);
  await logAdmin(admin.id, "EXPENSE", `ลบค่าใช้จ่าย ${expenseCatLabel(e.category)} · ${e.description} ฿${money(e.amountSatang)}`, { entity: `Expense:${id}` });
  const ym = e.date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7);
  redirect(`/admin/expenses?month=${ym}&deleted=1`);
}
