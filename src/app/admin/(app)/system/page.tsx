// /admin/system — สถานะระบบ (เจ้าของร้านเท่านั้น): ฐานข้อมูล, ที่เก็บไฟล์, LINE, เวอร์ชัน, เวลาเซิร์ฟเวอร์,
// จำนวนข้อมูลแต่ละตาราง, ทดสอบเขียนไฟล์ และดาวน์โหลดสำรองข้อมูลทั้งหมด (ZIP ของ CSV)
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireOwner } from "@/lib/auth";
import { botStatus, lineConfigured } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { testStorageWrite } from "./actions";

const run = promisify(execFile);
const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "(endpoint ไม่ถูกต้อง)";
  }
};
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Bangkok" });

/** เวอร์ชันโค้ด: จาก env ของผู้ให้บริการ (Railway ฯลฯ) หรือ git ในเครื่อง */
async function version() {
  const env = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || process.env.GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA;
  const branch = process.env.RAILWAY_GIT_BRANCH || "";
  if (env) return { sha: env.slice(0, 12), branch, source: "env" };
  try {
    const { stdout } = await run("git", ["log", "-1", "--format=%h|%cI|%s"], { timeout: 2000 });
    const [sha, at, subject] = stdout.trim().split("|");
    return { sha, branch: subject ? `${subject.slice(0, 80)} (${at.slice(0, 10)})` : "", source: "git" };
  } catch {
    return { sha: "ไม่ทราบ", branch: "", source: "" };
  }
}

async function dbStatus() {
  const t0 = Date.now();
  try {
    const [v] = await prisma.$queryRaw<{ v: string }[]>`SELECT version() AS v`;
    const ms = Date.now() - t0;
    const [size] = await prisma.$queryRaw<{ s: string }[]>`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`;
    const mig = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 1`.catch(() => []);
    return { ok: true as const, ms, version: v.v.split(" on ")[0].split(",")[0], size: size.s, migration: mig[0]?.migration_name ?? "—" };
  } catch (e) {
    return { ok: false as const, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}

async function lineStatus() {
  const cfg = lineConfigured();
  const recipients = await prisma.lineRecipient.count({ where: { enabled: true } });
  if (!cfg.token || !cfg.secret) return { ok: false, text: "ยังไม่ตั้งค่า", detail: !cfg.token ? "ไม่มี LINE_CHANNEL_ACCESS_TOKEN" : "ไม่มี LINE_CHANNEL_SECRET", recipients };
  try {
    const b = await botStatus();
    return { ok: true, text: "พร้อมใช้งาน", detail: `${b.name ?? ""} ${b.basicId ?? ""} · ใช้ไป ${b.used ?? "—"}${b.quota != null ? `/${b.quota}` : ""} ข้อความเดือนนี้`, recipients };
  } catch (e) {
    return { ok: false, text: "เชื่อมต่อไม่ได้", detail: (e instanceof Error ? e.message : String(e)).slice(0, 160), recipients };
  }
}

export default async function SystemPage({ searchParams }: PageProps<"/admin/system">) {
  await requireOwner();
  const sp = await searchParams;
  const [db, ver, line] = await Promise.all([dbStatus(), version(), lineStatus()]);
  const counts = db.ok
    ? await Promise.all([
        ["คำสั่งซื้อ", prisma.order.count()],
        ["สลิป", prisma.paymentSlip.count()],
        ["ลูกค้า", prisma.customer.count()],
        ["เอกสารขาย", prisma.salesDocument.count()],
        ["สินค้า", prisma.product.count()],
        ["หมวดหมู่", prisma.category.count()],
        ["คำขอจากลูกค้า", prisma.inquiry.count()],
        ["สไลด์", prisma.heroSlide.count()],
        ["หน้าเนื้อหา", prisma.page.count()],
        ["ผู้ใช้หลังบ้าน", prisma.admin.count()],
        ["บันทึกการใช้งาน", prisma.adminLog.count()],
        ["ผู้รับ LINE", prisma.lineRecipient.count()],
      ].map(async ([label, p]) => [label as string, await (p as Promise<number>)] as const))
    : [];
  const driver = process.env.STORAGE_DRIVER ?? "local";
  const storageDetail = driver === "s3" ? `S3 bucket ${process.env.S3_BUCKET ?? "(ไม่ได้ตั้ง)"}${process.env.S3_ENDPOINT ? ` @ ${hostOf(process.env.S3_ENDPOINT)}` : ""}` : `โฟลเดอร์ ${process.env.UPLOAD_DIR ?? "uploads"}`;
  const now = new Date();
  const mem = process.memoryUsage().rss / 1024 / 1024;
  const up = process.uptime();
  const ok = one(sp.ok).slice(0, 200), err = one(sp.err).slice(0, 300);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>สถานะระบบ</h1>
          <p>ตรวจการเชื่อมต่อและสำรองข้อมูลร้าน — เฉพาะเจ้าของร้าน</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-primary" href="/admin/export.zip" download id="dataExport">ดาวน์โหลดสำรองข้อมูลทั้งหมด (ZIP)</a>
        </div>
      </div>
      <div className="notice-stack">
        {ok && <div className="ok-box" role="status">{ok}</div>}
        {err && <div className="err-box" role="alert">{err}</div>}
      </div>

      <div className="kpis sys-kpis">
        <div className={`kpi ${db.ok ? "" : "hot"}`} id="sysDb">
          <span>ฐานข้อมูล</span>
          <b>{db.ok ? "ปกติ" : "เชื่อมต่อไม่ได้"}</b>
          <small>{db.ok ? `${db.version} · ${db.ms} ms · ${db.size}` : db.error}</small>
        </div>
        <div className="kpi" id="sysStorage">
          <span>ที่เก็บไฟล์</span>
          <b>{driver === "s3" ? "S3" : "ในเครื่อง"}</b>
          <small className="ovw">{storageDetail}</small>
        </div>
        <div className={`kpi ${line.ok ? "" : "hot"}`} id="sysLine">
          <span>แจ้งเตือน LINE</span>
          <b>{line.text}</b>
          <small>{line.detail} · ผู้รับที่เปิด {line.recipients}</small>
        </div>
        <div className="kpi" id="sysVer">
          <span>เวอร์ชัน</span>
          <b className="num">{ver.sha}</b>
          <small className="ovw">{ver.branch || "—"}</small>
        </div>
      </div>

      <div className="set-grid sys-grid">
        <section className="box">
          <h3>เซิร์ฟเวอร์</h3>
          <dl className="kv sys-kv">
            <span>เวลาเซิร์ฟเวอร์</span><b className="num" id="sysTime">{fmt(now)}</b>
            <span>UTC</span><b className="num">{now.toISOString().replace("T", " ").slice(0, 19)}</b>
            <span>Node.js</span><b>{process.version}</b>
            <span>โหมด</span><b>{process.env.NODE_ENV}</b>
            <span>ทำงานมาแล้ว</span><b>{up > 86400 ? `${Math.floor(up / 86400)} วัน ` : ""}{Math.floor((up % 86400) / 3600)} ชม. {Math.floor((up % 3600) / 60)} นาที</b>
            <span>หน่วยความจำ</span><b className="num">{mem.toFixed(0)} MB</b>
            <span>Migration ล่าสุด</span><b className="ovw">{db.ok ? db.migration : "—"}</b>
            <span>SITE_URL</span><b className="ovw">{process.env.SITE_URL ?? "(ไม่ได้ตั้ง)"}</b>
          </dl>
        </section>
        <section className="box">
          <h3>ทดสอบที่เก็บไฟล์</h3>
          <p className="sub">เขียนไฟล์ทดสอบขนาดเล็ก (system/healthcheck-…) แล้วอ่านกลับ เพื่อยืนยันว่าสลิปและรูปที่อัปโหลดจะถูกเก็บได้จริง</p>
          <form action={testStorageWrite}><button className="btn btn-outline" type="submit">ทดสอบเขียนไฟล์</button></form>
          <h3 style={{ marginTop: 8 }}>สำรองข้อมูล</h3>
          <p className="sub">ไฟล์ ZIP รวม CSV ของคำสั่งซื้อ ลูกค้า เอกสารขาย สินค้า หมวดหมู่ คำขอ และอื่นๆ (ไม่รวมรหัสผ่านและไฟล์ภาพ) — มีข้อมูลส่วนบุคคล เก็บในที่ปลอดภัย · การดาวน์โหลดทุกครั้งถูกบันทึก</p>
        </section>
        <section className="panel full">
          <div className="panel-head"><h2>จำนวนข้อมูล</h2></div>
          <ul className="sys-counts" id="sysCounts">
            {counts.map(([label, n]) => (
              <li key={label}><span>{label}</span><b className="num">{n.toLocaleString("th-TH")}</b></li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
