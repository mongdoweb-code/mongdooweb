// ตัวช่วยแสดงผลที่ใช้ได้ทั้ง server และ client component (ไม่มี "use client")
export const formatBaht = (n: number) => "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
