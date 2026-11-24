"use client";
// ช่องกรอกข้อความแจ้งเตือน (ใช้ทั้งหน้าคลัง /admin/notices และ "สร้างข้อความใหม่" ในหน้าแก้ไขสินค้า)
// ข้อความ + ปุ่มตัวหนา (**…**) · โทนสี 4 แบบ · ไอคอน 14 แบบ/ไม่มีไอคอน — ตัวอย่างแสดงด้วย NoticeBox ตัวเดียวกับหน้าร้าน
import { useRef } from "react";
import { NOTICE_ICONS, NOTICE_TEXT_MAX, NOTICE_TONES, TONE_KEYS, noticeIconPath, type NoticeTone } from "@/lib/notices";

export type NoticeDraft = { text: string; tone: NoticeTone; icon: string };

const Svg = ({ k }: { k: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: noticeIconPath(k) }} />
);

export function NoticeFields({ v, set, uid, invalid }: { v: NoticeDraft; set: (p: Partial<NoticeDraft>) => void; uid: string; invalid?: string[] }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  /** ครอบข้อความที่เลือกด้วย ** (ไม่ได้เลือก = ใส่ **ตัวหนา** ไว้ที่เคอร์เซอร์) */
  const bold = () => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const sel = value.slice(a, b) || "ตัวหนา";
    const next = `${value.slice(0, a)}**${sel}**${value.slice(b)}`;
    set({ text: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + 2, a + 2 + sel.length);
    });
  };
  const n = v.text.length;
  return (
    <div className="ntf">
      <div className="field">
        <div className="ntf-lbl">
          <label htmlFor={`${uid}text`}>ข้อความที่แสดงหน้าสินค้า</label>
          <button type="button" className="ntf-bold" onClick={bold} aria-label="ทำตัวหนา (ครอบด้วย **)" data-tip="ทำตัวหนา — เลือกข้อความแล้วกด"><b>B</b> ตัวหนา</button>
        </div>
        <textarea
          id={`${uid}text`}
          ref={ta}
          rows={3}
          value={v.text}
          maxLength={NOTICE_TEXT_MAX + 20}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="เช่น ไฟแรงดันต่ำ ต้องต่อผ่านหม้อแปลง · **ห้ามต่อไฟบ้าน 220V โดยตรง**"
          aria-invalid={invalid?.includes("text") || undefined}
        />
        <small className={n > NOTICE_TEXT_MAX ? "ntf-over" : undefined}>
          ใส่ <code>**ข้อความ**</code> เพื่อทำตัวหนา · ใช้ <code>·</code> คั่นประโยค · {n}/{NOTICE_TEXT_MAX}
        </small>
      </div>

      <fieldset className="ntf-set">
        <legend>สีของกล่อง</legend>
        <div className="ntf-tones">
          {TONE_KEYS.map((t) => (
            <label key={t} className={`ntf-tone ntc-${t.toLowerCase()}${v.tone === t ? " is-on" : ""}`}>
              <input type="radio" name={`${uid}tone`} value={t} checked={v.tone === t} onChange={() => set({ tone: t })} />
              <i aria-hidden="true" />
              <span><b>{NOTICE_TONES[t].label}</b><small>{NOTICE_TONES[t].hint}</small></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="ntf-set">
        <legend>ไอคอน</legend>
        <div className="ntf-icons" role="radiogroup" aria-label="ไอคอน">
          {NOTICE_ICONS.map((i) => (
            <button key={i.key} type="button" role="radio" aria-checked={v.icon === i.key} className={`ntf-ic${v.icon === i.key ? " is-on" : ""}`} onClick={() => set({ icon: i.key })} data-tip={i.label} aria-label={i.label}>
              <Svg k={i.key} />
            </button>
          ))}
          <button type="button" role="radio" aria-checked={v.icon === "none"} className={`ntf-ic ntf-none${v.icon === "none" ? " is-on" : ""}`} onClick={() => set({ icon: "none" })} data-tip="ไม่มีไอคอน" aria-label="ไม่มีไอคอน">
            ไม่มี
          </button>
        </div>
      </fieldset>
    </div>
  );
}
