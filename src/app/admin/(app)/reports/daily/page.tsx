// /admin/reports/daily?day=YYYY-MM-DD — ปิดยอดประจำวัน: เงินรับเข้าทุกช่องทางของวันนั้น · แยกตามวิธีชำระ · ตรวจกับบัญชีแล้วกด "ปิดยอด"
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { docDate, docDateTime, fromYmd, ymdBkk } from "@/lib/doc-calc";
import { SOURCE_LABEL, dailyReceipts } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { ConfirmSubmit } from "../../../_components/AdminClient";
import { baht } from "../_ui";
import { closeDay, reopenDay } from "./actions";
import "../../../lot3.css";

const ERR: Record<string, string> = { day: "วันที่ไม่ถูกต้อง (ปิดยอดล่วงหน้าไม่ได้)", counted: "ยอดที่ตรวจได้ต้องเป็นตัวเลข", note: "ยอดไม่ตรงกับระบบ — กรุณาใส่หมายเหตุว่าต่างเพราะอะไร" };
const shift = (ymd: string, n: number) => ymdBkk(new Date(fromYmd(ymd).getTime() + n * 864e5));

export default async function DailyClosePage({ searchParams }: PageProps<"/admin/reports/daily">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const today = ymdBkk(new Date());
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today;
  const [s, r, closed, recent] = await Promise.all([
    getSettings(),
    dailyReceipts(day),
    prisma.dailyClose.findUnique({ where: { day } }),
    prisma.dailyClose.findMany({ where: { day: { gte: shift(today, -13) } }, select: { day: true, totalSatang: true, countedSatang: true } }),
  ]);
  const era = s.dateEra;
  const changed = closed && closed.totalSatang !== r.total;
  const err = typeof sp.err === "string" ? ERR[sp.err] : "";
  const days = Array.from({ length: 14 }, (_, i) => shift(today, -i));

  return (
    <main className="main" id="page-daily">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/reports">← รายงานยอดขาย</Link></p>
          <h1>ปิดยอดประจำวัน</h1>
          <p>เงินที่ร้านได้รับในวัน {docDate(day, era)} จากทุกช่องทาง — ตรวจกับบัญชีธนาคาร/เงินสดแล้วกด &quot;ปิดยอด&quot;</p>
        </div>
        <div className="head-actions dc-nav">
          <Link className="btn btn-outline" href={`/admin/reports/daily?day=${shift(day, -1)}`} aria-label="วันก่อนหน้า">← วันก่อน</Link>
          <form action="/admin/reports/daily" className="dc-pick">
            <label className="sr-only" htmlFor="dcDay">เลือกวันที่</label>
            <input id="dcDay" type="date" name="day" defaultValue={day} max={today} />
            <button className="btn btn-outline" type="submit">ดู</button>
          </form>
          {day < today && <Link className="btn btn-outline" href={`/admin/reports/daily?day=${shift(day, 1)}`} aria-label="วันถัดไป">วันถัดไป →</Link>}
        </div>
      </div>
      {sp.closed === "1" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>ปิดยอดวันที่ {docDate(day, era)} แล้ว</div>}
      {err && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="dc-grid">
        <div className="dc-main">
          <div className="ar-kpis">
            <div className="ar-kpi on"><span>รับเงินรวมทั้งวัน</span><b className="num">{baht(r.total)}</b><small>{r.entries.length} รายการ</small></div>
            {r.bySource.map((x) => <div key={x.source} className="ar-kpi"><span>{SOURCE_LABEL[x.source]}</span><b className="num">{baht(x.amount)}</b><small>{x.count} รายการ</small></div>)}
          </div>

          <section className="panel">
            <div className="dc-h"><h3>แยกตามวิธีชำระ</h3><small className="sub">ใช้เทียบกับยอดเข้าบัญชีแต่ละบัญชี / เงินสดในลิ้นชัก</small></div>
            <table className="tbl">
              <thead><tr><th>วิธีชำระ</th><th className="r">จำนวนรายการ</th><th className="r">ยอดรวม</th></tr></thead>
              <tbody>
                {r.byMethod.map((m) => <tr key={m.method}><td>{m.method}</td><td className="r num">{m.count}</td><td className="r num"><b>{baht(m.amount)}</b></td></tr>)}
              </tbody>
            </table>
            {!r.byMethod.length && <div className="empty"><b>ไม่มีเงินรับเข้าในวันนี้</b>ยังไม่มีการอนุมัติสลิป รับชำระใบแจ้งหนี้ หรือออกใบเสร็จ</div>}
          </section>

          <section className="panel" style={{ marginTop: 16 }}>
            <div className="dc-h"><h3>รายการรับเงิน ({r.entries.length})</h3></div>
            <div className="tbl-wrap">
              <table className="tbl dc-tbl">
                <thead><tr><th>เวลา</th><th>แหล่ง</th><th>เลขที่</th><th>ลูกค้า</th><th>วิธีชำระ</th><th className="r">ยอด</th></tr></thead>
                <tbody>
                  {r.entries.map((e) => (
                    <tr key={`${e.source}-${e.ref}-${e.at.getTime()}`}>
                      <td className="num sub">{e.at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}</td>
                      <td className="sub">{SOURCE_LABEL[e.source]}</td>
                      <td><Link className="link num" href={e.href}>{e.ref}</Link>{e.note && <span className="sub">{e.note}</span>}</td>
                      <td>{e.who}</td>
                      <td className="sub">{e.method}</td>
                      <td className="r num"><b>{baht(e.amount)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="dc-side">
          <section className="box">
            <h3>สถานะการปิดยอด</h3>
            {closed ? (
              <div className="dc-closed">
                <span className="dst dst-ok">ปิดยอดแล้ว</span>
                <p>โดย {closed.closedBy} · {docDateTime(closed.closedAt, era)}</p>
                <p>ยอดระบบตอนปิด <b className="num">{baht(closed.totalSatang)}</b></p>
                {closed.countedSatang != null && <p>ตรวจจริง <b className="num">{baht(closed.countedSatang)}</b> (ต่าง <b className="num owe">{baht(closed.countedSatang - closed.totalSatang)}</b>)</p>}
                {closed.note && <p className="sub">หมายเหตุ: {closed.note}</p>}
                {changed && <div className="login-err" role="alert">มีรายการเปลี่ยนหลังปิดยอด — ยอดตอนนี้ {baht(r.total)} · ปิดยอดใหม่เพื่อบันทึกยอดล่าสุด</div>}
                {admin.role === "OWNER" && (
                  <form action={reopenDay}>
                    <input type="hidden" name="day" value={day} />
                    <ConfirmSubmit className="btn btn-ghost btn-sm" title="เปิดปิดยอดใหม่?" body="ลบบันทึกการปิดยอดของวันนี้ เพื่อให้ตรวจและปิดใหม่" confirmLabel="เปิดใหม่">เปิดปิดยอดใหม่</ConfirmSubmit>
                  </form>
                )}
              </div>
            ) : null}
            {(!closed || changed) && (
              <form action={closeDay} className="dc-form">
                <input type="hidden" name="day" value={day} />
                <p className="sub">ยอดตามระบบ <b className="num">{baht(r.total)}</b> — ตรวจกับยอดเข้าบัญชี/เงินสดจริงแล้ว</p>
                <div className="field"><label htmlFor="dcCounted">ยอดที่ตรวจได้จริง (บาท) — เว้นว่างถ้าตรงกับระบบ</label><input id="dcCounted" name="counted" inputMode="decimal" placeholder={(r.total / 100).toFixed(2)} /></div>
                <div className="field"><label htmlFor="dcNote">หมายเหตุ (จำเป็นถ้ายอดไม่ตรง)</label><textarea id="dcNote" name="note" rows={2} maxLength={500} placeholder="เช่น ลูกค้าโอนเกิน 20 บาท คืนแล้ว" /></div>
                <button className="btn btn-primary" type="submit">{closed ? "ปิดยอดใหม่" : day === today ? "ปิดยอดวันนี้" : "ปิดยอดวันนั้น"}</button>
              </form>
            )}
          </section>
          <section className="box">
            <h3>14 วันล่าสุด</h3>
            <ul className="dc-days">
              {days.map((d) => {
                const c = recent.find((x) => x.day === d);
                return (
                  <li key={d} className={d === day ? "on" : ""}>
                    <Link href={`/admin/reports/daily?day=${d}`}>{docDate(d, era)}</Link>
                    {c ? <span className={`dst dst-${c.countedSatang != null ? "pend" : "ok"}`}>{c.countedSatang != null ? "ปิดแล้ว (ยอดต่าง)" : "ปิดแล้ว"}</span> : <span className="dst dst-gray">ยังไม่ปิด</span>}
                    {c && <b className="num">{baht(c.totalSatang)}</b>}
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
