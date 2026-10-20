// /admin/slides/new และ /admin/slides/:id — แก้ไขสไลด์
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { SlideForm, type SlideValues } from "../SlideForm";

/** Date → ค่า datetime-local ตามเวลาไทย */
const local = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 16) : "");

export default async function SlideEditPage({ params, searchParams }: PageProps<"/admin/slides/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const categories = (await prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })).map((c) => ({ slug: c.slug, name: c.nameTh }));
  let v: SlideValues;
  if (id === "new") {
    v = { id: "", imageSrc: null, imageUrl: "", focalX: 50, focalY: 50, alt: "", eyebrow: "", title: "", subtitle: "", cta1Label: "ดูสินค้า", cta1Href: "#categories", cta2Label: "", cta2Href: "", align: "LEFT", overlay: 55, startAt: "", endAt: "", credit: "", isActive: true, hasUpload: false };
  } else {
    const s = await prisma.heroSlide.findUnique({ where: { id } });
    if (!s) notFound();
    v = {
      id: s.id, imageSrc: mediaUrl(s.imageKey) ?? s.imageUrl, imageUrl: s.imageUrl ?? "", focalX: s.focalX, focalY: s.focalY, alt: s.alt,
      eyebrow: s.eyebrow, title: s.title, subtitle: s.subtitle, cta1Label: s.cta1Label, cta1Href: s.cta1Href, cta2Label: s.cta2Label ?? "",
      cta2Href: s.cta2Href ?? "", align: s.align, overlay: s.overlay, startAt: local(s.startAt), endAt: local(s.endAt), credit: s.credit,
      isActive: s.isActive, hasUpload: !!s.imageKey,
    };
  }
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/slides">← สไลด์ทั้งหมด</Link></p>
          <h1>{v.id ? "แก้ไขสไลด์" : "เพิ่มสไลด์"}</h1>
        </div>
      </div>
      <SlideForm key={v.id || "new"} v={v} saved={(await searchParams).saved === "1"} categories={categories} />
    </main>
  );
}
