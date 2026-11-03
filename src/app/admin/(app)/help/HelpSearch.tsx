"use client";
// ค้นหาในคู่มือ: ซ่อนหัวข้อที่ไม่ตรงคำค้น (ค้นจากชื่อ ขั้นตอน และเคล็ดลับ) · กลุ่มที่ไม่เหลือหัวข้อถูกซ่อนทั้งกลุ่ม
import { useEffect, useState } from "react";

export function HelpSearch() {
  const [q, setQ] = useState("");
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const k = q.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll<HTMLElement>("[data-guide]").forEach((el) => {
      const hit = !k || (el.dataset.text ?? "").includes(k);
      el.hidden = !hit;
      if (hit) shown++;
      // ค้นเจอ = กางให้อ่านเลย
      if (k && hit) el.querySelector("details")?.setAttribute("open", "");
    });
    document.querySelectorAll<HTMLElement>("[data-group]").forEach((g) => {
      g.hidden = !!k && !g.querySelector("[data-guide]:not([hidden])");
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setN(k ? shown : null);
  }, [q]);
  return (
    <div className="hp-search">
      <label className="sr-only" htmlFor="hpQ">ค้นหาในคู่มือ</label>
      <input id="hpQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาในคู่มือ เช่น สลิป, ใบลดหนี้, นับสต็อก" autoComplete="off" />
      {n !== null && <small className="sub" role="status">{n ? `พบ ${n} หัวข้อ` : "ไม่พบหัวข้อที่ตรงกัน — ลองคำอื่น หรือดูคำถามที่พบบ่อยด้านล่าง"}</small>}
    </div>
  );
}
