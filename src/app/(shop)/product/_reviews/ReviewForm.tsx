"use client";
// ฟอร์มเขียนรีวิว: ยืนยันการซื้อด้วยเลขที่คำสั่งซื้อ + เบอร์โทร, ให้ดาว 1–5, ข้อความ, รูปไม่เกิน 3 รูป (ย่อในเบราว์เซอร์ก่อนส่ง)
// ส่งไปที่ POST /api/reviews — รีวิวแสดงหลังร้านอนุมัติ
import { useId, useRef, useState } from "react";
import { IMAGE_TYPES, compressImage, uploadWithProgress } from "../../_lot2/compress";

const MAX_FILES = 3;
const LABELS = ["", "แย่มาก", "ไม่ค่อยดี", "พอใช้", "ดี", "ดีมาก"];

export function ReviewForm({ slug }: { slug: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const openedAt = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  if (done)
    return (
      <div className="l2-ok l10-rv-done" role="status" tabIndex={-1} ref={(el) => el?.focus()}>
        <b>ขอบคุณสำหรับรีวิว</b>
        <p>รีวิวของคุณจะแสดงหลังร้านตรวจสอบ (ปกติภายใน 1–2 วันทำการ)</p>
      </div>
    );

  if (!open)
    return (
      <button
        className="btn btn-outline l10-rv-open"
        type="button"
        aria-expanded="false"
        onClick={() => {
          openedAt.current = Date.now();
          setOpen(true);
        }}>
        เขียนรีวิวสินค้านี้
      </button>
    );

  const err = (k: string) => (errors[k] ? <p className="err-msg" id={`${uid}-${k}-err`}>{errors[k]}</p> : null);
  const a11y = (k: string) => ({ id: `${uid}-${k}`, name: k, "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `${uid}-${k}-err` : undefined });

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = { ...errors };
    delete next.files;
    const out: File[] = [];
    for (const f of [...list].slice(0, MAX_FILES - files.length)) {
      if (!IMAGE_TYPES.includes(f.type)) {
        next.files = "รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP";
        continue;
      }
      let c = f;
      try {
        c = await compressImage(f);
      } catch {}
      if (c.size > 10 * 1024 * 1024) next.files = "รูปใหญ่เกินไป กรุณาเลือกรูปอื่น";
      else out.push(c);
    }
    if (list.length > MAX_FILES - files.length) next.files = `แนบรูปได้ไม่เกิน ${MAX_FILES} รูป`;
    setFiles((x) => [...x, ...out].slice(0, MAX_FILES));
    setErrors(next);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const errs: Record<string, string> = {};
    if (!v("orderNo")) errs.orderNo = "กรุณากรอกเลขที่คำสั่งซื้อ";
    if (v("phone").replace(/\D/g, "").length < 9) errs.phone = "กรุณากรอกเบอร์โทรที่ใช้สั่งซื้อ";
    if (!rating) errs.rating = "กรุณาให้คะแนน 1–5 ดาว";
    if (v("body").length < 10) errs.body = "กรุณาเขียนรีวิวอย่างน้อย 10 ตัวอักษร";
    if (Object.keys(errs).length) return fail(errs, "กรุณาตรวจข้อมูลที่มีข้อความสีแดง");
    const fd = new FormData();
    ["orderNo", "phone", "name", "body", "website"].forEach((k) => fd.append(k, v(k)));
    fd.append("product", slug);
    fd.append("rating", String(rating));
    fd.append("t", String(openedAt.current));
    files.forEach((x) => fd.append("files", x, x.name));
    setBusy(true);
    setSummary("");
    const res = await uploadWithProgress("/api/reviews", fd, () => {});
    setBusy(false);
    if (!res.ok) {
      const msg = String(res.data.error ?? (res.status === 0 ? "เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่" : "ส่งรีวิวไม่สำเร็จ กรุณาลองใหม่"));
      const fields = Array.isArray(res.data.fields) ? (res.data.fields as string[]) : [];
      return fail(Object.fromEntries(fields.map((k) => [k, msg])), msg);
    }
    setDone(true);
  }

  function fail(errs: Record<string, string>, msg: string) {
    setErrors(errs);
    setSummary(msg);
    requestAnimationFrame(() => {
      const first = Object.keys(errs)[0];
      formRef.current?.querySelector<HTMLElement>(first === "rating" ? "[name=rating]" : `[name="${first}"]`)?.focus();
    });
  }

  return (
    <form ref={formRef} className="l2-form l10-rv-form" onSubmit={onSubmit} noValidate aria-label="เขียนรีวิวสินค้า">
      <p className="l10-note">รีวิวได้เฉพาะผู้ที่ซื้อสินค้านี้แล้ว — ยืนยันด้วยเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่งซื้อ (ไม่แสดงเบอร์ในหน้าเว็บ)</p>
      <div aria-live="assertive">{summary && <p className="l2-err" role="alert">{summary}</p>}</div>
      <fieldset className={`l10-rate${errors.rating ? " err" : ""}`} aria-describedby={errors.rating ? `${uid}-rating-err` : undefined}>
        <legend>คะแนน</legend>
        <div className="l10-rate-row">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={rating >= n ? "on" : ""}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
              <span aria-hidden="true">★</span>
              <span className="sr-only">{`${n} ดาว — ${LABELS[n]}`}</span>
            </label>
          ))}
          <span className="l10-rate-lbl" aria-hidden="true">{LABELS[rating]}</span>
        </div>
        {err("rating")}
      </fieldset>
      <div className="grid2">
        <div className={`field${errors.orderNo ? " err" : ""}`}>
          <label htmlFor={`${uid}-orderNo`}>เลขที่คำสั่งซื้อ</label>
          <input {...a11y("orderNo")} placeholder="MDW-261017-8288" autoComplete="off" maxLength={40} />
          {err("orderNo")}
        </div>
        <div className={`field${errors.phone ? " err" : ""}`}>
          <label htmlFor={`${uid}-phone`}>เบอร์โทรที่ใช้สั่งซื้อ</label>
          <input {...a11y("phone")} inputMode="tel" autoComplete="tel" maxLength={20} />
          {err("phone")}
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-name`}>
          ชื่อที่แสดง <i>(ไม่บังคับ — เว้นว่าง = ชื่อย่อจากคำสั่งซื้อ)</i>
        </label>
        <input {...a11y("name")} maxLength={40} autoComplete="nickname" />
      </div>
      <div className={`field${errors.body ? " err" : ""}`}>
        <label htmlFor={`${uid}-body`}>รีวิว</label>
        <textarea {...a11y("body")} maxLength={2000} rows={4} placeholder="สินค้าเป็นอย่างไร ติดตั้งง่ายไหม แสงสวยตามที่คาดไว้หรือเปล่า" />
        {err("body")}
      </div>
      <div className={`field${errors.files ? " err" : ""}`}>
        <label htmlFor={`${uid}-files`}>
          รูปจากงานจริง <i>(ไม่บังคับ · ไม่เกิน {MAX_FILES} รูป)</i>
        </label>
        {files.length < MAX_FILES && (
          <input id={`${uid}-files`} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => addFiles(e.target.files).then(() => (e.target.value = ""))} aria-describedby={errors.files ? `${uid}-files-err` : undefined} />
        )}
        {files.length > 0 && (
          <ul className="l10-files">
            {files.map((x, i) => (
              <li key={i}>
                {x.name}
                <button type="button" className="link" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label={`ลบรูป ${x.name}`}>
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}
        {err("files")}
      </div>
      {/* กับดักบอท — คนจริงไม่เห็นช่องนี้ */}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor={`${uid}-website`}>เว็บไซต์ (เว้นว่าง)</label>
        <input id={`${uid}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "กำลังส่ง…" : "ส่งรีวิว"}
      </button>
    </form>
  );
}
