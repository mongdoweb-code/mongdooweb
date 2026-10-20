"use client";
// ส่งฟอร์มเข้า server action โดยไม่ล้างค่าที่พิมพ์ไว้ (React ล้างฟอร์มอัตโนมัติเมื่อใช้ action={...})
// ถ้าบันทึกไม่ผ่าน ผู้ใช้แก้แค่ช่องที่ผิดได้เลย ไม่ต้องกรอกใหม่ทั้งหมด
import { startTransition, useActionState, type FormEvent } from "react";

export function useFormAction<S>(fn: (prev: Awaited<S>, f: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, action, pending] = useActionState<S, FormData>(fn, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(fd));
  };
  return [state, onSubmit, pending] as const;
}
