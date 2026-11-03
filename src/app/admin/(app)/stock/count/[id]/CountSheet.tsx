"use client";
// ใบนับสต็อก: กรอกยอดนับ (Enter = ไปช่องถัดไป) · ปุ่ม "ตรง" เติมยอดในระบบ · ส่วนต่างคำนวณทันที · กรอง ยังไม่นับ/ยอดต่าง + ค้นหา
// ฟอร์มเดียว: บันทึกยอดนับ (เก็บไว้ทำต่อ) หรือ บันทึกแล้วปรับสต็อก
import { useMemo, useState } from "react";
import { ConfirmSubmit } from "../../../../_components/AdminClient";

export type CountRow = { productId: string; sku: string; name: string; cat: string; expected: number; current: number; counted: number | null; applied: number | null };
type Filter = "all" | "todo" | "diff";

export function CountSheet({ id, rows, open, action }: { id: string; rows: CountRow[]; open: boolean; action: (f: FormData) => Promise<void> }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.productId, r.counted === null ? "" : String(r.counted)])));
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const num = (pid: string) => (vals[pid] === "" || !/^\d+$/.test(vals[pid].replace(/,/g, "")) ? null : Number(vals[pid].replace(/,/g, "")));
  const stats = useMemo(() => {
    let done = 0, diff = 0, plus = 0, minus = 0;
    for (const r of rows) {
      const n = num(r.productId);
      if (n === null) continue;
      done++;
      if (n !== r.expected) { diff++; if (n > r.expected) plus += n - r.expected; else minus += r.expected - n; }
    }
    return { done, diff, plus, minus };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals, rows]);
  const shown = rows.filter((r) => {
    const n = num(r.productId);
    if (filter === "todo" && n !== null) return false;
    if (filter === "diff" && (n === null || n === r.expected)) return false;
    const k = q.trim().toLowerCase();
    return !k || r.name.toLowerCase().includes(k) || r.sku.toLowerCase().includes(k);
  });
  const next = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = [...document.querySelectorAll<HTMLInputElement>("#countSheet input[data-count]")];
    all[all.indexOf(e.currentTarget) + 1]?.focus();
  };

  return (
    <form action={action} id="countSheet">
      <input type="hidden" name="id" value={id} />
      <div className="ar-kpis">
        <div className="ar-kpi on"><span>นับแล้ว</span><b className="num" id="cntDone">{stats.done}/{rows.length}</b><small>{rows.length - stats.done ? `เหลือ ${rows.length - stats.done} รายการ` : "ครบทุกรายการ"}</small></div>
        <div className="ar-kpi"><span>ยอดต่างจากระบบ</span><b className={`num${stats.diff ? " owe" : ""}`} id="cntDiff">{stats.diff} รายการ</b><small>เกิน +{stats.plus} · ขาด −{stats.minus} ชิ้น</small></div>
      </div>
      <section className="panel">
        <div className="toolbar cnt-tools">
          <div className="tabs" role="tablist">
            {([["all", "ทั้งหมด"], ["todo", "ยังไม่นับ"], ["diff", "ยอดต่าง"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} className={`tab ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <div className="search">
            <label className="sr-only" htmlFor="cntQ">ค้นหาสินค้าในรอบนับ</label>
            <input id="cntQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อหรือรหัสสินค้า" />
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl cnt-tbl">
            <thead><tr><th>สินค้า</th><th className="r">ในระบบ (ตอนเปิดรอบ)</th><th className="r cnt-c">นับได้</th><th className="r">ส่วนต่าง</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const n = num(r.productId);
                const d = n === null ? null : n - r.expected;
                const hide = !shown.includes(r);
                return (
                  <tr key={r.productId} data-sku={r.sku} hidden={hide} className={d ? "cnt-off" : ""}>
                    <td>{r.name}<span className="sub">{r.sku}{r.cat ? ` · ${r.cat}` : ""}{open && r.current !== r.expected ? ` · ตอนนี้ ${r.current} (มีขาย/รับของระหว่างนับ)` : ""}</span></td>
                    <td className="r num">{r.expected}</td>
                    <td className="r cnt-c">
                      {open ? (
                        <span className="cnt-in">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVals({ ...vals, [r.productId]: String(r.expected) })} aria-label={`ยอดตรงกับระบบ ${r.sku}`} data-tip="ตรงกับระบบ">=</button>
                          <label className="sr-only" htmlFor={`c_${r.productId}`}>ยอดนับได้ {r.sku}</label>
                          <input id={`c_${r.productId}`} data-count name={`c_${r.productId}`} inputMode="numeric" value={vals[r.productId]} onKeyDown={next} onChange={(e) => setVals({ ...vals, [r.productId]: e.target.value })} />
                        </span>
                      ) : (
                        <b className="num">{r.counted ?? "—"}</b>
                      )}
                    </td>
                    <td className={`r num${d ? " owe" : ""}`}>{d === null ? <span className="sub">—</span> : d > 0 ? `+${d}` : d}{!open && r.applied !== null && r.applied !== d ? <span className="sub">ปรับจริง {r.applied > 0 ? "+" : ""}{r.applied}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!shown.length && <div className="empty"><b>ไม่มีรายการตามตัวกรอง</b></div>}
      </section>
      {open && (
        <div className="cnt-bar">
          <span className="sub">นับแล้ว {stats.done}/{rows.length} · ต่าง {stats.diff} รายการ</span>
          <button className="btn btn-outline" type="submit" name="intent" value="save">บันทึกยอดนับ (ทำต่อทีหลังได้)</button>
          <ConfirmSubmit className="btn btn-primary" name="intent" value="apply" title="ปรับสต็อกตามยอดนับ?" body={`ปรับ ${stats.done} รายการที่นับแล้ว (ต่าง ${stats.diff} รายการ: +${stats.plus} / −${stats.minus} ชิ้น) รายการที่ยังไม่นับจะไม่ถูกแตะ — ปรับแล้วรอบนี้จะปิด`} confirmLabel="ปรับสต็อก" disabled={!stats.done}>
            ปรับสต็อกตามยอดนับ
          </ConfirmSubmit>
        </div>
      )}
    </form>
  );
}
