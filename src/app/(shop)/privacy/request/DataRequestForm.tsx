"use client";
// แบบฟอร์มใช้สิทธิ์ตาม PDPA — ตรวจเบื้องต้นในเบราว์เซอร์ (server ตรวจซ้ำทั้งหมด) · ข้อความผิดผูกกับช่อง (aria-describedby)
import { useEffect, useId, useRef, useState } from "react";

const KINDS = [
  ["ACCESS", "ขอดู/ขอสำเนาข้อมูลของฉัน"],
  ["DELETE", "ขอลบข้อมูลของฉัน"],
  ["CORRECT", "ขอแก้ไขข้อมูลให้ถูกต้อง"],
  ["OBJECT", "คัดค้าน/ถอนความยินยอม (เช่น ไม่ต้องการรับข่าวสาร)"],
] as const;

export function DataRequestForm() {
  const uid = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const openedAt = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const err = (n: string) => (errors[n] ? <p className="err-msg" id={`${uid}-${n}-err`}>{errors[n]}</p> : null);
  const a11y = (n: string) => ({ id: `${uid}-${n}`, name: n, "aria-invalid": errors[n] ? true : undefined, "aria-describedby": errors[n] ? `${uid}-${n}-err` : undefined });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const digits = v("phone").replace(/\D/g, "");
    const errs: Record<string, string> = {};
    if (!v("kind")) errs.kind = "เลือกประเภทคำขอ";
    if (v("name").length < 2) errs.name = "กรุณากรอกชื่อ-นามสกุล";
    if (!/^0[689]\d{8}$/.test(digits) && !/^0[2-57]\d{7}$/.test(digits)) errs.phone = "เบอร์โทรไม่ถูกต้อง — ใช้เบอร์เดียวกับที่ใช้สั่งซื้อ";
    if (v("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) errs.email = "รูปแบบอีเมลไม่ถูกต้อง";
    if (v("detail").length < 5) errs.detail = "กรุณาอธิบายคำขอสั้น ๆ (อย่างน้อย 5 ตัวอักษร)";
    if (f.get("consent") !== "on") errs.consent = "กรุณายืนยันว่าเป็นเจ้าของข้อมูล";
    if (Object.keys(errs).length) return fail(errs, "กรุณาตรวจข้อมูลที่มีข้อความสีแดง");
    setBusy(true);
    setSummary("");
    try {
      const r = await fetch("/api/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: v("kind"), name: v("name"), phone: v("phone"), email: v("email"), detail: v("detail"), consent: true, website: v("website"), t: openedAt.current }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string>; id?: string };
      if (!r.ok) return fail(j.fields ?? {}, j.error ?? "ส่งไม่สำเร็จ กรุณาลองใหม่");
      setDone(j.id ?? "");
    } catch {
      fail({}, "เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setBusy(false);
    }
  }
  function fail(errs: Record<string, string>, msg: string) {
    setErrors(errs);
    setSummary(msg);
    requestAnimationFrame(() => {
      const first = Object.keys(errs)[0];
      formRef.current?.querySelector<HTMLElement>(first ? `[name="${first}"]` : "[role=alert]")?.focus();
    });
  }

  if (done !== null)
    return (
      <div className="l2-ok" role="status" tabIndex={-1} ref={(el) => el?.focus()} id="drDone">
        <b>ได้รับคำขอของคุณแล้ว</b>
        <p>ร้านจะตรวจสอบตัวตน (อาจโทรกลับที่เบอร์ที่ให้ไว้) และดำเนินการให้ภายใน 30 วันตามกฎหมาย{done ? ` · เลขอ้างอิง ${done.slice(-8).toUpperCase()}` : ""}</p>
      </div>
    );

  return (
    <form ref={formRef} className="l2-form" onSubmit={onSubmit} noValidate aria-label="แบบฟอร์มคำขอใช้สิทธิ์ข้อมูลส่วนบุคคล" id="drForm"
      onInput={(e) => { const n = (e.target as HTMLInputElement).name; if (n && errors[n]) setErrors(({ [n]: _x, ...rest }) => (void _x, rest)); }}>
      <div aria-live="assertive">{summary && <p className="l2-err" role="alert" tabIndex={-1}>{summary}</p>}</div>
      <fieldset className={`field dr-kinds${errors.kind ? " err" : ""}`} aria-describedby={errors.kind ? `${uid}-kind-err` : undefined}>
        <legend>ต้องการใช้สิทธิ์ใด</legend>
        {KINDS.map(([k, l]) => (
          <label key={k} className="dr-kind"><input type="radio" name="kind" value={k} required /> {l}</label>
        ))}
        {err("kind")}
      </fieldset>
      <div className="grid2">
        <div className={`field${errors.name ? " err" : ""}`}>
          <label htmlFor={`${uid}-name`}>ชื่อ-นามสกุล</label>
          <input {...a11y("name")} autoComplete="name" required maxLength={120} />
          {err("name")}
        </div>
        <div className={`field${errors.phone ? " err" : ""}`}>
          <label htmlFor={`${uid}-phone`}>เบอร์โทรที่ใช้สั่งซื้อ</label>
          <input {...a11y("phone")} inputMode="tel" autoComplete="tel" placeholder="08X-XXX-XXXX" required maxLength={20} />
          {err("phone")}
        </div>
      </div>
      <div className={`field${errors.email ? " err" : ""}`}>
        <label htmlFor={`${uid}-email`}>อีเมล <i>(ไม่บังคับ — ใช้ส่งสำเนาข้อมูลให้)</i></label>
        <input {...a11y("email")} type="email" autoComplete="email" maxLength={160} />
        {err("email")}
      </div>
      <div className={`field${errors.detail ? " err" : ""}`}>
        <label htmlFor={`${uid}-detail`}>รายละเอียดคำขอ</label>
        <textarea {...a11y("detail")} rows={4} maxLength={3000} placeholder="เช่น ขอสำเนาประวัติการสั่งซื้อทั้งหมด / ขอลบเบอร์โทรออกจากระบบ / เลขคำสั่งซื้อที่เกี่ยวข้อง" />
        {err("detail")}
      </div>
      <div className={`field${errors.consent ? " err" : ""}`}>
        <label className="dr-consent"><input type="checkbox" name="consent" aria-describedby={errors.consent ? `${uid}-consent-err` : undefined} /> ข้าพเจ้าเป็นเจ้าของข้อมูล (หรือได้รับมอบอำนาจ) และยินยอมให้ร้านติดต่อกลับเพื่อยืนยันตัวตน</label>
        {err("consent")}
      </div>
      <div className="hp-field" aria-hidden="true"><label>เว็บไซต์<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="hint">ข้อมูลในแบบฟอร์มนี้ใช้เพื่อดำเนินการตามคำขอและเก็บเป็นหลักฐานตามกฎหมายเท่านั้น · เอกสารภาษี (ใบเสร็จ/ใบกำกับภาษี) ต้องเก็บไว้ 5 ปีตามกฎหมาย จึงลบได้เฉพาะข้อมูลที่ไม่บังคับ</p>
      <div className="actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "กำลังส่ง…" : "ส่งคำขอ"}</button></div>
    </form>
  );
}
