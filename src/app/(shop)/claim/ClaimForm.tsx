"use client";
// ฟอร์มแจ้งเคลม 2 ขั้น: (1) เลขที่คำสั่งซื้อ + เบอร์ → (2) เลือกสินค้า/ประเภท/อาการ/รูป (≤ 4 รูป ย่อก่อนส่ง) → POST /api/claims
import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IMAGE_TYPES, compressImage, fmtSize, uploadWithProgress } from "../_lot2/compress";
import { lookupClaimOrder, type ClaimLookupState } from "./actions";

const MAX_FILES = 4;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }) : "—");

export function ClaimForm() {
  const [state, action, pending] = useActionState<ClaimLookupState, FormData>(lookupClaimOrder, {});
  const params = useSearchParams();
  const qNo = (params.get("no") ?? "").slice(0, 40);
  const formRef = useRef<HTMLFormElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const auto = useRef(false);

  // มาจากหน้าติดตามคำสั่งซื้อในแท็บเดียวกัน → กรอกเบอร์ให้และค้นหาอัตโนมัติ
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

  const o = state.order;
  return (
    <div style={{ maxWidth: 760 }}>
      <ol className="cl-steps" aria-label="ขั้นตอน">
        <li aria-current={!o ? "step" : undefined}>1. ยืนยันคำสั่งซื้อ</li>
        <li aria-current={o ? "step" : undefined}>2. รายละเอียดการเคลม</li>
      </ol>
      {!o && (
        <form className="track-form" action={action} ref={formRef} id="claimLookup">
          <div className="field">
            <label htmlFor="clOrderNo">เลขที่คำสั่งซื้อ</label>
            <input id="clOrderNo" name="orderNo" required placeholder="เช่น MDW-261017-8288" defaultValue={state.orderNo ?? qNo} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="clPhone">เบอร์โทรที่ใช้สั่งซื้อ</label>
            <input id="clPhone" name="phone" ref={phoneRef} required inputMode="tel" placeholder="08X-XXX-XXXX" defaultValue={state.phone} autoComplete="tel" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "กำลังตรวจ…" : "ถัดไป"}
          </button>
        </form>
      )}
      <div aria-live="polite">{state.error && <p className="form-error" role="alert">{state.error}</p>}</div>
      {o && state.phone && <ClaimDetails order={o} phone={state.phone} />}
    </div>
  );
}

type Order = NonNullable<ClaimLookupState["order"]>;

function ClaimDetails({ order: o, phone }: { order: Order; phone: string }) {
  const [kind, setKind] = useState<"WARRANTY" | "RETURN">(o.canReturn ? "RETURN" : "WARRANTY");
  const [picked, setPicked] = useState<Record<string, number>>(o.items.length === 1 ? { [o.items[0].id]: o.items[0].qty } : {});
  const [files, setFiles] = useState<{ f: File; url: string }[]>([]);
  const [prep, setPrep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<{ text: string; fields: Record<string, string> } | null>(null);
  const [done, setDone] = useState<{ claimNo: string; inWarranty: boolean | null } | null>(null);
  const issueRef = useRef<HTMLTextAreaElement>(null);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setErr(null);
    const room = MAX_FILES - files.length;
    const chosen = [...list].slice(0, Math.max(0, room));
    if (list.length > room) setErr({ text: `แนบรูปได้ไม่เกิน ${MAX_FILES} รูป`, fields: { files: "" } });
    setPrep(true);
    const out: { f: File; url: string }[] = [];
    for (const f of chosen) {
      if (!IMAGE_TYPES.includes(f.type)) {
        setErr({ text: "รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP", fields: { files: "" } });
        continue;
      }
      let c = f;
      try {
        c = await compressImage(f);
      } catch {}
      out.push({ f: c, url: URL.createObjectURL(c) });
    }
    setPrep(false);
    setFiles((x) => [...x, ...out].slice(0, MAX_FILES));
  }

  if (done)
    return (
      <div className="l2-ok" role="status" id="claimDone">
        <b>รับเรื่องแล้ว เลขที่ {done.claimNo}</b>
        <p>
          {kind === "WARRANTY"
            ? done.inWarranty
              ? "สินค้าอยู่ในระยะประกัน ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็ว"
              : "สินค้าเลยระยะประกันแล้ว ทีมงานจะติดต่อแจ้งค่าบริการซ่อม/เปลี่ยนให้ทราบก่อนดำเนินการ"
            : "ทีมงานจะตรวจสอบรูปและติดต่อกลับเรื่องการคืน/เปลี่ยนสินค้าโดยเร็ว"}
        </p>
        <p>ติดตามสถานะและคำตอบจากร้านได้ที่ <a className="link" href={`/track?no=${encodeURIComponent(o.orderNo)}`}>หน้าติดตามคำสั่งซื้อ</a></p>
      </div>
    );

  const bad = (k: string) => (err?.fields[k] !== undefined ? "err" : "");
  return (
    <form
      className="l2-form"
      id="claimForm"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const items = Object.entries(picked).map(([id, qty]) => ({ id, qty }));
        const fields: Record<string, string> = {};
        if (!items.length) fields.items = "กรุณาเลือกสินค้าที่ต้องการเคลมอย่างน้อย 1 รายการ";
        if (String(f.get("issue") ?? "").trim().length < 10) fields.issue = "กรุณาอธิบายอาการ/ปัญหาอย่างน้อย 10 ตัวอักษร";
        if (kind === "RETURN" && !files.length) fields.files = "การคืน/เปลี่ยนสินค้าเสียหายจากขนส่ง ต้องแนบรูปอย่างน้อย 1 รูป";
        if (Object.keys(fields).length) {
          setErr({ text: Object.values(fields)[0], fields });
          if (fields.issue && !fields.items) issueRef.current?.focus();
          return;
        }
        const fd = new FormData();
        fd.append("orderNo", o.orderNo);
        fd.append("phone", phone);
        fd.append("kind", kind);
        fd.append("items", JSON.stringify(items));
        fd.append("issue", String(f.get("issue") ?? ""));
        for (const x of files) fd.append("files", x.f, x.f.name);
        setBusy(true);
        setProgress(0);
        const res = await uploadWithProgress("/api/claims", fd, setProgress);
        setBusy(false);
        setProgress(null);
        if (res.ok) setDone({ claimNo: String(res.data.claimNo), inWarranty: (res.data.inWarranty as boolean | null) ?? null });
        else setErr({ text: String(res.data.error ?? (res.status === 0 ? "เชื่อมต่อไม่ได้ กรุณาลองใหม่" : "ส่งเรื่องไม่สำเร็จ")), fields: (res.data.fields as Record<string, string>) ?? {} });
      }}
    >
      <div className="cl-info" id="claimInfo">
        <span>คำสั่งซื้อ <b>{o.orderNo}</b> · {o.name}</span>
        <span>
          ประกันถึง {day(o.warrantyUntil)} — <span className={o.inWarranty ? "ok" : "bad"}>{o.inWarranty ? "อยู่ในระยะประกัน" : "หมดระยะประกันแล้ว"}</span>
        </span>
        <span>
          คืน/เปลี่ยน (เสียหายจากขนส่ง) ได้ถึง {day(o.returnUntil)} — <span className={o.canReturn ? "ok" : "bad"}>{o.canReturn ? "ยังอยู่ในกำหนด" : "เลยกำหนดแล้ว"}</span>
        </span>
      </div>

      <fieldset className="l2-fs">
        <legend>ประเภทเรื่อง</legend>
        <div className="cl-kind">
          <label>
            <input type="radio" name="kind" value="WARRANTY" checked={kind === "WARRANTY"} onChange={() => setKind("WARRANTY")} />
            <span><b>เคลมประกัน</b><small>สินค้าเสีย/ใช้งานไม่ได้ตามปกติ ภายใน 1 ปี</small></span>
          </label>
          <label>
            <input type="radio" name="kind" value="RETURN" checked={kind === "RETURN"} onChange={() => setKind("RETURN")} disabled={!o.canReturn} />
            <span><b>คืน/เปลี่ยนสินค้า (เสียหายจากขนส่ง)</b><small>{o.canReturn ? "แจ้งภายใน 7 วันหลังได้รับสินค้า พร้อมรูปสินค้าและกล่อง" : "เลยกำหนด 7 วันแล้ว"}</small></span>
          </label>
        </div>
      </fieldset>

      <fieldset className={`l2-fs ${bad("items")}`}>
        <legend>สินค้าที่ต้องการเคลม</legend>
        <div className="cl-items">
          {o.items.map((it) => {
            const on = picked[it.id] != null;
            return (
              <div className="cl-item" key={it.id}>
                <input
                  type="checkbox" id={`ci-${it.id}`} checked={on}
                  onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.checked) n[it.id] = it.qty; else delete n[it.id]; return n; })}
                />
                <label htmlFor={`ci-${it.id}`}>{it.name}</label>
                <span className="qty">
                  <label htmlFor={`cq-${it.id}`}>จำนวน</label>
                  <input
                    id={`cq-${it.id}`} type="number" min={1} max={it.qty} value={picked[it.id] ?? it.qty} disabled={!on}
                    onChange={(e) => setPicked((p) => ({ ...p, [it.id]: Math.min(it.qty, Math.max(1, Math.floor(Number(e.target.value)) || 1)) }))}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className={`field ${bad("issue")}`}>
        <label htmlFor="clIssue">อาการ / ปัญหาที่พบ</label>
        <textarea id="clIssue" name="issue" ref={issueRef} maxLength={3000} placeholder="เช่น ไฟติดๆ ดับๆ หลังใช้งาน 2 เดือน / กล่องบุบ โคมแตกตอนได้รับ" />
      </div>

      <div className={`field ${bad("files")}`}>
        <span className="lbl" style={{ fontSize: 14, fontWeight: 600 }}>รูปสินค้า/อาการ (ไม่เกิน {MAX_FILES} รูป{kind === "RETURN" ? " · จำเป็น" : ""})</span>
        {files.length < MAX_FILES && (
          <label className="att-drop">
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="เลือกรูปสินค้า/อาการ" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} disabled={prep} />
            <b>{prep ? "กำลังย่อรูป…" : "แตะเพื่อเลือกรูป"}</b>
            <small>JPG, PNG, WEBP · รูปใหญ่ระบบย่อให้อัตโนมัติ</small>
          </label>
        )}
        {files.length > 0 && (
          <div className="att-list">
            {files.map((x, i) => (
              <figure key={x.url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.url} alt={`รูปที่ ${i + 1}`} />
                <figcaption>{fmtSize(x.f.size)}</figcaption>
                <button type="button" aria-label={`ลบรูปที่ ${i + 1}`} onClick={() => setFiles((l) => l.filter((_, k) => k !== i))}>×</button>
              </figure>
            ))}
          </div>
        )}
      </div>

      {err && <p className="l2-err" role="alert">{err.text}</p>}
      {progress != null && (
        <div className="up-bar" role="progressbar" aria-label="กำลังส่งเรื่อง" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={busy || prep}>{busy ? "กำลังส่ง…" : "ส่งเรื่องเคลม"}</button>
      </div>
    </form>
  );
}
