"use client";
// ตัวเลือกกรองในแถบค้นหา (form GET): เลือกแล้วค้นหาทันที ไม่ต้องกดปุ่ม "ค้นหา" — ส่งคำค้นในช่องค้นหาไปด้วย
import type { ComponentProps } from "react";

export function AutoSelect(props: ComponentProps<"select">) {
  return <select {...props} data-auto-submit onChange={(e) => { props.onChange?.(e); e.currentTarget.form?.requestSubmit(); }} />;
}
