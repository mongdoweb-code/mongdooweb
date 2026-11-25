// /admin/expenses/new และ /admin/expenses/:id — บันทึก/แก้ไขค่าใช้จ่าย
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ymdBkk } from "@/lib/doc-calc";
import { todayYmd } from "@/lib/docs";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { deleteExpense } from "../actions";
import { ExpenseForm, type ExpenseValues } from "../ExpenseForm";
import "../expenses.css";

export const instant = false;
const b = (s: number) => (s ? (s / 100).toFixed(2) : "");

export default async function ExpensePage({ params }: PageProps<"/admin/expenses/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const e = id === "new" ? null : await prisma.expense.findUnique({ where: { id: id.slice(0, 40) } });
  if (id !== "new" && !e) notFound();
  const [s, payees] = await Promise.all([
    getSettings(),
    prisma.expense.findMany({ where: { payee: { not: null } }, distinct: ["payee"], orderBy: { date: "desc" }, take: 100, select: { payee: true } }),
  ]);
  const v: ExpenseValues = {
    id: e?.id ?? "", date: e ? ymdBkk(e.date) : todayYmd(), category: e?.category ?? "", description: e?.description ?? "", payee: e?.payee ?? "",
    amount: b(e?.amountSatang ?? 0), vat: b(e?.vatSatang ?? 0), wht: b(e?.whtSatang ?? 0), method: e?.method ?? "", reference: e?.reference ?? "", note: e?.note ?? "",
    fileUrl: e?.fileKey ? `/admin/expenses/${e.id}/file` : null, fileIsPdf: !!e?.fileKey?.endsWith(".pdf"),
  };
  return (
    <main className="main" id="page-expense">
      <div className="page-head">
        <div>
          <p><Link className="link back-btn" href={`/admin/expenses${e ? `?month=${ymdBkk(e.date).slice(0, 7)}` : ""}`}>← ค่าใช้จ่ายร้าน</Link></p>
          <h1>{e ? "แก้ไขค่าใช้จ่าย" : "บันทึกค่าใช้จ่าย"}</h1>
          <p>ใส่ยอดตามบิล แนบรูปใบเสร็จไว้เป็นหลักฐาน — ใช้คำนวณกำไรสุทธิในรายงานกำไร</p>
        </div>
        {e && admin.role === "OWNER" && (
          <div className="head-actions">
            <form action={deleteExpense}>
              <input type="hidden" name="id" value={e.id} />
              <ConfirmSubmit className="btn btn-ghost xp-del" title="ลบค่าใช้จ่ายนี้?" body="ลบรายการและหลักฐาน (กู้คืนไม่ได้)" confirmLabel="ลบ">ลบรายการ</ConfirmSubmit>
            </form>
          </div>
        )}
      </div>
      <div className="box xp-box"><ExpenseForm v={v} today={todayYmd()} vatRegistered={s.vatEnabled} payees={payees.map((p) => p.payee!).filter(Boolean)} /></div>
    </main>
  );
}
