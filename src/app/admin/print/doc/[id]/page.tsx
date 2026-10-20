// /admin/print/doc/:id — เอกสาร A4 พร้อมพิมพ์ (?auto=1 เปิดหน้าต่างพิมพ์ทันที, ?both=1 ต้นฉบับ + สำเนา)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { DOC_INCLUDE, docPath, toView } from "@/lib/docs";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { PrintDoc } from "../../PrintClient";

/** ชื่อหน้า = เลขที่เอกสาร → "บันทึกเป็น PDF" ได้ไฟล์ชื่อ QT2610-00001.pdf */
export async function generateMetadata({ params }: PageProps<"/admin/print/doc/[id]">): Promise<Metadata> {
  await requireAdmin();
  const { id } = await params;
  const d = await prisma.salesDocument.findUnique({ where: { id }, select: { docNo: true, type: true } });
  return { title: { absolute: d ? d.docNo ?? `ฉบับร่าง-${d.type}` : "เอกสาร" } };
}

export default async function PrintDocPage({ params, searchParams }: PageProps<"/admin/print/doc/[id]">) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await prisma.salesDocument.findUnique({ where: { id }, include: DOC_INCLUDE });
  if (!d) notFound();
  const view = await toView(d, await getSettings());
  return <PrintDoc view={view} id={d.id} back={docPath(d)} auto={sp.auto === "1"} both={sp.both === "1"} />;
}
