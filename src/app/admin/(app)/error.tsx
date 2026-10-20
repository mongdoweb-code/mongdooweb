"use client";
// ข้อผิดพลาดในหลังบ้าน — ไม่ทำให้เมนูหาย แสดงข้อความภาษาไทยและปุ่มลองใหม่ (รายละเอียดอยู่ใน log ของเซิร์ฟเวอร์)
import { useEffect } from "react";

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <main className="main">
      <div className="empty" role="alert" style={{ background: "#fff", padding: 32 }}>
        <b>ทำรายการไม่สำเร็จ</b>
        <p>ระบบขัดข้องชั่วคราว ข้อมูลที่บันทึกไปแล้วไม่หาย ลองกด “ลองใหม่” หรือรีเฟรชหน้า</p>
        {digest && <p className="sub">รหัสอ้างอิงสำหรับผู้ดูแลระบบ: {digest}</p>}
        <p style={{ marginTop: 14 }}><button className="btn btn-primary" type="button" onClick={() => retry()}>ลองใหม่</button></p>
      </div>
    </main>
  );
}
