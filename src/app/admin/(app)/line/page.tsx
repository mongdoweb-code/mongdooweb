// /admin/line — แจ้งเตือน LINE: สถานะการเชื่อมต่อ, โควตาข้อความ, ผู้รับ (กลุ่ม/บุคคล), ข้อความทดสอบ, ขั้นตอนตั้งค่า
import { requireAdmin } from "@/lib/auth";
import { botStatus, lineConfigured, siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit, CopyButton } from "../../_components/AdminClient";
import { deleteRecipient, sendTest, toggleRecipient } from "./actions";

const fmt = (d: Date | null) => (d ? d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "—");
const KIND = { USER: "บุคคล", GROUP: "กลุ่ม", ROOM: "ห้องแชต" } as const;

export default async function LinePage({ searchParams }: PageProps<"/admin/line">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const cfg = lineConfigured();
  let bot: Awaited<ReturnType<typeof botStatus>> | null = null;
  let botErr = "";
  if (cfg.token) {
    try {
      bot = await botStatus();
    } catch (e) {
      botErr = e instanceof Error ? e.message : String(e);
    }
  }
  const list = await prisma.lineRecipient.findMany({ orderBy: [{ enabled: "desc" }, { createdAt: "desc" }] });
  const active = list.filter((r) => r.enabled).length;
  const webhook = `${siteUrl()}/api/line/webhook`;
  const owner = admin.role === "OWNER";
  const ok = typeof sp.ok === "string" ? sp.ok.slice(0, 200) : "";
  const err = typeof sp.err === "string" ? sp.err.slice(0, 200) : "";

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>แจ้งเตือน LINE</h1>
          <p>ส่งข้อความเข้า LINE ของร้านทันทีเมื่อลูกค้าแนบสลิป — พร้อมผลตรวจอัตโนมัติ (ยอดไม่ตรง / สลิปซ้ำ) และลิงก์เปิดตรวจ</p>
        </div>
        <div className="head-actions">
          <form action={sendTest}><button className="btn btn-primary" type="submit" disabled={!cfg.token || !active}>ส่งข้อความทดสอบ</button></form>
        </div>
      </div>
      {ok && <div className="login-info" role="status" style={{ marginBottom: 12 }}>{ok}</div>}
      {err && <div className="login-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="kpis">
        <div className={`kpi ${cfg.token && cfg.secret && !botErr ? "" : "hot"}`}>
          <span>การเชื่อมต่อ</span>
          <b>{!cfg.token || !cfg.secret ? "ยังไม่ตั้งค่า" : botErr ? "เชื่อมต่อไม่ได้" : "พร้อมใช้งาน"}</b>
          <small>{!cfg.token ? "ไม่มี LINE_CHANNEL_ACCESS_TOKEN" : !cfg.secret ? "ไม่มี LINE_CHANNEL_SECRET" : botErr || `${bot?.name} ${bot?.basicId ?? ""}`}</small>
        </div>
        <div className="kpi"><span>ผู้รับที่เปิดใช้</span><b className="num">{active}</b><small>จากทั้งหมด {list.length}</small></div>
        <div className="kpi">
          <span>ข้อความเดือนนี้</span>
          <b className="num">{bot?.used ?? "—"}{bot?.quota != null ? ` / ${bot.quota}` : ""}</b>
          <small>{bot?.quota != null ? "แพ็กเกจฟรี: ข้อความละ 1 ต่อ 1 ปลายทาง" : "ไม่จำกัด / ยังไม่ทราบ"}</small>
        </div>
      </div>

      <section className="panel">
        <div className="toolbar"><h2 style={{ fontSize: 16, fontWeight: 700, padding: "4px 0" }}>ผู้รับแจ้งเตือน</h2></div>
        <table className="tbl">
          <thead><tr><th>ชื่อ</th><th>ประเภท</th><th>สถานะ</th><th>ส่งล่าสุด</th><th /></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={r.enabled ? "" : "row-off"}>
                <td><b>{r.name}</b><span className="sub">เพิ่มเมื่อ {fmt(r.createdAt)}</span>{r.lastError && <span className="sub" style={{ color: "var(--c-err)" }}>ผิดพลาด: {r.lastError}</span>}</td>
                <td>{KIND[r.kind]}</td>
                <td>{r.enabled ? <span className="dst dst-ok">เปิดใช้</span> : <span className="dst dst-pend">รอเปิดใช้</span>}</td>
                <td><span className="sub" style={{ fontSize: 13 }}>{fmt(r.lastSentAt)}</span></td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  {owner && <form action={toggleRecipient} style={{ display: "inline" }}><input type="hidden" name="id" value={r.id} /><button className={`btn btn-sm ${r.enabled ? "btn-outline" : "btn-primary"}`} type="submit">{r.enabled ? "ปิด" : "เปิดใช้"}</button></form>}
                  {r.enabled && <form action={sendTest} style={{ display: "inline" }}><input type="hidden" name="id" value={r.id} /><button className="btn btn-ghost btn-sm" type="submit" disabled={!cfg.token}>ทดสอบ</button></form>}
                  {owner && <form action={deleteRecipient} style={{ display: "inline" }}><input type="hidden" name="id" value={r.id} /><ConfirmSubmit className="btn btn-ghost btn-sm" title={`ลบ "${r.name}"?`} body="ถ้าต้องการรับแจ้งเตือนอีก ให้เชิญ OA เข้ากลุ่มใหม่ หรือพิมพ์ “ลงทะเบียนแจ้งเตือน” อีกครั้ง" confirmLabel="ลบ">ลบ</ConfirmSubmit></form>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="empty"><b>ยังไม่มีผู้รับ</b>ทำตามขั้นตอนด้านล่าง แล้วผู้รับจะขึ้นที่นี่ให้กด “เปิดใช้”</div>}
        {!owner && list.length > 0 && <p className="sub" style={{ padding: "10px 16px" }}>เปิด/ปิด/ลบผู้รับได้เฉพาะเจ้าของร้าน</p>}
      </section>

      <section className="panel line-guide">
        <h2>ขั้นตอนตั้งค่า (ครั้งเดียว)</h2>
        <ol>
          <li>เข้า <b>LINE Official Account Manager</b> ของ @mongdoweb › ตั้งค่า › <b>Messaging API</b> › กด “ใช้ Messaging API” (เลือก/สร้าง Provider ชื่อร้าน)</li>
          <li>เข้า <b>LINE Developers Console</b> (developers.line.biz) › เลือก Channel ของ OA:
            <ul>
              <li>แท็บ Basic settings › คัดลอก <b>Channel secret</b></li>
              <li>แท็บ Messaging API › กด Issue ที่ <b>Channel access token (long-lived)</b> แล้วคัดลอก</li>
            </ul>
          </li>
          <li>ใส่ทั้งสองค่าในไฟล์ <code>.env</code> บนเซิร์ฟเวอร์ (ห้ามส่งในแชต/อีเมล) แล้วรีสตาร์ตเว็บ:
            <pre>{"LINE_CHANNEL_ACCESS_TOKEN=...\nLINE_CHANNEL_SECRET=..."}</pre>
          </li>
          <li>แท็บ Messaging API › <b>Webhook URL</b> ใส่ค่านี้ แล้วกด Verify และเปิด “Use webhook”:
            <div className="line-url"><code>{webhook}</code><CopyButton text={webhook} done="คัดลอก Webhook URL แล้ว">คัดลอก</CopyButton></div>
            <small className="sub">ต้องเป็นโดเมนจริงที่มี https (ใช้กับ localhost ไม่ได้)</small>
          </li>
          <li>ในแท็บเดียวกัน เปิด <b>Allow bot to join group chats</b> · ใน OA Manager › การตอบกลับ ให้คง “แชต” เปิดไว้ เพื่อยังตอบลูกค้าได้ตามปกติ</li>
          <li>เลือกวิธีรับแจ้งเตือน:
            <ul>
              <li><b>กลุ่มร้าน (แนะนำ)</b>: เชิญ @mongdoweb เข้ากลุ่ม LINE ของร้าน — ทุกคนในกลุ่มเห็นพร้อมกัน ใช้ข้อความฟรีแค่ 1 ต่อการแจ้งเตือน</li>
              <li><b>รายบุคคล</b>: แอดไลน์ @mongdoweb แล้วพิมพ์ <code>ลงทะเบียนแจ้งเตือน</code> (นับข้อความ 1 ต่อคน)</li>
            </ul>
          </li>
          <li>กลับมาหน้านี้ กด <b>เปิดใช้</b> ที่ชื่อกลุ่ม/คน แล้วกด <b>ส่งข้อความทดสอบ</b></li>
        </ol>
        <p className="sub">แพ็กเกจฟรีของ LINE OA ส่งได้ 300 ข้อความ/เดือน (ข้อความ push ทุกแบบรวมกัน) — ถ้าออเดอร์เยอะ ใช้แบบกลุ่มจะประหยัดที่สุด</p>
      </section>
    </main>
  );
}
