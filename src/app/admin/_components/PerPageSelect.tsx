"use client";
// เลือกจำนวนรายการต่อหน้า — เปลี่ยนแล้วไปหน้า 1 ของจำนวนใหม่ (ลิงก์คำนวณมาจากเซิร์ฟเวอร์ ตัวกรองเดิมยังอยู่)
import { useRouter } from "next/navigation";

export function PerPageSelect({
  value,
  options,
}: {
  value: number;
  options: { n: number; href: string }[];
}) {
  const router = useRouter();
  return (
    <label className="pg-per">
      <span>แสดง</span>
      <span className="pg-selw">
        <select
          className="sel"
          value={value}
          aria-label="จำนวนรายการต่อหน้า"
          onChange={(e) => {
            const o = options.find((x) => x.n === Number(e.target.value));
            if (o) router.push(o.href);
          }}
        >
          {options.map((o) => (
            <option key={o.n} value={o.n}>
              {o.n}
            </option>
          ))}
        </select>
        <svg
          className="pg-chev"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
      <span>รายการ/หน้า</span>
    </label>
  );
}
