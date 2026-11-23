"use client";
// แถบปุ่มบนหน้าพิมพ์ Data Sheet (ไม่พิมพ์ออก) · ?auto=1 = เปิดหน้าต่างพิมพ์ทันที
import { useEffect } from "react";

export function PrintBar({ back, auto }: { back: string; auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <div className="dsp-bar">
      <a href={back}>← กลับไปหน้าสินค้า</a>
      <span>พิมพ์ หรือเลือกปลายทาง “บันทึกเป็น PDF” เพื่อส่งต่อให้ลูกค้า</span>
      <button type="button" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</button>
    </div>
  );
}
