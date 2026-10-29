"use client";
// บอกกระดิ่งแจ้งเตือนให้นับใหม่ทันที (เช่น หลังบันทึกงานใหม่) — ไม่ต้องรอรอบ 60 วินาที
import { useEffect } from "react";

export function NotifPing() {
  useEffect(() => {
    window.dispatchEvent(new Event("mdw:notif"));
  }, []);
  return null;
}
