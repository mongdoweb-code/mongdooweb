// /admin/slides — สไลด์หน้าแรก: ลำดับ, แสดง/ซ่อน, ตารางเวลา, คัดลอก, ลบ, ย้อนกลับเวอร์ชัน
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listVersions } from "@/lib/content-version";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { deleteSlide, duplicateSlide, moveSlide, rollbackSlides, toggleSlide } from "./actions";

const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const ERR: Record<string, string> = { last: "ต้องมีสไลด์ที่แสดงอย่างน้อย 1 สไลด์", max: "มีสไลด์ครบ 8 สไลด์แล้ว" };

export default async function SlidesPage({ searchParams }: PageProps<"/admin/slides">) {
  const owner = (await requireAdmin()).role === "OWNER";
  const sp = await searchParams;
  const [slides, versions] = await Promise.all([prisma.heroSlide.findMany({ orderBy: { sortOrder: "asc" } }), listVersions("SLIDES", 8)]);
  const now = new Date();
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>สไลด์หน้าแรก</h1>
          <p>แบนเนอร์ด้านบนของหน้าแรก · สูงสุด 8 สไลด์ · แก้แล้วหน้าแรกเปลี่ยนทันที</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/" target="_blank" rel="noopener">ดูหน้าแรก</a>
          {slides.length < 8 ? <Link className="btn btn-primary" href="/admin/slides/new">+ เพิ่มสไลด์</Link> : <button className="btn btn-primary" disabled>ครบ 8 สไลด์</button>}
        </div>
      </div>
      {typeof sp.err === "string" && ERR[sp.err] && <div className="login-err" role="alert">{ERR[sp.err]}</div>}
      {sp.deleted === "1" && <div className="login-info" role="status">ลบสไลด์แล้ว</div>}
      {sp.rolledback === "1" && <div className="login-info" role="status">ย้อนกลับเวอร์ชันแล้ว</div>}

      <div className="sl-list">
        {slides.map((s, i) => {
          const img = mediaUrl(s.imageKey, "sm") ?? (s.imageUrl?.startsWith("https://images.unsplash.com/") ? `${s.imageUrl.split("?")[0]}?auto=format&fit=crop&w=480&q=60` : s.imageUrl);
          const waiting = s.startAt && s.startAt > now;
          const ended = s.endAt && s.endAt < now;
          return (
            <article key={s.id} className={`sl-card ${s.isActive && !waiting && !ended ? "" : "off"}`}>
              <Link href={`/admin/slides/${s.id}`} className="sl-thumb" aria-label={`แก้ไข ${s.title}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img ? <img src={img} alt="" style={{ objectPosition: `${s.focalX}% ${s.focalY}%` }} /> : null}
                <span className="sl-no">{i + 1}</span>
              </Link>
              <div className="sl-info">
                <Link href={`/admin/slides/${s.id}`}><b>{s.title}</b></Link>
                <span className="sub">{s.eyebrow}</span>
                <div className="flags">
                  {!s.isActive ? <span className="chip gray">ซ่อนอยู่</span> : waiting ? <span className="chip warn">เริ่ม {fmt(s.startAt!)}</span> : ended ? <span className="chip bad">หมดเวลา {fmt(s.endAt!)}</span> : <span className="chip new">กำลังแสดง</span>}
                  {s.isActive && s.endAt && !ended && <span className="chip gray">ถึง {fmt(s.endAt)}</span>}
                </div>
              </div>
              <div className="sl-acts">
                <form action={moveSlide}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" /><button className="icon-btn sm" disabled={i === 0} aria-label="เลื่อนขึ้น">↑</button></form>
                <form action={moveSlide}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" /><button className="icon-btn sm" disabled={i === slides.length - 1} aria-label="เลื่อนลง">↓</button></form>
                <form action={toggleSlide}><input type="hidden" name="id" value={s.id} /><button className="btn btn-ghost btn-sm">{s.isActive ? "ซ่อน" : "แสดง"}</button></form>
                <form action={duplicateSlide}><input type="hidden" name="id" value={s.id} /><button className="btn btn-ghost btn-sm">คัดลอก</button></form>
                {owner && <form action={deleteSlide}><input type="hidden" name="id" value={s.id} /><ConfirmSubmit className="btn btn-ghost btn-sm" title="ลบสไลด์นี้?" body={s.title} confirmLabel="ลบสไลด์">ลบ</ConfirmSubmit></form>}
              </div>
            </article>
          );
        })}
      </div>

      {versions.length > 1 && (
        <section className="box" style={{ marginTop: 16, maxWidth: 760 }}>
          <h3>ประวัติการแก้ไข (ย้อนกลับได้)</h3>
          <ul className="ver-list">
            {versions.slice(1).map((ver) => (
              <li key={ver.id}>
                <span>{fmt(ver.publishedAt)} · {ver.publishedBy ?? "—"} · {Array.isArray(ver.snapshot) ? ver.snapshot.length : 0} สไลด์</span>
                <form action={rollbackSlides}>
                  <input type="hidden" name="versionId" value={ver.id} />
                  <ConfirmSubmit className="btn btn-outline btn-sm" title="ย้อนกลับสไลด์ทั้งชุด?" body="สไลด์ปัจจุบันทั้งหมดจะถูกแทนที่ด้วยเวอร์ชันที่เลือก" confirmLabel="ย้อนกลับ">ย้อนกลับเป็นเวอร์ชันนี้</ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
