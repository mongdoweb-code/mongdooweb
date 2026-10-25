"use client";
// หน้าเปรียบเทียบ (ฝั่งเบราว์เซอร์): ไม่มี ?ids= → ใช้รายการที่เลือกไว้ในเครื่อง · มี ?ids= → บันทึกเป็นรายการในเครื่อง
// (เปิดลิงก์ที่คนอื่นแชร์มาแล้วเพิ่ม/ลบต่อได้ทันที) + ปุ่ม "แสดงเฉพาะที่ต่างกัน"
import { useEffect, useState } from "react";

const KEY = "mdw_compare";
type Lists = { write: (k: string, v: string[]) => void };

function readLocal(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
}

/** ไม่มี ?ids= : พาไปหน้าที่มีรายการในเครื่อง (ถ้ามี) */
export function CompareRedirect({ cleared = false }: { cleared?: boolean }) {
  const [none, setNone] = useState(cleared);
  useEffect(() => {
    if (cleared) {
      const w = window as Window & { mdwLists?: Lists };
      if (w.mdwLists) w.mdwLists.write(KEY, []);
      else
        try {
          localStorage.setItem(KEY, "[]");
        } catch {}
      return;
    }
    const ids = readLocal();
    if (ids.length) location.replace(`/compare?ids=${ids.map(encodeURIComponent).join(",")}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน localStorage ได้หลัง mount เท่านั้น
    else setNone(true);
  }, [cleared]);
  if (!none) return <div className="pg-empty">กำลังโหลดรายการเปรียบเทียบ…</div>;
  return (
    <div className="pg-empty" data-compare-empty>
      <b>ยังไม่ได้เลือกสินค้าเปรียบเทียบ</b>
      กดปุ่ม <span aria-hidden="true">⇄</span> &quot;เปรียบเทียบ&quot; บนการ์ดสินค้าหรือหน้าสินค้า (สูงสุด 4 ชิ้น) แล้วกลับมาที่หน้านี้{" "}
      <a className="link-more" href="/products">
        ดูสินค้าทั้งหมด
      </a>
    </div>
  );
}

/** บันทึกรายการที่แสดงอยู่เป็นรายการเปรียบเทียบในเครื่อง */
export function CompareSync({ ids }: { ids: string[] }) {
  useEffect(() => {
    const cur = readLocal();
    if (cur.join(",") === ids.join(",")) return;
    const w = window as Window & { mdwLists?: Lists };
    if (w.mdwLists) w.mdwLists.write(KEY, ids);
    else
      try {
        localStorage.setItem(KEY, JSON.stringify(ids));
      } catch {}
  }, [ids]);
  return null;
}

/** ซ่อนแถวที่ค่าเหมือนกันทุกชิ้น */
export function DiffToggle({ target }: { target: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      aria-pressed={on}
      aria-controls={target}
      onClick={() => {
        const next = !on;
        setOn(next);
        document.getElementById(target)?.classList.toggle("cmp-only-diff", next);
      }}
    >
      {on ? "แสดงทุกแถว" : "แสดงเฉพาะที่ต่างกัน"}
    </button>
  );
}
