"use client";
// "แจ้งเมื่อมีของ" (U9) — สินค้าหมด: ลูกค้าฝากเบอร์ / LINE ID / อีเมล (อย่างน้อย 1 ช่อง) → ร้านเห็นรายชื่อ + LINE แจ้งร้านเมื่อเติมสต็อก
import { useId, useRef, useState } from "react";

export function StockAlertForm({ slug }: { slug: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const openedAt = useRef(0);

  if (msg?.ok)
    return (
      <div className="l2-ok l10-sa-ok" role="status" tabIndex={-1} ref={(el) => el?.focus()}>
        <b>บันทึกแล้ว</b>
        <p>{msg.text}</p>
      </div>
    );

  if (!open)
    return (
      <button
        type="button"
        className="btn btn-outline l10-sa-btn"
        onClick={() => {
          openedAt.current = Date.now();
          setOpen(true);
        }}>
        แจ้งเมื่อมีของ
      </button>
    );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    if (!v("phone") && !v("lineId") && !v("email")) {
      setBad(["phone"]);
      setMsg({ ok: false, text: "กรุณากรอกเบอร์โทร, LINE ID หรืออีเมล อย่างน้อย 1 ช่อง" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/stock-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: slug, name: v("name"), phone: v("phone"), lineId: v("lineId"), email: v("email"), website: v("website"), t: openedAt.current }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: string[]; duplicate?: boolean };
      if (!res.ok) {
        setBad(data.fields ?? []);
        setMsg({ ok: false, text: data.error ?? "ส่งไม่สำเร็จ กรุณาลองใหม่" });
      } else
        setMsg({ ok: true, text: data.duplicate ? "คุณฝากชื่อไว้แล้ว — ร้านจะติดต่อกลับทันทีที่สินค้าเข้า" : "ร้านจะติดต่อกลับทันทีที่สินค้าเข้า (ข้อมูลนี้ใช้แจ้งสินค้าเข้าเท่านั้น)" });
    } catch {
      setMsg({ ok: false, text: "เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่" });
    }
    setBusy(false);
  }

  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className={`field${bad.includes(k) ? " err" : ""}`}>
      <label htmlFor={`${uid}-${k}`}>{label}</label>
      <input id={`${uid}-${k}`} name={k} aria-invalid={bad.includes(k) || undefined} {...props} />
    </div>
  );

  return (
    <form className="l2-form l10-sa-form" onSubmit={onSubmit} noValidate aria-label="แจ้งเมื่อสินค้ามีของ">
      <p className="l10-note">ฝากช่องทางติดต่อไว้ ร้านจะแจ้งทันทีที่สินค้าเข้า (กรอกอย่างน้อย 1 ช่อง)</p>
      <div aria-live="assertive">{msg && !msg.ok && <p className="l2-err" role="alert">{msg.text}</p>}</div>
      <div className="grid2">
        {field("phone", "เบอร์โทร", { inputMode: "tel", autoComplete: "tel", maxLength: 20 })}
        {field("lineId", "LINE ID", { autoComplete: "off", maxLength: 40 })}
      </div>
      <div className="grid2">
        {field("email", "อีเมล", { type: "email", autoComplete: "email", maxLength: 120 })}
        {field("name", "ชื่อ (ไม่บังคับ)", { autoComplete: "name", maxLength: 60 })}
      </div>
      <div className="hp-field" aria-hidden="true">
        <label htmlFor={`${uid}-website`}>เว็บไซต์ (เว้นว่าง)</label>
        <input id={`${uid}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "กำลังบันทึก…" : "แจ้งฉันเมื่อมีของ"}
      </button>
    </form>
  );
}
