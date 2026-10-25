"use client";
// หน้าเอกสารฝั่งลูกค้า: แผ่น A4 (พิมพ์/PDF) + แผงดำเนินการ — ใบเสนอราคา: ยืนยันออนไลน์ · ใบแจ้งหนี้: QR ยอดคงค้าง + แนบสลิป
import { useActionState, useEffect, useState } from "react";
import type { DocView } from "@/lib/doc-render";
import { DocSheets } from "@/app/admin/_components/DocSheets";
import { IMAGE_TYPES, compressImage, fmtSize, uploadWithProgress } from "@/app/(shop)/_lot2/compress";
import { acceptQuoteAction, type AcceptState } from "./actions";
import "./doc-online.css";

type Slip = { id: string; amountSatang: number; at: string; status: string; rejectReason: string | null };
type Props = {
  view: DocView; id: string; token: string; type: "QUOTATION" | "INVOICE"; status: string; expired: boolean;
  acceptedBy: string | null; acceptedAt: string | null; grandSatang: number; outstandingSatang: number; paidSatang: number;
  qr: string | null; promptpayName: string; slips: Slip[];
};

const baht = (satang: number) => "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const SLIP_ST: Record<string, string> = { PENDING: "รอร้านตรวจ", ACCEPTED: "ผ่าน · ออกใบเสร็จแล้ว", REJECTED: "ไม่ผ่าน" };

export function DocOnlineView(p: Props) {
  const [pages, setPages] = useState(0);
  const title = p.view.no ?? (p.type === "QUOTATION" ? "ใบเสนอราคา" : "ใบแจ้งหนี้");
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <div className="pp">
      <style>{"@page{size:A4;margin:0}"}</style>
      <div className="pp-bar">
        <h1>{p.type === "QUOTATION" ? "ใบเสนอราคา" : "ใบแจ้งหนี้"} {p.view.no}</h1>
        <span className="pp-hint">{pages ? `${pages} หน้า A4` : "กำลังจัดหน้า…"}</span>
        <span className="sp" />
        <button className="btn btn-outline btn-sm" type="button" onClick={() => window.print()} disabled={!pages}>
          พิมพ์ / บันทึก PDF
        </button>
      </div>
      <section className="do-panel" aria-label="ดำเนินการ">
        {p.type === "QUOTATION" ? <QuotePanel {...p} /> : <InvoicePanel {...p} />}
      </section>
      <div className="pp-body">
        <DocSheets view={p.view} copies={["ต้นฉบับ"]} onPages={setPages} />
      </div>
    </div>
  );
}

function QuotePanel(p: Props) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptQuoteAction, {});
  if (p.status === "ACCEPTED" || state.ok)
    return (
      <div className="do-ok" role="status" id="qtAccepted">
        <b>{state.ok ?? "ใบเสนอราคานี้ยืนยันแล้ว"}</b>
        {p.acceptedBy && !state.ok && <span>ผู้ยืนยัน: {p.acceptedBy}{p.acceptedAt ? ` · ${when(p.acceptedAt)}` : ""}</span>}
      </div>
    );
  if (p.status !== "ISSUED" || p.expired)
    return <div className="do-warn" role="status">{p.expired ? "ใบเสนอราคานี้หมดอายุแล้ว — กรุณาติดต่อร้านเพื่อขอใบเสนอราคาใหม่" : "ใบเสนอราคานี้ไม่อยู่ในสถานะที่ยืนยันได้ กรุณาติดต่อร้าน"}</div>;
  const bad = (k: string) => (state.fields?.includes(k) ? "err" : "");
  return (
    <form action={action} className="do-form" id="qtAccept">
      <h2>ยืนยันใบเสนอราคา (ยอด {baht(p.grandSatang)})</h2>
      <p>ตรวจรายการด้านล่างแล้วกดยืนยัน ร้านจะได้รับแจ้งทันทีและส่งใบแจ้งหนี้ให้ต่อไป</p>
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="t" value={p.token} />
      <div className={`do-field ${bad("name")}`}>
        <label htmlFor="qtName">ชื่อผู้ยืนยัน</label>
        <input id="qtName" name="name" required maxLength={120} autoComplete="name" />
      </div>
      <label className={`do-chk ${bad("agree")}`}>
        <input type="checkbox" name="agree" required /> ข้าพเจ้ายอมรับราคาและเงื่อนไขตามใบเสนอราคา {p.view.no}
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "กำลังยืนยัน…" : "ยืนยันใบเสนอราคา"}</button>
      {state.error && <p className="do-err" role="alert">{state.error}</p>}
    </form>
  );
}

function InvoicePanel(p: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [prep, setPrep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const pendingSum = p.slips.filter((s) => s.status === "PENDING").reduce((a, s) => a + s.amountSatang, 0);
  const payable = p.status === "ISSUED" || p.status === "PARTIAL";
  return (
    <div className="do-iv">
      <div className="do-amt">
        <div>
          <span>ยอดค้างชำระ</span>
          <b id="ivOutstanding">{baht(p.outstandingSatang)}</b>
          {p.paidSatang > 0 && <small>ชำระแล้ว {baht(p.paidSatang)} จาก {baht(p.grandSatang)}</small>}
        </div>
        {payable && p.qr && (
          <figure className="do-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.qr} alt={`QR พร้อมเพย์ ยอด ${baht(p.outstandingSatang)}`} width={180} height={180} />
            <figcaption>สแกนจ่าย {baht(p.outstandingSatang)} · {p.promptpayName}</figcaption>
          </figure>
        )}
      </div>
      {!payable && <div className="do-ok" role="status">{p.status === "PAID" ? "ใบแจ้งหนี้นี้ชำระครบแล้ว ขอบคุณครับ" : "ใบแจ้งหนี้นี้ไม่อยู่ในสถานะที่ชำระได้"}</div>}

      {p.slips.length > 0 && (
        <ul className="do-slips" id="ivSlips" aria-label="สลิปที่แนบแล้ว">
          {p.slips.map((s) => (
            <li key={s.id} className={`st-${s.status}`}>
              <span>{when(s.at)} · {baht(s.amountSatang)}</span>
              <b>{SLIP_ST[s.status] ?? s.status}</b>
              {s.rejectReason && <small>เหตุผล: {s.rejectReason}</small>}
            </li>
          ))}
        </ul>
      )}

      {payable && p.outstandingSatang > 0 && (msg?.ok ? (
        <div className="do-ok" role="status" id="ivSlipOk">{msg.text}</div>
      ) : (
        <form
          className="do-form" id="ivSlipForm"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return setMsg({ ok: false, text: "กรุณาเลือกภาพสลิป" });
            const f = new FormData(e.currentTarget);
            const fd = new FormData();
            fd.append("t", p.token);
            fd.append("slip", file, file.name);
            fd.append("paidAt", `${f.get("date")}T${f.get("time")}`);
            fd.append("amount", String(f.get("amount")));
            setBusy(true);
            const res = await uploadWithProgress(`/api/docs/${encodeURIComponent(p.id)}/slip`, fd, () => {});
            setBusy(false);
            if (res.ok) {
              setMsg({ ok: true, text: "ได้รับสลิปแล้ว ร้านจะตรวจสอบและออกใบเสร็จรับเงินให้" });
              setTimeout(() => location.reload(), 1200);
            } else setMsg({ ok: false, text: String(res.data.error ?? "ส่งสลิปไม่สำเร็จ กรุณาลองใหม่") });
          }}
        >
          <h2>แจ้งชำระเงิน (แนบสลิป)</h2>
          {pendingSum > 0 && <p>มีสลิปรอร้านตรวจ {baht(pendingSum)}</p>}
          <div className="do-field">
            <label htmlFor="ivSlipFile">ภาพสลิป (JPG, PNG, WEBP)</label>
            <input
              id="ivSlipFile" type="file" accept="image/jpeg,image/png,image/webp" disabled={prep}
              onChange={async (e) => {
                const f0 = e.target.files?.[0];
                setMsg(null);
                if (!f0) return;
                if (!IMAGE_TYPES.includes(f0.type)) return setMsg({ ok: false, text: "รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP" });
                setPrep(true);
                let out = f0;
                try {
                  out = await compressImage(f0);
                } catch {}
                setPrep(false);
                if (out.size > 5 * 1024 * 1024) return setMsg({ ok: false, text: "ไฟล์ใหญ่เกิน 5 MB" });
                setFile(out);
              }}
            />
            {file && <small>{fmtSize(file.size)}</small>}
          </div>
          <div className="do-two">
            <div className="do-field"><label htmlFor="ivDate">วันที่โอน</label><input id="ivDate" name="date" type="date" required max={today} defaultValue={today} /></div>
            <div className="do-field"><label htmlFor="ivTime">เวลาที่โอน</label><input id="ivTime" name="time" type="time" required /></div>
          </div>
          <div className="do-field">
            <label htmlFor="ivAmount">ยอดที่โอน (บาท)</label>
            <input id="ivAmount" name="amount" inputMode="decimal" required defaultValue={(Math.max(0, p.outstandingSatang - pendingSum) / 100 || p.outstandingSatang / 100).toFixed(2)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || prep}>{busy ? "กำลังส่ง…" : "ส่งสลิป"}</button>
          {msg && !msg.ok && <p className="do-err" role="alert">{msg.text}</p>}
        </form>
      ))}
    </div>
  );
}
