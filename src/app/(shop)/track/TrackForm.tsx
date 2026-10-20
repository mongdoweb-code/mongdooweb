"use client";
// ฟอร์มติดตามคำสั่งซื้อ — ต้องยืนยันด้วย "เลขที่ + เบอร์โทร" (ตรวจที่ server ใน actions.ts) แล้วแสดง
// ไทม์ไลน์สถานะ, เลขพัสดุ + ลิงก์ติดตามของขนส่ง, ใบเสร็จ (ลิงก์ลับ) และแนบสลิป (ใหม่) พร้อมย่อรูปก่อนส่ง
import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IMAGE_TYPES, compressImage, fmtSize, uploadWithProgress } from "../_lot2/compress";
import { trackOrder, type TrackState, type TrackedOrder } from "./actions";

const STATUS: Record<string, string> = {
  AWAITING_SLIP: "รอโอนเงินและแนบสลิป",
  PENDING_VERIFICATION: "รอตรวจสลิป",
  PAID: "ชำระเงินแล้ว · กำลังเตรียมจัดส่ง",
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
  EDITED: "แก้ไขข้อมูลจัดส่ง",
  REFUNDED: "คืนเงิน",
};
const baht = (n: number) => "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const day = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

/** ขั้นตอน 4 ขั้น: สั่งซื้อ → ชำระเงิน → ตรวจสลิป → จัดส่ง */
function steps(o: TrackedOrder) {
  const order = ["AWAITING_SLIP", "PENDING_VERIFICATION", "PAID", "SHIPPED"];
  const at = o.status === "REJECTED" ? 1 : order.indexOf(o.status) + 1; // จำนวนขั้นที่ผ่านแล้ว
  const labels = ["สั่งซื้อ", o.status === "REJECTED" ? "แนบสลิปใหม่" : "ชำระเงิน", "ตรวจสลิป", "จัดส่ง"];
  return labels.map((label, i) => {
    let cls = "";
    if (o.status === "CANCELLED") cls = i === 0 ? "done" : "";
    else if (o.status === "SHIPPED" || i < at) cls = "done";
    else if (i === at) cls = o.status === "REJECTED" ? "now bad" : "now";
    return { label, cls };
  });
}

export function TrackForm() {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrder, {});
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const auto = useRef(false);
  const o = state.order;
  const qNo = (params.get("no") ?? "").slice(0, 40);

  // มาจากหน้าสั่งซื้อสำเร็จในแท็บเดียวกัน → กรอกเบอร์ให้และค้นหาอัตโนมัติ (เก็บใน sessionStorage เท่านั้น)
  useEffect(() => {
    if (auto.current || !qNo) return;
    auto.current = true;
    try {
      const last = JSON.parse(sessionStorage.getItem("mdw_last_order") || "null") as { no?: string; phone?: string } | null;
      if (last?.no === qNo && last.phone && phoneRef.current) {
        phoneRef.current.value = last.phone;
        formRef.current?.requestSubmit();
      }
    } catch {}
  }, [qNo]);

  return (
    <>
      <form className="track-form" action={action} ref={formRef}>
        <div className="field">
          <label htmlFor="orderNo">เลขที่คำสั่งซื้อ</label>
          <input id="orderNo" name="orderNo" required placeholder="เช่น MDW-261017-8288" defaultValue={state.orderNo ?? qNo} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="phone">เบอร์โทรที่ใช้สั่งซื้อ</label>
          <input id="phone" name="phone" ref={phoneRef} required inputMode="tel" placeholder="08X-XXX-XXXX" defaultValue={state.phone} autoComplete="tel" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "กำลังค้นหา…" : "ตรวจสถานะ"}
        </button>
      </form>
      <div aria-live="polite">
        {state.error && <p className="form-error" role="alert">{state.error}</p>}
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

            <ol className="trk-steps" aria-label="ขั้นตอนคำสั่งซื้อ">
              {steps(o).map((s, i) => (
                <li key={i} className={s.cls} aria-current={s.cls.includes("now") ? "step" : undefined}>
                  {s.label}
                </li>
              ))}
            </ol>

            {o.status === "CANCELLED" && <p className="trk-alert">คำสั่งซื้อนี้ถูกยกเลิก{o.cancelReason ? ` — ${o.cancelReason}` : ""} หากมีข้อสงสัยกรุณาติดต่อร้านทาง LINE</p>}
            {o.rejectReason && <p className="trk-alert">สลิปไม่ผ่านการตรวจ: {o.rejectReason} — กรุณาแนบสลิปใหม่ด้านล่าง</p>}

            {o.trackingNo && (
              <div className="trk-ship">
                <div>
                  <small>
                    เลขพัสดุ{o.carrier ? ` · ${o.carrier}` : ""}
                    {o.shippedAt ? ` · ส่งเมื่อ ${day(o.shippedAt)}` : ""}
                  </small>
                  <b>{o.trackingNo}</b>
                </div>
                {o.trackUrl ? (
                  <a className="btn btn-primary btn-sm" href={o.trackUrl} target="_blank" rel="noopener noreferrer">
                    ติดตามพัสดุกับ{o.carrier ? ` ${o.carrier}` : "ขนส่ง"}
                  </a>
                ) : (
                  <button className="btn btn-outline btn-sm" type="button" onClick={() => navigator.clipboard?.writeText(o.trackingNo!)}>
                    คัดลอกเลขพัสดุ
                  </button>
                )}
              </div>
            )}

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
                <span>{o.shippingBaht ? baht(o.shippingBaht) : "ส่งฟรี"}</span>
              </div>
              <div className="row">
                <b>ยอดรวม</b>
                <b>{baht(o.totalBaht)}</b>
              </div>
            </div>

            <div className="trk-docs">
              <h3>ใบเสร็จรับเงิน{o.taxInvoice ? " / ใบกำกับภาษี" : ""}</h3>
              {o.receipts.length ? (
                <ul>
                  {o.receipts.map((r) => (
                    <li key={r.docNo}>
                      <span>
                        {r.docNo}
                        {r.issueDate ? ` · ${day(r.issueDate)}` : ""} · {baht(r.amountBaht)}
                      </span>
                      <a href={r.url} target="_blank" rel="noopener">
                        ดู / ดาวน์โหลด PDF
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sec-sub" style={{ fontSize: 14 }}>
                  ร้านจะออกใบเสร็จหลังตรวจสลิปผ่าน — กลับมาดาวน์โหลดได้ที่หน้านี้
                </p>
              )}
            </div>

            {(o.status === "REJECTED" || o.status === "AWAITING_SLIP") && state.phone && (
              <SlipUpload orderNo={o.orderNo} phone={state.phone} totalBaht={o.totalBaht} onDone={() => formRef.current?.requestSubmit()} />
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

/* แนบสลิป (ใหม่) — ใช้ API เดียวกับหน้าชำระเงิน ต้องใช้เบอร์โทรที่สั่งซื้อ · ย่อรูปใหญ่ก่อนส่ง + แถบความคืบหน้า */
function SlipUpload({ orderNo, phone, totalBaht, onDone }: { orderNo: string; phone: string; totalBaht: number; onDone: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ f: File; url: string; orig: number } | null>(null);
  const [prep, setPrep] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

  async function pick(f: File | undefined) {
    setMsg(null);
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) return setMsg({ ok: false, text: "รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP" });
    if (f.size > 30 * 1024 * 1024) return setMsg({ ok: false, text: "ไฟล์ใหญ่เกิน 30 MB กรุณาแคปหน้าจอสลิปแล้วแนบใหม่" });
    setPrep(true);
    let out = f;
    try {
      out = await compressImage(f);
    } catch {}
    setPrep(false);
    if (out.size > 5 * 1024 * 1024) return setMsg({ ok: false, text: "ย่อรูปไม่สำเร็จ ไฟล์ยังใหญ่เกิน 5 MB" });
    setFile({ f: out, url: URL.createObjectURL(out), orig: f.size });
  }

  return (
    <form
      className="trk-slip"
      id="slip"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return setMsg({ ok: false, text: "กรุณาเลือกภาพสลิป" });
        const f = new FormData(e.currentTarget);
        const fd = new FormData();
        fd.append("phone", phone);
        fd.append("slip", file.f, file.f.name);
        fd.append("paidAt", `${f.get("date")}T${f.get("time")}`);
        fd.append("amount", String(f.get("amount")));
        setBusy(true);
        setProgress(0);
        const res = await uploadWithProgress(`/api/orders/${encodeURIComponent(orderNo)}/slip`, fd, setProgress);
        setBusy(false);
        setProgress(null);
        if (res.ok) {
          setMsg({ ok: true, text: "ได้รับสลิปแล้ว ทีมงานจะตรวจสอบให้โดยเร็ว" });
          setTimeout(onDone, 800);
        } else setMsg({ ok: false, text: String(res.data.error ?? (res.status === 0 ? "เชื่อมต่อไม่ได้ กรุณาลองใหม่" : "ส่งสลิปไม่สำเร็จ")) });
      }}
    >
      <h3 className="trk-sec-h">แนบสลิปการโอน (ยอด {baht(totalBaht)})</h3>
      {msg?.ok ? (
        <p role="status">{msg.text}</p>
      ) : (
        <div className="track-form">
          <div className="field full">
            <label htmlFor="slipFile">ภาพสลิป (JPG, PNG, WEBP · รูปใหญ่ระบบย่อให้อัตโนมัติ)</label>
            <input id="slipFile" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void pick(e.target.files?.[0])} style={{ paddingTop: 12 }} disabled={prep} />
            {prep && <p className="sec-sub" style={{ fontSize: 13 }}>กำลังย่อรูป…</p>}
            {file && (
              <div className="preview" style={{ marginTop: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.url} alt="ตัวอย่างสลิปที่จะส่ง" width={64} height={84} />
                <span>{file.f.size < file.orig ? `ย่อจาก ${fmtSize(file.orig)} เหลือ ${fmtSize(file.f.size)}` : fmtSize(file.f.size)}</span>
              </div>
            )}
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
          <button className="btn btn-primary" type="submit" disabled={busy || prep}>
            {busy ? "กำลังส่ง…" : "ส่งสลิป"}
          </button>
          {progress != null && (
            <div className="up-bar full" role="progressbar" aria-label="กำลังส่งสลิป" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          {msg && !msg.ok && (
            <p className="form-error full" role="alert">
              {msg.text}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
