// ไอคอนสายฟ้า "แก้ไขด่วน" แบบ 2D สีเดียว (ใช้สีตัวอักษร = ขาวบนปุ่มส้ม) แทนอีโมจิ ⚡ ที่สีไม่ตรงธีม
export function BoltIcon({ className = "bolt-ic" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M13.2 2.5 4.8 13.4a.6.6 0 0 0 .5 1h5.4l-1.4 7.1c-.1.6.7.9 1 .4l8.4-10.9a.6.6 0 0 0-.5-1h-5.4l1.4-7.1c.1-.6-.7-.9-1-.4Z" fill="currentColor" />
    </svg>
  );
}
