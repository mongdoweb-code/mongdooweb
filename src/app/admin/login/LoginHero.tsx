"use client";
// ส่วนเคลื่อนไหวของโซนการตลาดหน้าเข้าสู่ระบบ: ตัวเลขนับขึ้น + กรอบรูปวนเปลี่ยน (fade) — ปิดเองเมื่อผู้ใช้ตั้ง "ลดการเคลื่อนไหว"
import { useEffect, useState } from "react";
import type { LoginStat } from "@/lib/login-page";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** "180+" → นับ 0 → 180 แล้วต่อด้วย "+" · ค่าที่ไม่ขึ้นต้นด้วยตัวเลข (เช่น IP68) แสดงตรงๆ */
function CountUp({ value, animate }: { value: string; animate: boolean }) {
  const m = /^(\d[\d,]*)(.*)$/.exec(value);
  const target = m ? Number(m[1].replace(/,/g, "")) : NaN;
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!animate || !Number.isFinite(target) || reduced()) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1400);
      setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animate, target]);
  if (!m || n === null) return <>{value}</>;
  return <>{n.toLocaleString("th-TH")}{m[2]}</>;
}

export function HeroStats({ stats, animate }: { stats: LoginStat[]; animate: boolean }) {
  return (
    <dl className="lg-stats">
      {stats.map((s) => (
        <div key={s.label}>
          <dt>{s.label}</dt>
          <dd><CountUp value={s.value} animate={animate} /></dd>
        </div>
      ))}
    </dl>
  );
}

export function HeroGallery({ slides, caption, animate }: { slides: { src: string; title: string }[]; caption: string; animate: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!animate || slides.length < 2 || reduced()) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 4500);
    return () => clearInterval(t);
  }, [animate, slides.length]);
  const cur = slides[i] ?? slides[0];
  return (
    <figure className="lg-gal">
      <div className="lg-gal-frame">
        {slides.map((s, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={s.src} src={s.src} alt={k === i ? s.title || caption : ""} className={k === i ? "on" : ""} loading={k === 0 ? "eager" : "lazy"} />
        ))}
      </div>
      <figcaption>
        <span>{cur.title || caption}</span>
        {slides.length > 1 && (
          <span className="lg-dots" role="group" aria-label="เลือกรูป">
            {slides.map((s, k) => <button key={s.src} type="button" aria-label={`รูปที่ ${k + 1}`} aria-pressed={k === i} onClick={() => setI(k)} />)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
