"use server";
// บันทึกเลขที่หนังสือรับรอง 50 ทวิ / ได้รับตัวจริงแล้ว (ยกเลิกได้)
import { refresh } from "next/cache";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { fromYmd } from "@/lib/doc-calc";
import { todayYmd } from "@/lib/docs";
import { prisma } from "@/lib/prisma";

export async function saveWhtCert(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id") ?? "").slice(0, 40);
  const certNo = String(f.get("certNo") ?? "").trim().slice(0, 60) || null;
  const received = f.get("received") === "1";
  const p = await prisma.docPayment.findUnique({ where: { id }, select: { whtSatang: true, whtCertNo: true, whtCertAt: true, invoice: { select: { docNo: true } } } });
  if (!p || p.whtSatang <= 0) return;
  const certAt = received ? (p.whtCertAt ?? fromYmd(todayYmd())) : null;
  await prisma.docPayment.update({ where: { id }, data: { whtCertNo: certNo, whtCertAt: certAt } });
  await logAdmin(admin.id, "DOC", `หนังสือรับรองหัก ณ ที่จ่าย ${p.invoice.docNo}: ${certNo ?? "ไม่มีเลขที่"} · ${received ? "ได้รับแล้ว" : "ยังไม่ได้รับ"}`, {
    diff: { whtCertNo: [p.whtCertNo, certNo], received: [!!p.whtCertAt, received] },
  });
  refresh();
}
