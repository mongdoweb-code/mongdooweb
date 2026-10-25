// /admin/search — คำพ้องสำหรับค้นหา + รายงานคำที่ลูกค้าค้นแล้วไม่เจอ (A11)
// บันทึกคำค้นไม่มีข้อมูลผู้ใช้ (ไม่มี IP/เบอร์) และไม่เก็บคำที่ดูเหมือนเบอร์โทร/อีเมล
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { addDefaultSynonyms, clearSearchLog, deleteSynonym, saveSynonym, synonymFromQuery } from "./actions";
import "../_lot10/lot10.css";

export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);
const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const RANGES = { "7": "7 วัน", "30": "30 วัน", "90": "90 วัน" } as const;

export default async function SearchAdminPage({ searchParams }: PageProps<"/admin/search">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const range = (one(sp.range) in RANGES ? one(sp.range) : "30") as keyof typeof RANGES;
  const since = daysAgo(Number(range));
  const [groups, zero, top, total] = await Promise.all([
    prisma.searchSynonym.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.searchLog.groupBy({ by: ["query"], where: { results: 0, createdAt: { gte: since } }, _count: { _all: true }, _max: { createdAt: true }, orderBy: { _count: { query: "desc" } }, take: 30 }),
    prisma.searchLog.groupBy({ by: ["query"], where: { createdAt: { gte: since } }, _count: { _all: true }, _avg: { results: true }, orderBy: { _count: { query: "desc" } }, take: 20 }),
    prisma.searchLog.count({ where: { createdAt: { gte: since } } }),
  ]);
  const zeroTotal = zero.reduce((s, z) => s + z._count._all, 0);
  const maxZero = Math.max(1, ...zero.map((z) => z._count._all));
  const self = `/admin/search${range !== "30" ? `?range=${range}` : ""}`;
  const done = one(sp.done);
  const msg = one(sp.msg);
  const DONE: Record<string, string> = {
    saved: "บันทึกกลุ่มคำพ้องแล้ว — ช่องค้นหาใช้คำชุดใหม่ทันที",
    deleted: "ลบกลุ่มคำพ้องแล้ว",
    defaults: `เพิ่มชุดเริ่มต้น ${msg} กลุ่ม`,
    linked: `เพิ่มคำพ้องแล้ว: ${msg}`,
    cleared: "ล้างบันทึกคำค้นแล้ว",
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>ค้นหาสินค้า</h1>
          <p>คำพ้อง ไทย/อังกฤษ (เช่น ไฟใต้น้ำ = underwater) ช่วยให้ลูกค้าเจอสินค้า แม้ใช้คำต่างจากชื่อสินค้า · ระบบยังหาเจอเมื่อพิมพ์ผิดเล็กน้อย</p>
        </div>
      </div>
      {done === "need2" ? (
        <div className="l10-err" role="alert">กลุ่มคำพ้องต้องมีอย่างน้อย 2 คำที่ต่างกัน</div>
      ) : (
        DONE[done] && <div className="ok-box l10-ok" role="status">{DONE[done]}</div>
      )}
      <div className="l10-cols">
        <section className="panel" aria-labelledby="zero-h">
          <div className="panel-head" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h2 id="zero-h" style={{ fontSize: 16 }}>คำที่ค้นแล้วไม่เจอ</h2>
            <nav className="seg" aria-label="ช่วงเวลา">
              {Object.entries(RANGES).map(([k, l]) => (
                <Link key={k} className={`btn btn-sm ${range === k ? "btn-dark" : "btn-outline"}`} href={`/admin/search${k !== "30" ? `?range=${k}` : ""}`} aria-current={range === k ? "page" : undefined}>
                  {l}
                </Link>
              ))}
            </nav>
          </div>
          <p className="l10-help" style={{ padding: "0 16px 8px" }}>
            ค้นทั้งหมด {total.toLocaleString("th-TH")} ครั้ง · ไม่เจอ {zeroTotal.toLocaleString("th-TH")} ครั้ง — ผูกคำที่ลูกค้าใช้กับคำที่มีในชื่อสินค้า (เช่น “ไฟบ่อ” = “บ่อปลา”) แล้วครั้งหน้าจะค้นเจอ
          </p>
          <table className="l10-mini" id="zeroTable">
            <thead>
              <tr>
                <th>คำค้น</th>
                <th>ครั้ง</th>
                <th>ล่าสุด</th>
                <th>ผูกกับคำ</th>
              </tr>
            </thead>
            <tbody>
              {zero.map((z, zi) => (
                <tr key={z.query} data-query={z.query}>
                  <td><b>{z.query}</b></td>
                  <td>
                    <span className="l10-bar" style={{ width: Math.round((z._count._all / maxZero) * 60) }} aria-hidden="true" />
                    {z._count._all}
                  </td>
                  <td>{z._max.createdAt ? fmt(z._max.createdAt) : ""}</td>
                  <td>
                    <form action={synonymFromQuery} className="l10-inline">
                      <input type="hidden" name="query" value={z.query} />
                      <input type="hidden" name="back" value={self} />
                      <label className="sr-only" htmlFor={`to-${zi}`}>คำที่มีในสินค้าสำหรับ {z.query}</label>
                      <input id={`to-${zi}`} name="to" className="sel" placeholder="เช่น ไฟใต้น้ำ" maxLength={40} required style={{ width: 130 }} />
                      <button className="btn btn-dark btn-sm" type="submit">เพิ่มคำพ้อง</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!zero.length && <div className="empty"><b>ไม่มีคำที่ค้นไม่เจอในช่วงนี้</b>ระบบบันทึกคำที่ลูกค้าค้นในหน้า “ค้นหาสินค้า”</div>}
          {top.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, padding: "16px 16px 0" }}>คำค้นยอดนิยม</h3>
              <table className="l10-mini">
                <thead>
                  <tr>
                    <th>คำค้น</th>
                    <th>ครั้ง</th>
                    <th>ผลเฉลี่ย</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((t) => (
                    <tr key={t.query}>
                      <td><a className="link" href={`/search?q=${encodeURIComponent(t.query)}`} target="_blank" rel="noopener">{t.query}</a></td>
                      <td>{t._count._all}</td>
                      <td>{Math.round(t._avg.results ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {admin.role === "OWNER" && total > 0 && (
            <form action={clearSearchLog} style={{ padding: 16 }}>
              <input type="hidden" name="back" value={self} />
              <ConfirmSubmit title="ล้างบันทึกคำค้น" body="ลบบันทึกคำค้นทั้งหมด (รายงานจะเริ่มนับใหม่)" confirmLabel="ล้างบันทึก" className="btn btn-ghost btn-sm">
                ล้างบันทึกคำค้น
              </ConfirmSubmit>
            </form>
          )}
        </section>

        <section className="panel" id="synonyms" aria-labelledby="syn-h">
          <div className="panel-head" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h2 id="syn-h" style={{ fontSize: 16 }}>กลุ่มคำพ้อง ({groups.length})</h2>
            <form action={addDefaultSynonyms}>
              <input type="hidden" name="back" value={self} />
              <button className="btn btn-outline btn-sm" type="submit">เพิ่มชุดเริ่มต้นที่ยังไม่มี</button>
            </form>
          </div>
          <p className="l10-help" style={{ padding: "0 16px 8px" }}>คำในกลุ่มเดียวกันค้นแทนกันได้ คั่นด้วยจุลภาค (,) — ตัวพิมพ์เล็ก/ใหญ่และเว้นวรรคไม่มีผล</p>
          <form action={saveSynonym} className="l10-inline" style={{ padding: "0 16px 14px" }} id="newSynonym">
            <input type="hidden" name="back" value={self} />
            <div className="field">
              <label htmlFor="syn-new">กลุ่มใหม่</label>
              <input id="syn-new" name="words" placeholder="ไฟบ่อ, บ่อปลา, pond" maxLength={800} required />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">เพิ่มกลุ่ม</button>
          </form>
          <ul className="l10-list" id="synList">
            {groups.map((g) => (
              <li key={g.id} className="l10-row">
                <form action={saveSynonym} className="l10-inline">
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="back" value={self} />
                  <div className="field">
                    <label className="sr-only" htmlFor={`syn-${g.id}`}>คำในกลุ่ม</label>
                    <input id={`syn-${g.id}`} name="words" defaultValue={g.words.join(", ")} maxLength={800} />
                  </div>
                  <button className="btn btn-outline btn-sm" type="submit">บันทึก</button>
                </form>
                <div className="l10-row-acts">
                  <form action={deleteSynonym}>
                    <input type="hidden" name="id" value={g.id} />
                    <input type="hidden" name="back" value={self} />
                    <ConfirmSubmit title="ลบกลุ่มคำพ้อง" body={`ลบกลุ่ม “${g.words.join(", ")}”?`} confirmLabel="ลบ" className="btn btn-ghost btn-sm">
                      ลบ
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          {!groups.length && <div className="empty"><b>ยังไม่มีคำพ้อง</b>กด “เพิ่มชุดเริ่มต้น” เพื่อใส่คำที่ลูกค้าใช้บ่อย</div>}
        </section>
      </div>
    </main>
  );
}
