// /track/receipt/:id?t=<token> — ใบเสร็จรับเงินฝั่งลูกค้า (หน้าพิมพ์ A4 เดียวกับหลังบ้าน)
// ไม่มีโทเคน / โทเคนผิด / ฉบับร่าง = 404 · โทเคนสร้างจากหน้าติดตามคำสั่งซื้อหลังยืนยันเบอร์โทร (src/lib/public-docs.ts)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { toView } from "@/lib/docs";
import { getPublicReceipt } from "@/lib/public-docs";
import { getSettings } from "@/lib/settings";
import { CustomerDoc } from "./CustomerDoc";

export const instant = false;

const tokenOf = (sp: Record<string, string | string[] | undefined>) => (typeof sp.t === "string" ? sp.t : undefined);

export async function generateMetadata({ params, searchParams }: PageProps<"/track/receipt/[id]">): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await getPublicReceipt(id, tokenOf(sp));
  return { title: { absolute: d?.docNo ?? "ไม่พบเอกสาร" }, robots: { index: false, follow: false } };
}

export default async function CustomerReceiptPage({ params, searchParams }: PageProps<"/track/receipt/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await getPublicReceipt(id, tokenOf(sp));
  if (!d) notFound();
  const view = await toView(d, await getSettings());
  return <CustomerDoc view={view} voided={d.status === "VOID"} />;
}
