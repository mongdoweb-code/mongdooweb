"use client";
// ฟอร์มขอใบเสนอราคา (QUOTE: บริษัท + สินค้าจากตะกร้า + รูปพื้นที่ ≤ 3 รูป) และฟอร์มติดต่อร้าน (CONTACT)
// ส่งไปที่ POST /api/inquiries — มีช่องกับดักบอท (honeypot) และเวลาเปิดฟอร์ม, server จำกัดจำนวนครั้งอีกชั้น
import { useEffect, useId, useRef, useState } from "react";
import { IMAGE_TYPES, compressImage, fmtSize, uploadWithProgress } from "./compress";

type Kind = "QUOTE" | "CONTACT";
type CartRow = { slug: string; name: string; qty: number };
type Att = { file: File; url: string; orig: number };

const MAX_FILES = 3;

function readCart(): CartRow[] {
  try {
    const cart = JSON.parse(localStorage.getItem("mdw_cart") || "{}") as Record<string, number>;
    const data = JSON.parse(document.getElementById("mdw-data")?.textContent || "{}") as { catalog?: { id: string; name: string }[] };
    const names = new Map((data.catalog ?? []).map((p) => [p.id, p.name]));
    return Object.entries(cart)
      .map(([slug, q]) => ({ slug, name: names.get(slug) ?? "", qty: Math.floor(Number(q)) }))
      .filter((r) => r.name && r.qty > 0)
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function InquiryForm({ kind }: { kind: Kind }) {
  const uid = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState<{ id: string } | null>(null);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [useCart, setUseCart] = useState(true);
  const [atts, setAtts] = useState<Att[]>([]);
  const [attBusy, setAttBusy] = useState(false);
  const openedAt = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const isQuote = kind === "QUOTE";

  useEffect(() => {
    openedAt.current = Date.now();
    // ตะกร้าอยู่ใน localStorage ของเบราว์เซอร์ — อ่านหลัง mount (เป็นการซิงก์กับระบบภายนอก)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isQuote) setCart(readCart());
  }, [isQuote]);

  const err = (name: string) =>
    errors[name] ? (
      <p className="err-msg" id={`${uid}-${name}-err`}>
        {errors[name]}
      </p>
    ) : null;
  const a11y = (name: string) => ({
    id: `${uid}-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${uid}-${name}-err` : undefined,
  });

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const room = MAX_FILES - atts.length;
    const picked = [...list].slice(0, Math.max(0, room));
    const next: Record<string, string> = { ...errors };
    delete next.files;
    if (list.length > room) next.files = `แนบรูปได้ไม่เกิน ${MAX_FILES} รูป`;
    setAttBusy(true);
    const added: Att[] = [];
    for (const f of picked) {
      if (!IMAGE_TYPES.includes(f.type)) {
        next.files = "รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP";
        continue;
      }
      if (f.size > 30 * 1024 * 1024) {
        next.files = "รูปใหญ่เกิน 30 MB";
        continue;
      }
      let out = f;
      try {
        out = await compressImage(f);
      } catch {}
      if (out.size > 10 * 1024 * 1024) {
        next.files = "ย่อรูปไม่สำเร็จ กรุณาเลือกรูปอื่น";
        continue;
      }
      added.push({ file: out, url: URL.createObjectURL(out), orig: f.size });
    }
    setAtts((a) => [...a, ...added].slice(0, MAX_FILES));
    setErrors(next);
    setAttBusy(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const digits = v("phone").replace(/\D/g, "");
    const errs: Record<string, string> = {};
    if (v("name").length < 2) errs.name = "กรุณากรอกชื่อ";
    if (!/^0[689]\d{8}$/.test(digits) && !/^0[2-57]\d{7}$/.test(digits)) errs.phone = "เบอร์โทรไม่ถูกต้อง — มือถือ 10 หลัก หรือเบอร์บ้าน 9 หลัก";
    if (v("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) errs.email = "รูปแบบอีเมลไม่ถูกต้อง";
    if (v("message").length < 10) errs.message = isQuote ? "กรุณาเล่ารายละเอียดงานอย่างน้อย 10 ตัวอักษร" : "กรุณาพิมพ์ข้อความอย่างน้อย 10 ตัวอักษร";
    if (Object.keys(errs).length) return fail(errs, "กรุณาตรวจข้อมูลที่มีข้อความสีแดง");

    const fd = new FormData();
    ["name", "phone", "email", "company", "message", "website"].forEach((k) => fd.append(k, v(k)));
    fd.append("kind", kind);
    fd.append("t", String(openedAt.current));
    if (isQuote && useCart && cart.length) fd.append("items", JSON.stringify(Object.fromEntries(cart.map((r) => [r.slug, r.qty]))));
    atts.forEach((a) => fd.append("files", a.file, a.file.name));
    setBusy(true);
    setSummary("");
    setProgress(atts.length ? 0 : null);
    const res = await uploadWithProgress("/api/inquiries", fd, (p) => setProgress(p));
    setBusy(false);
    setProgress(null);
    if (!res.ok) {
      const fields = (res.data.fields as Record<string, string>) ?? {};
      return fail(fields, String(res.data.error ?? (res.status === 0 ? "เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่" : "ส่งไม่สำเร็จ กรุณาลองใหม่")));
    }
    atts.forEach((a) => URL.revokeObjectURL(a.url));
    setAtts([]);
    setErrors({});
    setDone({ id: String(res.data.id ?? "") });
  }

  function fail(errs: Record<string, string>, msg: string) {
    setErrors(errs);
    setSummary(msg);
    requestAnimationFrame(() => {
      const first = Object.keys(errs)[0];
      const el = first && formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`);
      if (el) el.focus();
      else summaryRef.current?.focus();
    });
  }

  if (done) {
    return (
      <div className="l2-ok" role="status" tabIndex={-1} ref={(el) => el?.focus()}>
        <b>{isQuote ? "ได้รับคำขอใบเสนอราคาแล้ว ขอบคุณครับ" : "ส่งข้อความถึงร้านเรียบร้อยแล้ว ขอบคุณครับ"}</b>
        <p>ทีมงานจะติดต่อกลับทางโทรศัพท์หรือ LINE โดยเร็วที่สุดในเวลาทำการ{isQuote ? " พร้อมราคาและรายละเอียดสินค้าที่เหมาะกับงานของคุณ" : ""}</p>
        <p>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setDone(null)}>
            ส่งข้อความอีกครั้ง
          </button>
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} className="l2-form" onSubmit={onSubmit} noValidate aria-label={isQuote ? "แบบฟอร์มขอใบเสนอราคา" : "แบบฟอร์มติดต่อร้าน"}>
      <div ref={summaryRef} tabIndex={-1} aria-live="assertive">
        {summary && <p className="l2-err" role="alert">{summary}</p>}
      </div>
      <div className="grid2">
        <div className={`field${errors.name ? " err" : ""}`}>
          <label htmlFor={`${uid}-name`}>ชื่อ-นามสกุล</label>
          <input {...a11y("name")} autoComplete="name" required maxLength={120} />
          {err("name")}
        </div>
        <div className={`field${errors.phone ? " err" : ""}`}>
          <label htmlFor={`${uid}-phone`}>เบอร์โทรศัพท์</label>
          <input {...a11y("phone")} inputMode="tel" autoComplete="tel" placeholder="08X-XXX-XXXX" required maxLength={20} />
          {err("phone")}
        </div>
      </div>
      <div className="grid2">
        <div className={`field${errors.email ? " err" : ""}`}>
          <label htmlFor={`${uid}-email`}>
            อีเมล <i>(ไม่บังคับ)</i>
          </label>
          <input {...a11y("email")} type="email" autoComplete="email" maxLength={160} />
          {err("email")}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-company`}>
            {isQuote ? "บริษัท / หน่วยงาน" : "บริษัท"} <i>(ไม่บังคับ)</i>
          </label>
          <input {...a11y("company")} autoComplete="organization" maxLength={160} />
        </div>
      </div>

      {isQuote && cart.length > 0 && (
        <div className="field">
          <div className="q-items-h">
            <b>สินค้าที่สนใจ (จากตะกร้าของคุณ)</b>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500, margin: 0 }}>
              <input type="checkbox" checked={useCart} onChange={(e) => setUseCart(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--c-orange)" }} />
              แนบรายการนี้
            </label>
          </div>
          {useCart && (
            <div className="q-items">
              {cart.map((r) => (
                <div className="row" key={r.slug}>
                  <span>{r.name}</span>
                  <span>× {r.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={`field${errors.message ? " err" : ""}`}>
        <label htmlFor={`${uid}-message`}>{isQuote ? "รายละเอียดงาน" : "ข้อความ"}</label>
        <textarea
          {...a11y("message")}
          required
          maxLength={4000}
          placeholder={isQuote ? "เช่น สระขนาด 4×8 เมตร ต้องการไฟใต้น้ำ RGB 6 ดวง ระยะสายจากตู้ไฟ 15 เมตร ติดตั้งที่จังหวัด…" : "พิมพ์คำถามหรือรายละเอียดที่ต้องการติดต่อ"}
        />
        {err("message")}
      </div>

      {isQuote && (
        <div className={`field${errors.files ? " err" : ""}`}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }} id={`${uid}-files-l`}>
            รูปพื้นที่ติดตั้ง <i style={{ fontStyle: "normal", fontWeight: 400, color: "var(--c-muted)" }}>(ไม่บังคับ · ไม่เกิน {MAX_FILES} รูป)</i>
          </span>
          {atts.length < MAX_FILES && (
            <label className="att-drop">
              <input
                type="file"
                name="filesPicker"
                accept="image/jpeg,image/png,image/webp"
                multiple
                aria-labelledby={`${uid}-files-l`}
                aria-describedby={errors.files ? `${uid}-files-err` : undefined}
                disabled={attBusy}
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <b>{attBusy ? "กำลังย่อรูป…" : "เลือกรูป หรือถ่ายรูปหน้างาน"}</b>
              <small>JPG, PNG, WEBP · รูปใหญ่ระบบย่อให้อัตโนมัติ</small>
            </label>
          )}
          {atts.length > 0 && (
            <div className="att-list">
              {atts.map((a, i) => (
                <figure key={a.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={`รูปแนบที่ ${i + 1}`} width={96} height={96} />
                  <figcaption>{fmtSize(a.file.size)}</figcaption>
                  <button
                    type="button"
                    aria-label={`ลบรูปแนบที่ ${i + 1}`}
                    onClick={() => {
                      URL.revokeObjectURL(a.url);
                      setAtts((list) => list.filter((x) => x !== a));
                    }}
                  >
                    ×
                  </button>
                </figure>
              ))}
            </div>
          )}
          {err("files")}
        </div>
      )}

      {/* กับดักบอท: คนมองไม่เห็นช่องนี้ */}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor={`${uid}-website`}>เว็บไซต์ (เว้นว่าง)</label>
        <input id={`${uid}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="hint">ข้อมูลนี้ใช้เพื่อติดต่อกลับและจัดทำใบเสนอราคาเท่านั้น ตาม<a href="/privacy">นโยบายความเป็นส่วนตัว</a></p>
      {progress != null && (
        <div className="up-bar" role="progressbar" aria-label="กำลังส่ง" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={busy || attBusy}>
          {busy ? "กำลังส่ง…" : isQuote ? "ส่งคำขอใบเสนอราคา" : "ส่งข้อความ"}
        </button>
      </div>
    </form>
  );
}
