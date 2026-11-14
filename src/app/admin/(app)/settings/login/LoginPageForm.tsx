"use client";
// ฟอร์มตั้งค่าหน้าเข้าสู่ระบบ + ตัวอย่างสด (iframe /admin/login?preview=1 โหลดใหม่หลังบันทึก)
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { LOGIN_LIMITS, LOGIN_THEMES, type LoginPageConfig } from "@/lib/login-page";
import { resetLoginPage, saveLoginPage, type LoginPageState } from "./actions";
import "./login-settings.css";

type Img = { key: string; url: string };

export function LoginPageForm({ v, images }: { v: LoginPageConfig; images: Img[] }) {
  const [state, action, pending] = useActionState<LoginPageState, FormData>(saveLoginPage, {});
  const [resetState, setResetState] = useState<LoginPageState>({});
  const [resetting, startReset] = useTransition();
  const [order, setOrder] = useState(images.map((i) => i.key));
  const [seenImgs, setSeenImgs] = useState(images);
  if (images !== seenImgs) { setSeenImgs(images); setOrder(images.map((i) => i.key)); }
  const [picked, setPicked] = useState(0);
  const [headline, setHeadline] = useState(v.headline);
  const [glow, setGlow] = useState(v.glow);
  // ค่าจากเซิร์ฟเวอร์เปลี่ยน (หลังบันทึก/คืนค่าเริ่มต้น) → ช่องที่ควบคุมด้วย state ตามค่าใหม่
  const [seenV, setSeenV] = useState(v);
  if (v !== seenV) { setSeenV(v); setHeadline(v.headline); setGlow(v.glow); }
  const fileRef = useRef<HTMLInputElement>(null);
  // ย่อ iframe ขนาดจอ 1440 ให้พอดีกล่องตัวอย่าง
  const pvBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pvBox.current;
    if (!el) return;
    const fit = () => el.style.setProperty("--pv-s", String(el.clientWidth / 1440));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const urlOf = new Map(images.map((i) => [i.key, i.url]));
  const ver = Math.max(state.at ?? 0, resetState.at ?? 0); // บันทึก/คืนค่า → ฟอร์มและตัวอย่างโหลดใหม่
  const room = LOGIN_LIMITS.images - order.length;
  const msg = state.at && (!resetState.at || state.at > resetState.at) ? state : resetState;
  const move = (i: number, d: -1 | 1) => setOrder((o) => { const j = i + d; if (j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  return (
    <div className="lp-cols">
      <form action={action} className="lp-form" key={`f${ver}-${v.headline}-${v.theme}-${v.images.join(",")}`} id="loginPageForm">
        <section className="box">
          <h3>ธีมและแอนิเมชัน</h3>
          <div className="lp-themes" role="radiogroup" aria-label="ธีมสี">
            {LOGIN_THEMES.map(([k, l]) => (
              <label key={k} className={`lp-theme lp-t-${k}`}>
                <input type="radio" name="theme" value={k} defaultChecked={v.theme === k} />
                <i aria-hidden="true" /><span>{l}</span>
              </label>
            ))}
          </div>
          <label className="chk-row"><input type="checkbox" name="animate" defaultChecked={v.animate} /> เปิดแอนิเมชันแสง (ลำแสง ไฟ LED วิ่ง ละอองแสง ตัวเลขนับขึ้น) — ผู้ที่ตั้งค่าเครื่องให้ลดการเคลื่อนไหวจะเห็นแบบนิ่งเสมอ</label>
        </section>

        <section className="box">
          <h3>ฝั่งซ้าย — โซนการตลาด</h3>
          <div className="field"><label htmlFor="lpEyebrow">ป้ายเล็กด้านบน</label><input id="lpEyebrow" name="eyebrow" defaultValue={v.eyebrow} maxLength={60} /></div>
          <div className="field"><label htmlFor="lpHead">หัวข้อหลัก *</label><input id="lpHead" name="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} required /></div>
          <div className="field">
            <label htmlFor="lpGlow">คำที่ให้เรืองแสง (ต้องอยู่ในหัวข้อ)</label>
            <input id="lpGlow" name="glow" value={glow} onChange={(e) => setGlow(e.target.value)} maxLength={30} aria-invalid={!!glow && !headline.includes(glow)} />
            {glow && !headline.includes(glow) ? <small className="err-msg">คำนี้ไม่อยู่ในหัวข้อ — จะไม่เรืองแสง</small> : <small>เว้นว่าง = หัวข้อสีขาวทั้งหมด</small>}
          </div>
          <div className="field"><label htmlFor="lpSub">คำอธิบาย</label><textarea id="lpSub" name="sub" defaultValue={v.sub} maxLength={220} rows={3} /></div>
          <fieldset className="lp-fs">
            <legend>จุดเด่น (สูงสุด {LOGIN_LIMITS.highlights} ข้อ · เว้นว่างได้)</legend>
            {Array.from({ length: LOGIN_LIMITS.highlights }, (_, i) => (
              <input key={i} name="highlight" defaultValue={v.highlights[i] ?? ""} maxLength={90} aria-label={`จุดเด่นข้อ ${i + 1}`} placeholder={`จุดเด่นข้อ ${i + 1}`} />
            ))}
          </fieldset>
          <fieldset className="lp-fs">
            <legend>ตัวเลขเด่น (สูงสุด {LOGIN_LIMITS.stats} ช่อง เช่น 180+ · รายการสินค้า)</legend>
            {Array.from({ length: LOGIN_LIMITS.stats }, (_, i) => (
              <div key={i} className="lp-stat">
                <input name="statValue" defaultValue={v.stats[i]?.value ?? ""} maxLength={12} aria-label={`ตัวเลขช่อง ${i + 1}`} placeholder="180+" />
                <input name="statLabel" defaultValue={v.stats[i]?.label ?? ""} maxLength={30} aria-label={`คำอธิบายตัวเลขช่อง ${i + 1}`} placeholder="รายการสินค้า" />
              </div>
            ))}
          </fieldset>
        </section>

        <section className="box">
          <h3>รูปภาพ / ผลงาน <small>{order.length}/{LOGIN_LIMITS.images} รูป · วนแสดงอัตโนมัติ</small></h3>
          {order.length > 0 && (
            <ul className="lp-imgs">
              {order.map((k, i) => (
                <li key={k}>
                  <input type="hidden" name="keep" value={k} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlOf.get(k)} alt={`รูปที่ ${i + 1}`} />
                  <div className="lp-img-acts">
                    <button type="button" aria-label={`เลื่อนรูปที่ ${i + 1} ไปก่อน`} disabled={i === 0} onClick={() => move(i, -1)}>←</button>
                    <button type="button" aria-label={`เลื่อนรูปที่ ${i + 1} ไปหลัง`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>→</button>
                    <label className="lp-rm"><input type="checkbox" name="remove" value={k} /> ลบ</label>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="field">
            <label htmlFor="lpFiles">เพิ่มรูป (JPG/PNG/WEBP ≤ 10 MB · แนะนำแนวนอน 16:8 เช่น 1600×800)</label>
            <input ref={fileRef} id="lpFiles" type="file" name="newImages" accept="image/jpeg,image/png,image/webp" multiple disabled={room <= 0}
              onChange={(e) => setPicked(e.target.files?.length ?? 0)} />
            <small className={picked > room ? "err-msg" : undefined}>{room <= 0 ? "ครบ 4 รูปแล้ว — ติ๊กลบรูปเดิมแล้วบันทึกก่อน" : picked > room ? `เลือกเกิน — เพิ่มได้อีก ${room} รูป` : `เพิ่มได้อีก ${room} รูป`}</small>
          </div>
          <div className="field"><label htmlFor="lpCap">คำบรรยายใต้รูป</label><input id="lpCap" name="caption" defaultValue={v.caption} maxLength={80} /></div>
          <label className="chk-row"><input type="checkbox" name="useProjects" defaultChecked={v.useProjects} /> ถ้าไม่มีรูปที่อัปโหลด ให้ใช้รูปผลงานติดตั้งที่เผยแพร่ล่าสุด (สูงสุด 4)</label>
        </section>

        <section className="box">
          <h3>ฝั่งขวา — ต้อนรับและแนะนำสินค้า</h3>
          <div className="field"><label htmlFor="lpWel">ข้อความต้อนรับ (หัวข้อ)</label><input id="lpWel" name="welcome" defaultValue={v.welcome} maxLength={60} /></div>
          <div className="field"><label htmlFor="lpWelSub">ข้อความรอง</label><input id="lpWelSub" name="welcomeSub" defaultValue={v.welcomeSub} maxLength={120} /></div>
          <div className="field"><label htmlFor="lpNotice">ประกาศถึงทีม (ไม่บังคับ · ทุกคนที่เปิดหน้านี้เห็น ห้ามใส่ข้อมูลลับ)</label><input id="lpNotice" name="notice" defaultValue={v.notice} maxLength={160} placeholder="เช่น ประชุมทีมขายทุกวันจันทร์ 9:00" /></div>
          <div className="lp-row">
            <label className="chk-row"><input type="checkbox" name="showCategories" defaultChecked={v.showCategories} /> แสดงหมวดสินค้า</label>
            <label className="lp-num">จำนวน <input type="number" name="catCount" min={1} max={LOGIN_LIMITS.cats} defaultValue={v.catCount} aria-label="จำนวนหมวดที่แสดง" /></label>
          </div>
          <div className="lp-row">
            <label className="chk-row"><input type="checkbox" name="showProducts" defaultChecked={v.showProducts} /> แสดงสินค้าแนะนำ (สินค้าขายดีที่มีรูปและมีของ)</label>
            <label className="lp-num">จำนวน <input type="number" name="productCount" min={1} max={LOGIN_LIMITS.products} defaultValue={v.productCount} aria-label="จำนวนสินค้าที่แสดง" /></label>
          </div>
        </section>

        {msg.error && <div className="login-err" role="alert">{msg.error}</div>}
        {msg.ok && <div className="login-info" role="status">{msg.ok}</div>}
        <div className="lp-foot">
          <button type="button" className="btn btn-ghost" disabled={resetting || pending} onClick={() => { if (confirm("คืนค่าเริ่มต้นทั้งหมด? (รูปที่อัปโหลดจะไม่ถูกใช้)")) startReset(async () => setResetState(await resetLoginPage())); }}>คืนค่าเริ่มต้น</button>
          <span className="spacer" />
          <a className="btn btn-outline" href="/admin/login?preview=1" target="_blank" rel="noopener">เปิดตัวอย่างเต็มจอ ↗</a>
          <button className="btn btn-primary" type="submit" disabled={pending || picked > room}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </form>
      <aside className="lp-pv" aria-label="ตัวอย่างหน้าเข้าสู่ระบบ">
        <div className="lp-pv-bar"><span>ตัวอย่าง</span><small>อัปเดตหลังบันทึก</small></div>
        <div className="lp-pv-box" ref={pvBox}><iframe key={ver} src="/admin/login?preview=1&frame=1" title="ตัวอย่างหน้าเข้าสู่ระบบ" loading="lazy" tabIndex={-1} /></div>
      </aside>
    </div>
  );
}
