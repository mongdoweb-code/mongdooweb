// /track/doc/:id?t=<token> — ใบเสนอราคา (ลูกค้ายืนยันออนไลน์ U25) / ใบแจ้งหนี้ (QR พร้อมเพย์ยอดคงค้าง + แนบสลิป U26)
// ไม่มีโทเคน / โทเคนผิด / ฉบับร่าง = 404 · ร้านสร้างลิงก์ได้จากหน้าเอกสารในหลังบ้าน
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { todayYmd, toView, ymdOf } from "@/lib/docs";
import { getPublicDoc } from "@/lib/public-docs";
import { getSettings } from "@/lib/settings";
import { DocOnlineView } from "./DocOnlineView";

export const instant = false;

const tokenOf = (sp: Record<string, string | string[] | undefined>) => (typeof sp.t === "string" ? sp.t : undefined);

export async function generateMetadata({ params, searchParams }: PageProps<"/track/doc/[id]">): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await getPublicDoc(id, tokenOf(sp));
  return { title: { absolute: d?.docNo ?? "ไม่พบเอกสาร" }, robots: { index: false, follow: false } };
}

export default async function PublicDocPage({ params, searchParams }: PageProps<"/track/doc/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const token = tokenOf(sp);
  const d = await getPublicDoc(id, token);
  if (!d || !token) notFound();
  const s = await getSettings();
  const view = await toView(d, s);
  const expired = d.type === "QUOTATION" && !!d.validUntil && ymdOf(d.validUntil) < todayYmd();
  return (
    <DocOnlineView
      view={view}
      id={d.id}
      token={token}
      type={d.type === "QUOTATION" ? "QUOTATION" : "INVOICE"}
      status={d.status}
      expired={expired}
      acceptedBy={d.acceptedBy}
      acceptedAt={d.acceptedAt?.toISOString() ?? null}
      grandSatang={d.grandSatang}
      outstandingSatang={Math.max(0, d.grandSatang - d.paidSatang)}
      paidSatang={d.paidSatang}
      qr={d.type === "INVOICE" ? view.qr : null}
      promptpayName={s.promptpayName}
      slips={d.slips.map((x) => ({ id: x.id, amountSatang: x.amountSatang, at: x.createdAt.toISOString(), status: x.status, rejectReason: x.rejectReason }))}
    />
  );
}
