// /admin/backups — สำรองข้อมูลอัตโนมัติ (A26, เจ้าของร้าน): รายการไฟล์สำรอง, ดาวน์โหลด, สำรองตอนนี้, จำนวนวันที่เก็บ
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { backupNow, saveRetention } from "./actions";
import "../../lot12.css";

const when = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const ST: Record<string, [string, string]> = { OK: ["สำเร็จ", "ok"], FAILED: ["ไม่สำเร็จ", "bad"], RUNNING: ["กำลังสำรอง", "pend"], REPLACED: ["ถูกแทนที่ (สำรองซ้ำวันเดียวกัน)", "gray"], EXPIRED: ["ลบแล้ว (เกินระยะเก็บ)", "gray"] };

export default async function BackupsPage({ searchParams }: PageProps<"/admin/backups">) {
  await requireOwner();
  const sp = await searchParams;
  const [runs, s] = await Promise.all([
    prisma.backupRun.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { backupRetentionDays: true } }),
  ]);
  const lastOk = runs.find((r) => r.status === "OK");
  const cron = !!process.env.CRON_SECRET?.trim();
  return (
    <main className="main" id="page-backups">
      <div className="page-head">
        <div>
          <h1>สำรองข้อมูล</h1>
          <p>สำรองทุกตารางเป็นไฟล์ ZIP ไปที่ที่เก็บไฟล์ทุกวัน (พร้อมงานประจำวัน 07:00) · ล่าสุด: {lastOk ? when(lastOk.createdAt) : "ยังไม่เคยสำรอง"}</p>
        </div>
        <form className="head-actions" action={backupNow}>
          <button className="btn btn-primary" type="submit" id="backupNow">สำรองตอนนี้</button>
        </form>
      </div>
      {sp.done === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }} id="backupDone">สำรองข้อมูลเรียบร้อย</div>}
      {sp.busy === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>กำลังสำรองข้อมูลอยู่ — รอสักครู่แล้วโหลดหน้าใหม่</div>}
      {sp.failed === "1" && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>สำรองข้อมูลไม่สำเร็จ — ดูสาเหตุในตารางด้านล่าง</div>}
      {sp.bad === "1" && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>จำนวนวันต้องเป็น 1–90</div>}
      {sp.saved === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>บันทึกแล้ว</div>}
      {!cron && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ยังไม่ได้ตั้ง CRON_SECRET — การสำรองอัตโนมัติรายวันยังไม่ทำงาน (ดู docs/DEPLOY.md หัวข้อ งานประจำวัน)</div>}
      <div className="pform-grid">
        <section className="panel">
          <table className="tbl" id="backupTable">
            <thead><tr><th>เวลา</th><th>ไฟล์</th><th className="r">ขนาด</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {runs.map((r) => {
                const [label, cls] = ST[r.status] ?? [r.status, "gray"];
                return (
                  <tr key={r.id}>
                    <td className="sub">{when(r.createdAt)}</td>
                    <td className="num">{r.key ?? "—"}{r.error && <span className="sub" style={{ color: "var(--c-err)" }}>{r.error}</span>}</td>
                    <td className="r num">{r.sizeBytes ? `${(r.sizeBytes / 1024).toLocaleString("th-TH", { maximumFractionDigits: 0 })} KB` : "—"}</td>
                    <td><span className={`dst dst-${cls}`}>{label}</span></td>
                    <td className="r">{r.status === "OK" && r.key ? <a className="btn btn-outline btn-sm" href={`/admin/backups/${r.id}/download`} download>ดาวน์โหลด</a> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!runs.length && <div className="empty"><b>ยังไม่มีไฟล์สำรอง</b><span className="sub">กด “สำรองตอนนี้” เพื่อสร้างไฟล์แรก</span></div>}
        </section>
        <div className="d-col">
          <form className="box" action={saveRetention}>
            <h3>เก็บย้อนหลัง</h3>
            <div className="field">
              <label htmlFor="bkDays">จำนวนวันที่เก็บไฟล์สำรอง</label>
              <input id="bkDays" name="days" type="number" min={1} max={90} defaultValue={s?.backupRetentionDays ?? 14} required />
            </div>
            <p className="l3-note">ไฟล์ที่เก่ากว่านี้จะถูกลบออกจากที่เก็บไฟล์อัตโนมัติหลังสำรองครั้งถัดไป</p>
            <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn btn-outline btn-sm" type="submit">บันทึก</button></div>
          </form>
          <div className="box">
            <h3>กู้คืนข้อมูล</h3>
            <p className="l3-note">กู้คืนทำโดยผู้ดูแลระบบตามคู่มือ docs/DEPLOY.md หัวข้อ “กู้คืนข้อมูลจากไฟล์สำรอง” — สร้างฐานข้อมูลใหม่ → migrate → <code>npx tsx scripts/restore-backup.ts &lt;ไฟล์.zip&gt;</code> → ทดสอบ → สลับใช้งาน (ไม่มีปุ่มกู้คืนในหลังบ้าน เพื่อกันการเขียนทับข้อมูลจริงโดยไม่ตั้งใจ)</p>
            <p className="l3-note">ไฟล์มีข้อมูลส่วนบุคคลของลูกค้า — เก็บในที่ปลอดภัยเท่านั้น · ไม่มี secret ยืนยันตัวตน 2 ขั้น (ตั้งใหม่หลังกู้คืน)</p>
          </div>
        </div>
      </div>
    </main>
  );
}
