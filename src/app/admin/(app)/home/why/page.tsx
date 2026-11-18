// /admin/home/why — แก้ส่วน "ทำไมต้องมองดูเว็บ" บนหน้าแรก: หัวข้อ · จุดเด่น 1–6 ข้อ · รูปกล่องซ้าย (อัปโหลด/ผลงานล่าสุด/ไม่ใช้รูป) · คำบรรยาย · ลิงก์
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getProjects } from "@/lib/blog";
import { parseHomeSections } from "@/lib/home";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { parseWhyUs } from "@/lib/why-us";
import { saveWhyUs } from "../actions";
import { WhyEditor } from "./WhyEditor";
import "../../_lot10/lot10.css";
import "./why.css";

export const instant = false;

export default async function WhyAdminPage() {
  await requireAdmin();
  const [s, projects] = await Promise.all([
    prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { whyUs: true, homeSections: true } }),
    getProjects(),
  ]);
  const raw = s?.whyUs;
  const cfg = parseWhyUs(raw);
  const custom = !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length > 0;
  const section = parseHomeSections(s?.homeSections).find((x) => x.key === "why");
  // ผลงานที่โหมด "ผลงานล่าสุด" จะใช้ (ตัวแรกที่มีรูป)
  const p = projects.find((x) => x.cover);
  const project = p ? { title: p.title, sub: [p.kind, p.location].filter(Boolean).join(" · ") || "ผลงานติดตั้งจากลูกค้า", img: p.cover!.sm } : null;

  return (
    <main className="main" id="page-why">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/home">← หน้าแรกและความน่าเชื่อถือ</Link></p>
          <h1>ทำไมต้องมองดูเว็บ (หน้าแรก)</h1>
          <p>แก้หัวข้อ จุดเด่นของร้าน (1–6 ข้อ) รูปกล่องซ้าย คำบรรยายบนรูป และลิงก์ — ดูผลได้ทันทีในตัวอย่าง</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/#why" target="_blank" rel="noopener">ดูบนหน้าแรก</a>
        </div>
      </div>
      {section && !section.show && (
        <div className="l10-err" role="status" style={{ marginBottom: 12 }}>
          ส่วนนี้ถูกซ่อนอยู่ในหน้าแรก — เปิดได้ที่ <Link className="link" href="/admin/home">ลำดับส่วนของหน้าแรก</Link>
        </div>
      )}
      <WhyEditor initial={cfg} imageUrl={cfg.imageKey ? mediaUrl(cfg.imageKey, "sm") : null} project={project} custom={custom} action={saveWhyUs} />
    </main>
  );
}
