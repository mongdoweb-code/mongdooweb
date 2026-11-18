"use client";
// ส่งฟอร์มเข้า server action โดยไม่ล้างค่าที่พิมพ์ไว้ (React ล้างฟอร์มอัตโนมัติเมื่อใช้ action={...})
// ถ้าบันทึกไม่ผ่าน ผู้ใช้แก้แค่ช่องที่ผิดได้เลย ไม่ต้องกรอกใหม่ทั้งหมด
// ผลทุกครั้ง ({ ok, error, fields }) แจ้ง SaveCenter → ป๊อปอัป "บันทึกสำเร็จ/ไม่สำเร็จ" อัตโนมัติ
// (ฟอร์มที่มีป๊อปอัปของตัวเอง ส่ง { popup: false } — ยังบอก SaveCenter ว่าแจ้งผลเองแล้ว ไม่ให้แสดงซ้ำ)
import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import { noticeFromState, notifySave } from "./save-notify";

export function useFormAction<S>(fn: (prev: Awaited<S>, f: FormData) => Promise<S>, initial: Awaited<S>, opts: { popup?: boolean } = {}) {
  const [state, action, pending] = useActionState<S, FormData>(fn, initial);
  const first = useRef(state);
  const popup = opts.popup !== false;
  useEffect(() => {
    if (state === first.current) return; // ค่าเริ่มต้น (ยังไม่ได้ส่ง)
    const n = noticeFromState(state as Parameters<typeof noticeFromState>[0]);
    notifySave(popup ? n : { ...n, silent: true });
  }, [state, popup]);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(fd));
  };
  return [state, onSubmit, pending] as const;
}
