// หน้าคำสั่งซื้อ (หน้าแรกของหลังบ้าน) — โครงและ CSS ตามต้นแบบ, ข้อมูลจากฐานข้อมูล
// ตัวกรองทั้งหมดอยู่ใน URL (?tab=&q=&range=&page=&open=) จึงรีเฟรช/แชร์ลิงก์ได้
import {
  CARRIERS,
  RANGES,
  REJECT_REASONS,
  STATUS_LABEL,
  TABS,
  filterQuery,
  getOrderDetail,
  listOrders,
  neighbours,
  nextPending,
  orderStats,
  parseFilter,
  type OrderFilter,
} from "@/lib/admin-orders";
import { requireAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/orders";
import { AutoRefresh, ConfirmSubmit, CopyButton, DrawerKeys, SlipImage } from "../_components/AdminClient";
import { addOrderNote, approveOrder, cancelOrder, rejectOrder, reopenOrder, shipOrder } from "./order-actions";

const baht = (satang: number) =>
  "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 });
const fmt = (d: Date, opt: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) =>
  d.toLocaleString("th-TH", { ...opt, timeZone: "Asia/Bangkok" });

const ICON = {
  ok: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
  ),
  bad: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>
  ),
  warn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17v.5" /></svg>
  ),
  copy: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></svg>
  ),
  phone: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1" /></svg>
  ),
};

export default async function OrdersPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await searchParams;
  const f = parseFilter(sp);
  const open = typeof sp.open === "string" ? sp.open.slice(0, 40) : null;
  const mode = sp.mode === "reject" ? "reject" : null;
  const [list, stats] = await Promise.all([listOrders(f), orderStats()]);
  const count = (s: keyof typeof STATUS_LABEL) => stats.count[s] ?? 0;
  const allCount = Object.values(stats.count).reduce((a, b) => a + (b ?? 0), 0);
  const pend = count("PENDING_VERIFICATION");
  const firstPending = pend ? await nextPending() : null;
  const href = (patch: Parameters<typeof filterQuery>[1]) => `/admin${filterQuery(f, patch)}`;
  const startI = (list.page - 1) * f.size;

  return (
    <main className="main" id="page-orders">
      <AutoRefresh pending={pend} />
      <div className="page-head">
        <div>
          <h1>คำสั่งซื้อ</h1>
          <p>{fmt(new Date(), { dateStyle: "full" })}</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href={`/admin/orders.csv${filterQuery({ ...f, page: 1 })}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>
            ส่งออก CSV
          </a>
          {firstPending ? (
            <a className="btn btn-primary" href={`/admin${filterQuery({ ...f, tab: "PENDING_VERIFICATION", q: "", page: 1 }, { open: firstPending })}`}>
              ตรวจสลิปที่ค้างอยู่ →
            </a>
          ) : (
            <button className="btn btn-primary" type="button" disabled>
              ตรวจสลิปที่ค้างอยู่ →
            </button>
          )}
        </div>
      </div>

      <div className="kpis">
        <a className={`kpi ${pend ? "hot" : ""}`} href={href({ tab: "PENDING_VERIFICATION", page: 1 })}>
          <span>รอตรวจสลิป</span>
          <b className="num">{pend}</b>
          <small>{pend ? "ตรวจคิวเก่าสุดก่อน" : "ไม่มีงานค้าง"}</small>
        </a>
        <a className="kpi" href={href({ tab: "PAID", page: 1 })}>
          <span>ชำระแล้ว รอจัดส่ง</span>
          <b className="num">{count("PAID")}</b>
          <small>ต้องใส่เลขพัสดุ</small>
        </a>
        <div className="kpi">
          <span>ยอดขายวันนี้ (ยืนยันแล้ว)</span>
          <b className="num">{baht(stats.todaySalesSatang)}</b>
          <small>{stats.todayOrders} คำสั่งซื้อวันนี้</small>
        </div>
        <a className="kpi" href={href({ tab: "SHIPPED", page: 1 })}>
          <span>จัดส่งแล้ว</span>
          <b className="num">{count("SHIPPED")}</b>
          <small>ทั้งหมด</small>
        </a>
      </div>

      <SalesChart days={stats.days} />

      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {TABS.map(([k, l]) => (
              <a key={k} className={`tab ${f.tab === k ? "on" : ""}`} role="tab" aria-selected={f.tab === k} href={href({ tab: k, page: 1 })}>
                {l}
                <em>{k === "ALL" ? allCount : count(k)}</em>
              </a>
            ))}
          </div>
          <form className="search" role="search" action="/admin">
            {f.tab !== "PENDING_VERIFICATION" && <input type="hidden" name="tab" value={f.tab} />}
            {f.range !== "all" && <input type="hidden" name="range" value={f.range} />}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <label className="sr-only" htmlFor="q">ค้นหาคำสั่งซื้อ</label>
            <input id="q" name="q" type="search" defaultValue={f.q} placeholder="ค้นหาเลขที่, ชื่อ, เบอร์โทร, เลขพัสดุ" />
          </form>
        </div>
        <form className="toolbar2" action="/admin">
          {f.tab !== "PENDING_VERIFICATION" && <input type="hidden" name="tab" value={f.tab} />}
          {f.q && <input type="hidden" name="q" value={f.q} />}
          <span className="lbl" id="rangeLbl">ช่วงวันที่</span>
          <div className="seg" role="group" aria-labelledby="rangeLbl">
            {(["all", "today", "7", "30", "custom"] as const).map((r) => (
              <a key={r} aria-current={f.range === r ? "true" : undefined} href={href({ range: r, page: 1 })}>
                {RANGES[r]}
              </a>
            ))}
          </div>
          {f.range === "custom" && (
            <div className="date-custom">
              <input type="hidden" name="range" value="custom" />
              <label className="sr-only" htmlFor="dFrom">ตั้งแต่วันที่</label>
              <input type="date" id="dFrom" name="from" defaultValue={f.from} />
              <span>ถึง</span>
              <label className="sr-only" htmlFor="dTo">ถึงวันที่</label>
              <input type="date" id="dTo" name="to" defaultValue={f.to} />
              <button className="btn btn-outline btn-sm" type="submit">ใช้ช่วงนี้</button>
            </div>
          )}
          <span className="err-msg">{list.badRange ? "วันที่เริ่มต้องไม่อยู่หลังวันที่สิ้นสุด" : ""}</span>
        </form>

        <table className="tbl">
          <thead>
            <tr>
              <th>เลขที่ / วันที่</th>
              <th>ลูกค้า</th>
              <th>รายการ</th>
              <th className="r">ยอดรวม</th>
              <th>สถานะ</th>
              <th>ตรวจพบ</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((o) => {
              const link = href({}).replace(/^\/admin\??/, "");
              const rowHref = `/admin?${new URLSearchParams([...new URLSearchParams(link), ["open", o.orderNo]]).toString()}`;
              return (
                <tr key={o.orderNo} className={o.orderNo === open ? "sel" : ""}>
                  <td className="c-id">
                    <a className="row-link" href={rowHref}>
                      <span className="oid">{o.orderNo}</span>
                      <span className="sub">{fmt(o.createdAt)}</span>
                    </a>
                  </td>
                  <td className="c-cust">
                    <a className="row-link" href={rowHref} tabIndex={-1}>
                      {o.customerName}
                      <span className="sub">
                        {formatPhone(o.phone)} · {o.province}
                      </span>
                    </a>
                  </td>
                  <td className="c-items">
                    {o.itemCount} ชิ้น<span className="sub">{o.shippingName}</span>
                  </td>
                  <td className="c-total r num">
                    <b>{baht(o.totalSatang)}</b>
                  </td>
                  <td className="c-st">
                    <span className={`st st-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                  </td>
                  <td className="c-flags">
                    <div className="flags">
                      {o.noSlip && <span className="chip bad">ไม่มีสลิป</span>}
                      {o.check && o.check.dupOrderNos.length > 0 && <span className="chip bad">สลิปซ้ำ</span>}
                      {o.check && o.check.diffSatang !== 0 && (
                        <span className="chip warn">
                          ยอด{o.check.diffSatang > 0 ? "เกิน" : "ขาด"} {baht(Math.abs(o.check.diffSatang))}
                        </span>
                      )}
                      {o.check?.late && <span className="chip warn">วันที่โอนเก่า</span>}
                      {o.hasNote && <span className="chip gray">มีโน้ตภายใน</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.rows.length === 0 && (
          <div className="empty">
            <div className="e-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>
            </div>
            {f.q ? (
              <>
                <b>ไม่พบคำสั่งซื้อที่ตรงกับ &quot;{f.q}&quot;</b>ลองค้นด้วยเลขที่ ชื่อ หรือเบอร์โทร
              </>
            ) : f.range !== "all" && allCount ? (
              <>
                <b>ไม่มีคำสั่งซื้อในช่วงวันที่ที่เลือก</b>ลองเลือกช่วงวันที่กว้างขึ้น
                <br />
                <a className="btn btn-outline" href={href({ range: "all", page: 1 })}>
                  แสดงทุกช่วงวันที่
                </a>
              </>
            ) : f.tab === "PENDING_VERIFICATION" && allCount ? (
              <>
                <b>ไม่มีสลิปรอตรวจ</b>เยี่ยมเลย งานค้างเคลียร์หมดแล้ว
              </>
            ) : allCount ? (
              <b>ยังไม่มีคำสั่งซื้อในสถานะนี้</b>
            ) : (
              <>
                <b>ยังไม่มีคำสั่งซื้อ</b>คำสั่งซื้อจากหน้าร้านจะแสดงที่นี่
              </>
            )}
          </div>
        )}
        {list.total > 0 && (
          <div className="tbl-foot">
            <span>
              แสดง {startI + 1}–{startI + list.rows.length} จาก {list.total} รายการ
              {f.tab === "PENDING_VERIFICATION" ? " · เรียงจากเก่าสุด" : ""}
            </span>
            <div className="pager">
              <span className="pg-info">ต่อหน้า</span>
              {[10, 20, 50, 100].map((n) => (
                <a key={n} className="pg-size" href={href({ size: n, page: 1 })} aria-current={n === f.size ? "true" : undefined}>
                  {n}
                </a>
              ))}
              {list.page > 1 ? (
                <a className="icon-btn" href={href({ page: list.page - 1 })} aria-label="หน้าก่อนหน้า">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 6-6 6 6 6" /></svg>
                </a>
              ) : null}
              <span className="num">
                หน้า {list.page}/{list.pages}
              </span>
              {list.page < list.pages ? (
                <a className="icon-btn" href={href({ page: list.page + 1 })} aria-label="หน้าถัดไป">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
                </a>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {open && <OrderDrawer f={f} orderNo={open} mode={mode} done={sp.done === "1"} trackErr={sp.err === "tracking"} />}
    </main>
  );
}

/* ---------- กราฟยอดขาย 7 วัน (เฉพาะที่ยืนยันแล้ว) ---------- */
function SalesChart({ days }: { days: { start: Date; satang: number; orders: number }[] }) {
  const total = days.reduce((s, d) => s + d.satang, 0);
  const max = Math.max(...days.map((d) => d.satang), 1);
  const W = 1000, H = 230, top = 22, bottom = 30, left = 8, slot = (W - left * 2) / days.length;
  return (
    <section className="chart-panel" aria-labelledby="chTitle">
      <div className="chart-head">
        <div>
          <h2 id="chTitle">ยอดขาย 7 วันล่าสุด</h2>
          <p>เฉพาะคำสั่งซื้อที่ยืนยันแล้ว (ชำระแล้ว + จัดส่งแล้ว) ตามวันที่สั่งซื้อ</p>
        </div>
        <div className="tot">
          <b className="num">{baht(total)}</b>
          <p>{days.reduce((s, d) => s + d.orders, 0)} คำสั่งซื้อ</p>
        </div>
      </div>
      <div className="chart-wrap">
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} style={{ height: "auto" }} role="img" aria-label={`ยอดขาย 7 วันล่าสุด รวม ${baht(total)}`}>
          <line className="base" x1={0} x2={W} y1={H - bottom} y2={H - bottom} />
          {days.map((d, i) => {
            const h = ((H - top - bottom) * d.satang) / max;
            const x = left + i * slot + slot * 0.2;
            const isToday = i === days.length - 1;
            return (
              <g key={i} className="day">
                <title>{`${fmt(d.start, { weekday: "short", day: "numeric", month: "short" })}: ${baht(d.satang)} (${d.orders} คำสั่งซื้อ)`}</title>
                <rect className="bar" x={x} y={H - bottom - h} width={slot * 0.6} height={h} />
                {d.satang > 0 && (
                  <text className="vlab" x={x + slot * 0.3} y={H - bottom - h - 6} textAnchor="middle">
                    {(d.satang / 100).toLocaleString("th-TH", { notation: "compact" })}
                  </text>
                )}
                <text className={isToday ? "today" : ""} x={x + slot * 0.3} y={H - 10} textAnchor="middle">
                  {isToday ? "วันนี้" : fmt(d.start, { weekday: "short", day: "numeric" })}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/* ---------- รายละเอียดคำสั่งซื้อ / ตรวจสลิป ---------- */
async function OrderDrawer({ f, orderNo, mode, done, trackErr }: { f: OrderFilter; orderNo: string; mode: "reject" | null; done: boolean; trackErr: boolean }) {
  const o = await getOrderDetail(orderNo);
  const close = `/admin${filterQuery(f)}`;
  if (!o) {
    return (
      <div className="drawer open" aria-hidden="false">
        <a className="drawer-bg" href={close} aria-label="ปิด" />
        <section className="drawer-panel" role="dialog" aria-modal="true" aria-label="ไม่พบคำสั่งซื้อ">
          <div className="empty">
            <b>ไม่พบคำสั่งซื้อ {orderNo}</b>
            <a className="btn btn-outline" href={close}>ปิด</a>
          </div>
        </section>
      </div>
    );
  }
  const nb = await neighbours(f, o.orderNo);
  const ret = filterQuery(f, { open: o.orderNo });
  const link = (no: string | null) => (no ? `/admin${filterQuery(f, { open: no })}` : null);
  const c = o.check;
  const addrText = [o.addressLine, o.subdistrict, o.district, o.province, o.postalCode].filter(Boolean).join(" ");
  const notes = o.events.filter((e) => e.type === "NOTE");
  const itemCount = o.items.reduce((n, i) => n + i.qty, 0);
  const anomaly = c
    ? c.dupOrderNos.length
      ? `สลิปนี้ถูกใช้กับคำสั่งซื้ออื่นแล้ว (${c.dupOrderNos.join(", ")}) ยืนยันอนุมัติต่อหรือไม่?`
      : c.diffSatang
        ? `ยอดในสลิปไม่ตรงกับยอดสั่งซื้อ (${c.diffSatang > 0 ? "เกิน" : "ขาด"} ${baht(Math.abs(c.diffSatang))}) ยืนยันอนุมัติต่อหรือไม่?`
        : null
    : null;
  const preReason = c?.dupOrderNos.length ? 1 : c?.diffSatang ? 0 : 4;
  const tel = o.phone.replace(/[^\d+]/g, "");

  return (
    <div className="drawer open" aria-hidden="false">
      <DrawerKeys close={close} prev={link(nb.prev)} next={link(nb.next)} />
      <a className="drawer-bg" href={close} aria-label="ปิดรายละเอียด" tabIndex={-1} />
      <section className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="dTitle">
        <div className="d-head">
          <div>
            <h2>
              <span id="dTitle">{o.orderNo}</span>
              <CopyButton text={o.orderNo} label="คัดลอกเลขที่คำสั่งซื้อ" done={`คัดลอกเลขที่ ${o.orderNo} แล้ว`} className="icon-btn sm">
                {ICON.copy}
              </CopyButton>
            </h2>
            <span className="sub">
              <span className={`st st-${o.status}`}>{STATUS_LABEL[o.status]}</span> · {fmt(o.createdAt)}
            </span>
          </div>
          <div className="d-nav">
            {nb.prev ? (
              <a className="icon-btn" href={link(nb.prev)!} aria-label="คำสั่งซื้อก่อนหน้า">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 6-6 6 6 6" /></svg>
              </a>
            ) : null}
            {nb.next ? (
              <a className="icon-btn" href={link(nb.next)!} aria-label="คำสั่งซื้อถัดไป">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 6 6 6-6 6" /></svg>
              </a>
            ) : null}
            <a className="icon-btn" href={close} aria-label="ปิด">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </a>
          </div>
        </div>

        <div className="d-body">
          <div className="d-col">
            <div className="box">
              <h3>
                สลิปการโอน {o.slipCount > 1 && <span className="sub">ครั้งที่ {o.slipCount}</span>}
              </h3>
              {o.slip ? (
                <>
                  <SlipImage src={`/admin/slips/${o.slip.id}`} alt={`สลิปของ ${o.orderNo}`} />
                  <div className="slip-meta">
                    <span>
                      ยอดที่ลูกค้าแจ้ง: <b>{baht(o.slip.declaredAmountSatang)}</b>
                    </span>
                    <span>อัปโหลด: {fmt(o.slip.uploadedAt)}</span>
                    <span>
                      SHA-256: <code>{o.slip.sha256}</code>
                    </span>
                  </div>
                </>
              ) : (
                <div className="empty">{o.status === "AWAITING_SLIP" ? "ลูกค้ายังไม่แนบสลิป" : "ไม่มีภาพสลิป"}</div>
              )}
            </div>
          </div>

          <div className="d-col">
            {done && (
              <div className="ck ok">
                {ICON.ok}
                <div>
                  <b>เคลียร์สลิปที่รอตรวจหมดแล้ว</b>
                </div>
              </div>
            )}
            {o.slip && c && (
              <div className="box">
                <h3>ตรวจอัตโนมัติ</h3>
                <div className="checks">
                  {c.diffSatang === 0 ? (
                    <div className="ck ok">{ICON.ok}<div><b>ยอดในสลิปตรงกับยอดสั่งซื้อ</b><small>{baht(o.slip.declaredAmountSatang)}</small></div></div>
                  ) : (
                    <div className="ck bad">
                      {ICON.bad}
                      <div>
                        <b>ยอด{c.diffSatang > 0 ? "เกิน" : "ขาด"} {baht(Math.abs(c.diffSatang))}</b>
                        <small>สลิป {baht(o.slip.declaredAmountSatang)} · ต้องชำระ {baht(o.totalSatang)}</small>
                      </div>
                    </div>
                  )}
                  {c.dupOrderNos.length ? (
                    <div className="ck bad">
                      {ICON.bad}
                      <div>
                        <b>สลิปนี้ถูกใช้กับคำสั่งซื้ออื่นแล้ว</b>
                        <small>
                          {c.dupOrderNos.map((no, i) => (
                            <span key={no}>
                              {i > 0 && ", "}
                              <a className="jump" href={`/admin${filterQuery({ ...f, tab: "ALL", q: "", page: 1 }, { open: no })}`}>{no}</a>
                            </span>
                          ))}
                        </small>
                      </div>
                    </div>
                  ) : (
                    <div className="ck ok">{ICON.ok}<div><b>ไม่พบสลิปซ้ำ</b><small>ตรวจกับคำสั่งซื้อทั้งหมด {o.totalOrders} รายการ</small></div></div>
                  )}
                  {c.late ? (
                    <div className="ck warn">{ICON.warn}<div><b>วันที่โอนเก่ากว่า 3 วันก่อนสั่งซื้อ</b><small>{fmt(o.slip.transferredAt)}</small></div></div>
                  ) : (
                    <div className="ck ok">{ICON.ok}<div><b>เวลาโอน</b><small>{fmt(o.slip.transferredAt)}</small></div></div>
                  )}
                  {o.status === "PENDING_VERIFICATION" && (
                    <div className="ck warn">{ICON.warn}<div><b>เช็กยอดเข้าบัญชีจริงในแอปธนาคาร</b><small>ระบบตรวจได้แค่ข้อมูลบนสลิป ยืนยันการรับเงินจริงก่อนอนุมัติเสมอ</small></div></div>
                  )}
                </div>
              </div>
            )}

            {o.status === "PENDING_VERIFICATION" && mode !== "reject" && (
              <div className="act">
                <h3>ผลการตรวจสลิป</h3>
                <form action={approveOrder} className="act-row">
                  <input type="hidden" name="orderNo" value={o.orderNo} />
                  <input type="hidden" name="ret" value={ret} />
                  <ConfirmSubmit className="btn btn-ok" title="ระบบพบความผิดปกติในสลิปนี้" body={anomaly} confirmLabel="ยืนยันอนุมัติ">
                    อนุมัติการชำระเงิน
                  </ConfirmSubmit>
                  <a className="btn btn-danger" href={`/admin${filterQuery(f, { open: o.orderNo, mode: "reject" })}`}>
                    ปฏิเสธสลิป
                  </a>
                </form>
                <p className="notify" style={{ marginTop: 12 }}>แจ้งลูกค้าทาง LINE อัตโนมัติจะเปิดใช้ในขั้นถัดไป — ตอนนี้ลูกค้าดูสถานะได้ที่หน้าติดตามคำสั่งซื้อ</p>
              </div>
            )}
            {o.status === "PENDING_VERIFICATION" && mode === "reject" && (
              <div className="act">
                <h3>ปฏิเสธสลิป</h3>
                <form action={rejectOrder} className="reject-form">
                  <input type="hidden" name="orderNo" value={o.orderNo} />
                  <input type="hidden" name="ret" value={ret} />
                  <div className="field">
                    <label htmlFor="rReason">เหตุผล (ลูกค้าจะเห็นข้อความนี้)</label>
                    <select id="rReason" name="reason" defaultValue={REJECT_REASONS[preReason]} autoFocus>
                      {REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="rNote">ข้อความเพิ่มเติม (ไม่บังคับ)</label>
                    <textarea id="rNote" name="note" maxLength={300} placeholder="เช่น กรุณาโอนเพิ่มอีก 100 บาท แล้วแนบสลิปใหม่" />
                  </div>
                  <div className="act-row">
                    <a className="btn btn-outline" href={`/admin${ret}`}>ยกเลิก</a>
                    <button className="btn btn-danger" type="submit">ยืนยันปฏิเสธ</button>
                  </div>
                </form>
              </div>
            )}
            {o.status === "PAID" && (
              <div className="act">
                <h3>จัดส่งสินค้า</h3>
                <form action={shipOrder} className="ship-form">
                  <input type="hidden" name="orderNo" value={o.orderNo} />
                  <input type="hidden" name="ret" value={ret} />
                  <div className="two">
                    <div className="field">
                      <label htmlFor="carrier">ขนส่ง</label>
                      <select id="carrier" name="carrier">{CARRIERS.map((c) => <option key={c}>{c}</option>)}</select>
                    </div>
                    <div className="field">
                      <label htmlFor="trackNo">เลขพัสดุ</label>
                      <input id="trackNo" name="trackingNo" autoComplete="off" required minLength={6} placeholder="สแกนหรือพิมพ์เลขพัสดุ" style={trackErr ? { borderColor: "var(--c-err)" } : undefined} />
                    </div>
                  </div>
                  {trackErr && <p className="err-msg" role="alert">กรุณากรอกเลขพัสดุให้ถูกต้อง (ตัวอักษร/ตัวเลขอย่างน้อย 6 ตัว)</p>}
                  <div className="act-row">
                    <button className="btn btn-dark" type="submit">บันทึกและแจ้งจัดส่ง</button>
                  </div>
                </form>
              </div>
            )}
            {o.status === "SHIPPED" && (
              <div className="box">
                <h3>การจัดส่ง</h3>
                <div className="track">
                  {o.carrier}
                  <br />
                  <b className="num">{o.trackingNo}</b>
                </div>
              </div>
            )}
            {o.status === "REJECTED" && (
              <div className="box">
                <h3>สลิปไม่ผ่าน</h3>
                <p style={{ fontSize: 14 }}>{o.rejectReason}</p>
                <p className="sub" style={{ margin: "6px 0 12px" }}>
                  รอลูกค้าแนบสลิปใหม่ (หน้าติดตามคำสั่งซื้อ) — เมื่อมีสลิปใหม่จะกลับเป็น &quot;รอตรวจสลิป&quot; อัตโนมัติ
                </p>
                <div className="act-row">
                  <form action={reopenOrder}>
                    <input type="hidden" name="orderNo" value={o.orderNo} />
                    <input type="hidden" name="ret" value={ret} />
                    <button className="btn btn-outline" type="submit">ตรวจสลิปนี้ใหม่อีกครั้ง</button>
                  </form>
                  <form action={cancelOrder}>
                    <input type="hidden" name="orderNo" value={o.orderNo} />
                    <input type="hidden" name="ret" value={ret} />
                    <ConfirmSubmit className="btn btn-danger" title="ยกเลิกคำสั่งซื้อ?" body={`ยกเลิก ${o.orderNo} — ลูกค้าจะแนบสลิปใหม่ไม่ได้อีก`} confirmLabel="ยกเลิกคำสั่งซื้อ">
                      ยกเลิกคำสั่งซื้อ
                    </ConfirmSubmit>
                  </form>
                </div>
              </div>
            )}
            {o.status === "AWAITING_SLIP" && (
              <div className="box">
                <h3>รอลูกค้าโอนและแนบสลิป</h3>
                <p className="sub" style={{ margin: "6px 0 12px" }}>ลูกค้ากรอกที่อยู่แล้วแต่ยังไม่แนบสลิป</p>
                <form action={cancelOrder}>
                  <input type="hidden" name="orderNo" value={o.orderNo} />
                  <input type="hidden" name="ret" value={ret} />
                  <ConfirmSubmit className="btn btn-danger" title="ยกเลิกคำสั่งซื้อ?" body={`ยกเลิก ${o.orderNo}`} confirmLabel="ยกเลิกคำสั่งซื้อ">
                    ยกเลิกคำสั่งซื้อ
                  </ConfirmSubmit>
                </form>
              </div>
            )}

            <div className="box">
              <h3>
                รายการสินค้า <span className="sub">{itemCount} ชิ้น</span>
              </h3>
              <div className="items">
                {o.items.map((i) => (
                  <div className="it" key={i.id}>
                    <span>{i.nameSnapshot}</span>
                    <span className="q">× {i.qty}</span>
                    <b className="num">{baht(i.priceSatang * i.qty)}</b>
                  </div>
                ))}
              </div>
              <div className="totals">
                <div><span>ค่าสินค้า</span><b className="num">{baht(o.subtotalSatang)}</b></div>
                <div><span>ค่าจัดส่ง ({o.shippingName})</span><b className="num">{o.shippingSatang ? baht(o.shippingSatang) : "ฟรี"}</b></div>
                <div className="g"><span>ยอดชำระ</span><b className="num">{baht(o.totalSatang)}</b></div>
              </div>
            </div>

            <div className="box">
              <h3>ผู้รับ</h3>
              <div className="kv">
                <span>ชื่อ</span><b>{o.customerName}</b>
                <span>โทร</span><a href={`tel:${tel}`} className="num" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>{formatPhone(o.phone)}</a>
                {o.email && (<><span>อีเมล</span><span style={{ color: "inherit" }}>{o.email}</span></>)}
                <span>ที่อยู่</span><span style={{ color: "inherit" }}>{addrText}</span>
              </div>
              <div className="mini-acts">
                <CopyButton text={`${o.customerName} ${formatPhone(o.phone)}\n${addrText}`} done="คัดลอกชื่อ เบอร์โทร และที่อยู่แล้ว">
                  {ICON.copy} คัดลอกที่อยู่
                </CopyButton>
                <a className="btn btn-outline btn-sm" href={`tel:${tel}`}>{ICON.phone} โทรหาลูกค้า</a>
              </div>
              {o.note && (
                <div className="note-box"><b>หมายเหตุจากลูกค้า:</b> {o.note}</div>
              )}
            </div>

            <div className="box inote">
              <h3>โน้ตภายใน <small>ลูกค้าไม่เห็น</small></h3>
              {notes.length > 0 && (
                <ul className="inote-list">
                  {[...notes].reverse().map((n) => (
                    <li key={n.id}>
                      {n.note}
                      <small>{fmt(n.createdAt)} · {n.admin?.displayName ?? "—"}</small>
                    </li>
                  ))}
                </ul>
              )}
              <form action={addOrderNote}>
                <input type="hidden" name="orderNo" value={o.orderNo} />
                <input type="hidden" name="ret" value={ret} />
                <label className="sr-only" htmlFor="noteText">เพิ่มโน้ตภายใน</label>
                <textarea id="noteText" name="text" required maxLength={500} placeholder="เช่น โทรยืนยันกับลูกค้าแล้ว รอโอนส่วนต่าง" style={{ border: "1.5px solid var(--c-line)", padding: "10px 12px", minHeight: 64, width: "100%", outline: "none", resize: "vertical" }} />
                <div className="row">
                  <span className="cnt">สูงสุด 500 ตัวอักษร</span>
                  <button className="btn btn-dark btn-sm" type="submit">บันทึกโน้ต</button>
                </div>
              </form>
            </div>

            <div className="box">
              <h3>ประวัติ</h3>
              <ul className="timeline">
                {[...o.events].reverse().map((ev) => (
                  <li key={ev.id} className={`t-${ev.type}`}>
                    {ev.type === "NOTE" ? `โน้ตภายใน: ${ev.note}` : ev.note ?? STATUS_LABEL[o.status]}
                    <small>{fmt(ev.createdAt)} · {ev.admin?.displayName ?? "ลูกค้า/ระบบ"}</small>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
