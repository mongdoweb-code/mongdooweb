"use client";
// แถบเมนูด่วนติดด้านบนของฟอร์มยาว (เช่น หน้าแก้ไขสินค้า) — กดแล้วเลื่อนไปยังส่วนนั้น
// - ไฮไลต์ส่วนที่กำลังดูอยู่ตามการเลื่อน (scroll-spy) · ส่วนที่ไม่มีในหน้า (เช่น ไฟล์ดาวน์โหลดของสินค้าใหม่) ถูกซ่อนเอง
// - ส่วนที่มีช่องผิดหลังกดบันทึกมีจุดแดง และเลื่อนไปยังส่วนแรกที่ผิดให้อัตโนมัติ
// - แถบล้นจอ (มือถือ/จอแคบ) เลื่อนด้วยปุ่ม ‹ › หรือปัดนิ้ว · ปุ่มบันทึกอยู่ในแถบ กดได้จากทุกตำแหน่ง
import { useCallback, useEffect, useRef, useState } from "react";

export type NavSection = { id: string; label: string };

const BAD = '[aria-invalid="true"], [style*="--c-err"], .bad, .login-err';

export function SectionNav({ sections, watch, action }: {
  sections: NavSection[];
  /** ค่าที่เปลี่ยนเมื่อผลการบันทึกเปลี่ยน (ใช้ตรวจหาส่วนที่ผิดใหม่) */
  watch?: string;
  /** ปุ่มด้านขวาของแถบ (เช่น บันทึก) */
  action?: React.ReactNode;
}) {
  const bar = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [edge, setEdge] = useState({ l: false, r: false });
  /** กดเมนูแล้วระหว่างเลื่อนอัตโนมัติ ไม่ให้ scroll-spy เปลี่ยนไฮไลต์กลางทาง */
  const lock = useRef<{ id: string; until: number } | null>(null);

  const offset = () => (bar.current ? bar.current.getBoundingClientRect().bottom + 12 : 80);

  const go = (id: string, focus = true) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = el.getBoundingClientRect().top + window.scrollY - offset();
    lock.current = { id, until: Date.now() + 900 };
    setActive(id);
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    history.replaceState(null, "", `#${id}`);
    if (focus) {
      // ย้ายโฟกัสไปหัวข้อของส่วน (โปรแกรมอ่านหน้าจอ/แป้นพิมพ์ทำต่อได้ทันที)
      const h = el.querySelector<HTMLElement>("h2, h3") ?? el;
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
  };

  // ส่วนที่มีอยู่จริงในหน้า (บางส่วนแสดงเฉพาะสินค้าที่บันทึกแล้ว / หมวดที่มีสเปก)
  // ตรวจตอนเปิดหน้า · หลังบันทึก (watch) · หลังเปลี่ยนค่าในฟอร์ม (เช่น เปลี่ยนหมวด → สเปกตามหมวด)
  // ไม่ใช้ MutationObserver ทั้งหน้า — ทำให้ server action ค้าง (setState ระหว่าง transition ทุกครั้งที่ DOM เปลี่ยน)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const scan = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const next = sections.filter((s) => document.getElementById(s.id)).map((s) => s.id);
        setPresent((p) => (next.join() === p.join() ? p : next));
      }, 60);
    };
    scan();
    document.addEventListener("change", scan);
    return () => {
      clearTimeout(t);
      document.removeEventListener("change", scan);
    };
  }, [sections, watch]);

  // scroll-spy: ส่วนที่หัวข้อผ่านเส้นใต้แถบล่าสุด (สองคอลัมน์ก็ใช้ได้ — เลือกตัวที่ใกล้เส้นที่สุด)
  useEffect(() => {
    let raf = 0;
    const spy = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const l = lock.current;
        if (l && Date.now() < l.until) return setActive(l.id);
        lock.current = null;
        // ส่วนที่หัวข้อผ่านเส้นใต้แถบมาล่าสุด · ยังไม่ผ่านเลย = ส่วนแรก
        const line = offset() + 8;
        let best: string | null = present[0] ?? null;
        let bestTop = -Infinity;
        for (const id of present) {
          const top = document.getElementById(id)?.getBoundingClientRect().top;
          if (top !== undefined && top <= line && top > bestTop) {
            best = id;
            bestTop = top;
          }
        }
        // เลื่อนสุดหน้าแล้ว: ส่วนล่างสุดที่เห็นบนจอ (ส่วนสั้นท้ายหน้าไม่มีทางผ่านเส้น)
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          let low = -Infinity;
          for (const id of present) {
            const top = document.getElementById(id)?.getBoundingClientRect().top;
            if (top !== undefined && top < window.innerHeight && top > low) {
              low = top;
              best = id;
            }
          }
        }
        setActive(best);
      });
    };
    spy();
    window.addEventListener("scroll", spy, { passive: true });
    window.addEventListener("resize", spy);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", spy);
      window.removeEventListener("resize", spy);
    };
  }, [present]);

  // ส่วนที่มีช่องผิด → จุดแดง + เลื่อนไปส่วนแรกที่ผิด
  useEffect(() => {
    const t = setTimeout(() => {
      const bad = present.filter((id) => document.getElementById(id)?.querySelector(BAD));
      setErrors(bad);
      if (bad.length && watch) go(bad[0], false);
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, present]);

  // แท็บที่ใช้งานอยู่ต้องมองเห็นในแถบเสมอ + ปุ่ม ‹ › เมื่อแถบล้น
  const measure = useCallback(() => {
    const t = track.current;
    if (!t) return;
    setEdge({ l: t.scrollLeft > 2, r: t.scrollLeft + t.clientWidth < t.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const t = track.current;
    if (!t) return;
    measure();
    t.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(t);
    return () => {
      t.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, present]);
  useEffect(() => {
    const t = track.current;
    const a = t?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!t || !a) return;
    const l = a.offsetLeft - 40;
    const r = a.offsetLeft + a.offsetWidth + 40 - t.clientWidth;
    if (t.scrollLeft > l) t.scrollTo({ left: l, behavior: "smooth" });
    else if (t.scrollLeft < r) t.scrollTo({ left: r, behavior: "smooth" });
  }, [active]);

  // เปิดลิงก์ที่มี #ส่วน มา → เลื่อนไปที่ส่วนนั้น
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && sections.some((s) => s.id === id)) t = setTimeout(() => go(id, false), 150);
    };
    fromHash();
    // เปลี่ยน #ส่วน ในหน้าเดิม (ลิงก์/ปุ่มย้อนกลับ) ก็เลื่อนตาม
    window.addEventListener("hashchange", fromHash);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", fromHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shift = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.7, behavior: "smooth" });
  const list = sections.filter((s) => present.includes(s.id));

  return (
    <nav ref={bar} className="snav" aria-label="ไปยังส่วนของฟอร์ม">
      <button type="button" className="snav-arr l" aria-label="เลื่อนเมนูไปทางซ้าย" hidden={!edge.l} onClick={() => shift(-1)}>‹</button>
      <div ref={track} className="snav-track">
        {list.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`snav-a${errors.includes(s.id) ? " err" : ""}`}
            aria-current={active === s.id ? "true" : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(s.id);
            }}
          >
            {s.label}
            {errors.includes(s.id) && <span className="snav-dot" aria-label="มีช่องที่ต้องแก้" />}
          </a>
        ))}
      </div>
      <button type="button" className="snav-arr r" aria-label="เลื่อนเมนูไปทางขวา" hidden={!edge.r} onClick={() => shift(1)}>›</button>
      {action && <div className="snav-act">{action}</div>}
    </nav>
  );
}
