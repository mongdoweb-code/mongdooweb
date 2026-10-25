// /admin/home — หน้าแรกและความน่าเชื่อถือ (A30/U30) + เวลาทำการสำหรับสถานะ "ร้านเปิดอยู่/ปิดแล้ว" (U27)
import { requireAdmin } from "@/lib/auth";
import { DAY_NAMES, HOME_SECTIONS, hoursSummary, parseHomeSections, parseOpeningHours, parseTrust } from "@/lib/home";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getShopRating } from "@/lib/reviews";
import { SectionOrder } from "./SectionOrder";
import { saveHomeSections, saveHours, saveTrust } from "./actions";
import "../_lot10/lot10.css";

export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HomeAdminPage({ searchParams }: PageProps<"/admin/home">) {
  await requireAdmin();
  const sp = await searchParams;
  const [s, rating, projects] = await Promise.all([
    prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { homeSections: true, trust: true, openingHours: true, businessHours: true } }),
    getShopRating(),
    prisma.project.count({ where: { isPublished: true } }),
  ]);
  const sections = parseHomeSections(s?.homeSections);
  const trust = parseTrust(s?.trust);
  const hours = parseOpeningHours(s?.openingHours);
  const done = one(sp.done);
  const DONE: Record<string, string> = {
    sections: "บันทึกลำดับหน้าแรกแล้ว",
    trust: "บันทึกส่วนความน่าเชื่อถือแล้ว",
    trustPartial: "บันทึกแล้ว — ตัวเลขที่กรอกไม่ครบ (ต้องมีทั้งตัวเลขและคำอธิบาย) ถูกข้ามไป",
    hours: "บันทึกเวลาทำการแล้ว",
  };
  const ERR: Record<string, string> = { hoursErr: "เวลาไม่ถูกต้อง — ใช้รูปแบบ 09:00 และเวลาปิดต้องหลังเวลาเปิด", err: one(sp.msg) || "บันทึกไม่สำเร็จ" };
  const stats = [...trust.stats, ...Array.from({ length: 6 - trust.stats.length }, () => ({ value: "", label: "" }))];
  const byDay = (d: number) => hours.filter((h) => h.day === d);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>หน้าแรกและความน่าเชื่อถือ</h1>
          <p>จัดลำดับส่วนต่างๆ ของหน้าแรก · โลโก้ลูกค้าองค์กร ตัวเลขผลงาน และคะแนนรีวิว · เวลาทำการ (สถานะร้านเปิด/ปิดที่ปุ่ม LINE)</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/" target="_blank" rel="noopener">ดูหน้าแรก</a>
        </div>
      </div>
      {ERR[done] ? <div className="l10-err" role="alert">{ERR[done]}</div> : DONE[done] && <div className="ok-box l10-ok" role="status">{DONE[done]}</div>}
      <div className="l10-cols">
        <section className="box" aria-labelledby="order-h">
          <h3 id="order-h">ลำดับส่วนของหน้าแรก</h3>
          <p className="l10-help" style={{ marginBottom: 10 }}>ติ๊กออก = ซ่อนส่วนนั้น · สไลด์ภาพหลักซ่อนไม่ได้ · ส่วนที่ยังไม่มีข้อมูล (เช่น ยังไม่มีผลงาน/บทความ) จะไม่แสดงเอง</p>
          <SectionOrder rows={sections.map((x) => ({ key: x.key, label: HOME_SECTIONS[x.key], show: x.show }))} action={saveHomeSections} />
        </section>

        <section className="box" aria-labelledby="hours-h">
          <h3 id="hours-h">เวลาทำการ</h3>
          <p className="l10-help" style={{ marginBottom: 10 }}>
            ใช้แสดง “ร้านเปิดอยู่ / ปิดแล้ว · เปิดอีกครั้ง …” ที่ปุ่ม LINE และหน้าติดต่อเรา (เวลาไทย) · วันละ 2 ช่วงได้ (เช่น พักเที่ยง)
            {hours.length ? <><br />ตอนนี้: <b>{hoursSummary(hours)}</b></> : s?.businessHours ? <><br />ข้อความเดิม: {s.businessHours}</> : null}
          </p>
          <form action={saveHours} className="l10-hours-ed" id="hoursForm">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const h = byDay(d);
              return (
                <div key={d}>
                  <label>
                    <input type="checkbox" name={`on${d}`} defaultChecked={h.length > 0} /> {DAY_NAMES[d]}
                  </label>
                  {[1, 2].map((n) => (
                    <span key={n} style={{ display: "contents" }}>
                      {n === 2 && <span className="sr-only">ช่วงที่ 2</span>}
                      <input aria-label={`${DAY_NAMES[d]} เปิด${n === 2 ? " ช่วงที่ 2" : ""}`} name={`open${d}_${n}`} type="time" defaultValue={h[n - 1]?.open ?? (n === 1 ? "09:00" : "")} style={n === 2 ? { gridColumn: "2" } : undefined} />
                      <input aria-label={`${DAY_NAMES[d]} ปิด${n === 2 ? " ช่วงที่ 2" : ""}`} name={`close${d}_${n}`} type="time" defaultValue={h[n - 1]?.close ?? (n === 1 ? "17:00" : "")} />
                    </span>
                  ))}
                </div>
              );
            })}
            <p>
              <button className="btn btn-primary" type="submit">บันทึกเวลาทำการ</button>
            </p>
          </form>
        </section>
      </div>

      <section className="box" aria-labelledby="trust-h" style={{ marginTop: 16 }}>
        <h3 id="trust-h">ส่วนความน่าเชื่อถือ (หน้าแรก)</h3>
        <form action={saveTrust} id="trustForm">
          <div className="two-col">
            <div className="field">
              <label htmlFor="trTitle">หัวข้อ</label>
              <input id="trTitle" name="title" defaultValue={trust.title} maxLength={80} />
            </div>
            <div className="field">
              <span className="lbl">คะแนนรีวิวรวม</span>
              <label className="switch-lbl">
                <input type="checkbox" name="showRating" defaultChecked={trust.showRating} /> แสดงคะแนนเฉลี่ยจากรีวิวที่อนุมัติแล้ว
              </label>
              <small>{rating.count ? `ตอนนี้ ${rating.avg.toFixed(1)} ดาว จาก ${rating.count} รีวิว` : "ยังไม่มีรีวิวที่อนุมัติ — จะแสดงเมื่อมีรีวิว"}</small>
            </div>
          </div>
          <h4 style={{ fontSize: 13, margin: "14px 0 6px" }}>ตัวเลข (สูงสุด 6) {projects ? <small className="sub">มีผลงานที่เผยแพร่ {projects} งาน</small> : null}</h4>
          <div className="l10-stats-ed">
            {stats.map((x, i) => (
              <div key={i}>
                <input aria-label={`ตัวเลขที่ ${i + 1}`} name={`statValue${i}`} defaultValue={x.value} maxLength={20} placeholder={i === 0 ? "500+" : ""} />
                <input aria-label={`คำอธิบายตัวเลขที่ ${i + 1}`} name={`statLabel${i}`} defaultValue={x.label} maxLength={60} placeholder={i === 0 ? "งานติดตั้งทั่วประเทศ" : ""} />
              </div>
            ))}
          </div>
          <h4 style={{ fontSize: 13, margin: "14px 0 6px" }}>โลโก้ลูกค้าองค์กร ({trust.logos.length})</h4>
          {trust.logos.length > 0 && (
            <div className="l10-logos">
              {trust.logos.map((l, i) => (
                <figure key={l.key}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก /media */}
                  <img src={mediaUrl(l.key, "sm")!} alt={l.name || `โลโก้ ${i + 1}`} />
                  <input type="hidden" name={`logoKey${i}`} value={l.key} />
                  <input aria-label={`ชื่อโลโก้ ${i + 1}`} name={`logoName${i}`} defaultValue={l.name} maxLength={80} placeholder="ชื่อองค์กร" />
                  <input aria-label={`ลิงก์โลโก้ ${i + 1}`} name={`logoHref${i}`} defaultValue={l.href ?? ""} maxLength={300} placeholder="ลิงก์ (ไม่บังคับ)" />
                  <label className="switch-lbl">
                    <input type="checkbox" name={`logoDel${i}`} /> ลบ
                  </label>
                </figure>
              ))}
            </div>
          )}
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="newLogos">เพิ่มโลโก้ (PNG/JPG/WEBP เลือกได้หลายไฟล์ — ใช้ชื่อไฟล์เป็นชื่อองค์กร แก้ได้ภายหลัง)</label>
            <input id="newLogos" name="newLogos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
            <small>ใช้โลโก้ลูกค้าเมื่อได้รับอนุญาตแล้วเท่านั้น</small>
          </div>
          <p style={{ marginTop: 12 }}>
            <button className="btn btn-primary" type="submit">บันทึกส่วนความน่าเชื่อถือ</button>
          </p>
        </form>
      </section>
    </main>
  );
}
