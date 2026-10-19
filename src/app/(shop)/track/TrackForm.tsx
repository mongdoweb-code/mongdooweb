"use client";
// ฟอร์มติดตามคำสั่งซื้อ — ส่งไปตรวจที่ server (actions.ts) แล้วแสดงสถานะ
import { useActionState } from "react";
import { trackOrder, type TrackState } from "./actions";

const STATUS: Record<string, string> = {
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
