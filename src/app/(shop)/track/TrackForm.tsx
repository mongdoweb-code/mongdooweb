"use client";
// ฟอร์มติดตามคำสั่งซื้อ — ส่งไปตรวจที่ server (actions.ts) แล้วแสดงสถานะ
import { useActionState, useState } from "react";
import { trackOrder, type TrackState } from "./actions";

const STATUS: Record<string, string> = {
  AWAITING_SLIP: "รอแนบสลิปการโอน",
  PENDING_VERIFICATION: "รอตรวจสลิป",
  PAID: "ชำระเงินแล้ว · รอจัดส่ง",
  SHIPPED: "จัดส่งแล้ว",
  REJECTED: "สลิปไม่ผ่าน · กรุณาแนบสลิปใหม่",
  CANCELLED: "ยกเลิกแล้ว",
};
const EVENT: Record<string, string> = {
  CREATED: "สั่งซื้อ",
  SLIP_UPLOADED: "แนบสลิป",
  APPROVED: "ตรวจสลิปผ่าน",
  REJECTED: "สลิปไม่ผ่าน",
  REOPENED: "เปิดตรวจใหม่",
  SHIPPED: "จัดส่ง",
  CANCELLED: "ยกเลิก",
};
const baht = (n: number) => "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: n % 1 ? 2 : 0 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export function TrackForm() {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrder, {});
  const o = state.order;
  return (
    <>
      <form className="track-form" action={action}>
        <div className="field">
          <label htmlFor="orderNo">เลขที่คำสั่งซื้อ</label>
          <input id="orderNo" name="orderNo" required placeholder="เช่น MDW-261017-8288" defaultValue={state.orderNo} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="phone">เบอร์โทรที่ใช้สั่งซื้อ</label>
          <input id="phone" name="phone" required inputMode="tel" placeholder="08X-XXX-XXXX" defaultValue={state.phone} autoComplete="tel" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "กำลังค้นหา…" : "ตรวจสถานะ"}
        </button>
      </form>
      <div aria-live="polite">
        {state.error && <p className="form-error">{state.error}</p>}
        {o && (
          <div className="order-card" role="region" aria-label={`คำสั่งซื้อ ${o.orderNo}`}>
            <header>
              <div>
                <small>คำสั่งซื้อ</small>
                <div className="st">{o.orderNo}</div>
              </div>
              <div>
                <small>สถานะ</small>
                <div className="st">{STATUS[o.status] ?? o.status}</div>
              </div>
            </header>
            <div className="rows">
              {o.items.map((i, k) => (
                <div className="row" key={k}>
                  <span>
                    {i.name} × {i.qty}
                  </span>
                  <span>{baht(i.lineBaht)}</span>
                </div>
              ))}
              <div className="row">
                <span>ค่าจัดส่ง ({o.shippingName})</span>
                <span>{baht(o.shippingBaht)}</span>
              </div>
              <div className="row">
                <b>ยอดรวม</b>
                <b>{baht(o.totalBaht)}</b>
              </div>
              {o.trackingNo && (
                <div className="row">
                  <span>เลขพัสดุ {o.carrier ? `(${o.carrier})` : ""}</span>
                  <b>{o.trackingNo}</b>
                </div>
              )}
              {o.rejectReason && (
                <div className="row">
                  <span>เหตุผลที่สลิปไม่ผ่าน</span>
                  <span>{o.rejectReason}</span>
                </div>
              )}
            </div>
            {(o.status === "REJECTED" || o.status === "AWAITING_SLIP") && state.phone && (
              <SlipUpload orderNo={o.orderNo} phone={state.phone} totalBaht={o.totalBaht} />
            )}
            {o.events.length > 0 && (
              <ol className="timeline" aria-label="ประวัติคำสั่งซื้อ">
                {o.events.map((e, k) => (
                  <li key={k}>
                    <time dateTime={e.at}>{when(e.at)}</time>
                    <span>{EVENT[e.type] ?? e.type}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* แนบสลิป (ใหม่) — ใช้ API เดียวกับหน้าชำระเงิน ต้องใช้เบอร์โทรที่สั่งซื้อ */
function SlipUpload({ orderNo, phone, totalBaht }: { orderNo: string; phone: string; totalBaht: number }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  return (
    <form
      className="rows"
      style={{ borderTop: "1px solid var(--c-line)", paddingBottom: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const fd = new FormData();
        fd.append("phone", phone);
        fd.append("slip", f.get("slip") as File);
        fd.append("paidAt", `${f.get("date")}T${f.get("time")}`);
        fd.append("amount", String(f.get("amount")));
        setBusy(true);
        try {
          const res = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/slip`, { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          setMsg(res.ok ? { ok: true, text: "ได้รับสลิปแล้ว ทีมงานจะตรวจสอบให้ — กด “ตรวจสถานะ” อีกครั้งเพื่อดูสถานะล่าสุด" } : { ok: false, text: data.error ?? "ส่งสลิปไม่สำเร็จ" });
        } catch {
          setMsg({ ok: false, text: "เชื่อมต่อไม่ได้ กรุณาลองใหม่" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 style={{ margin: "14px 0 10px", fontSize: 16 }}>แนบสลิปการโอน (ยอด {baht(totalBaht)})</h3>
      {msg?.ok ? (
        <p role="status">{msg.text}</p>
      ) : (
        <div className="track-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="slipFile">ภาพสลิป (JPG, PNG, WEBP ไม่เกิน 5 MB)</label>
            <input id="slipFile" name="slip" type="file" accept="image/jpeg,image/png,image/webp" required style={{ paddingTop: 12 }} />
          </div>
          <div className="field">
            <label htmlFor="slipDate">วันที่โอน</label>
            <input id="slipDate" name="date" type="date" required max={today} defaultValue={today} />
          </div>
          <div className="field">
            <label htmlFor="slipTime">เวลาที่โอน</label>
            <input id="slipTime" name="time" type="time" required />
          </div>
          <div className="field">
            <label htmlFor="slipAmt">ยอดที่โอน (บาท)</label>
            <input id="slipAmt" name="amount" inputMode="decimal" required defaultValue={totalBaht.toFixed(2)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "กำลังส่ง…" : "ส่งสลิป"}
          </button>
          {msg && !msg.ok && <p className="form-error" style={{ gridColumn: "1 / -1" }}>{msg.text}</p>}
        </div>
      )}
    </form>
  );
}
