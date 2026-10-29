"use client";
// ช่องตารางที่กดแล้วแก้ได้ทันที (ราคา / สต็อก): คลิก → พิมพ์ → Enter บันทึก · Esc ยกเลิก · คลิกที่อื่น = บันทึก
// แสดงผลสำเร็จ/ผิดพลาดตรงช่องนั้น แล้วโหลดข้อมูลหน้าใหม่ (ตัวเลขอื่นที่เกี่ยวข้อง เช่น ป้าย "หมด" อัปเดตตาม)
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok?: string; error?: string; display?: string };

export function InlineCell<F extends string>({
  id,
  field,
  value,
  display,
  label,
  action,
  inputMode = "decimal",
  placeholder,
  className,
  hint,
}: {
  id: string;
  field: F;
  /** ค่าเริ่มต้นในช่องพิมพ์ */
  value: string;
  /** ข้อความที่แสดงตอนไม่ได้แก้ */
  display: React.ReactNode;
  label: string;
  action: (id: string, field: F, value: string) => Promise<Result>;
  inputMode?: "decimal" | "numeric";
  placeholder?: string;
  className?: string;
  /** คำอธิบายเล็กใต้ช่องตอนแก้ */
  hint?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [shown, setShown] = useState<React.ReactNode>(display);
  const [msg, setMsg] = useState<Result>({});
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);

  // ข้อมูลใหม่จากเซิร์ฟเวอร์
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setText(value);
    setShown(display);
  }

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  useEffect(() => {
    if (!msg.ok) return;
    const t = setTimeout(() => setMsg({}), 2200);
    return () => clearTimeout(t);
  }, [msg]);

  const save = () => {
    if (saving.current) return;
    if (text.trim() === value.trim()) {
      setEditing(false);
      return;
    }
    saving.current = true;
    start(async () => {
      const r = await action(id, field, text);
      saving.current = false;
      setMsg(r);
      if (r.error) {
        input.current?.focus();
        return;
      }
      if (r.display !== undefined) setShown(r.display || "—");
      setEditing(false);
      router.refresh();
    });
  };

  if (editing)
    return (
      <span className={`ic ic-on${className ? ` ${className}` : ""}`}>
        <input
          ref={input}
          className={`ic-in${msg.error ? " bad" : ""}`}
          value={text}
          inputMode={inputMode}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={!!msg.error}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              setText(value);
              setMsg({});
              setEditing(false);
            }
          }}
          onBlur={() => !msg.error && save()}
        />
        {pending ? <span className="ic-msg">กำลังบันทึก…</span> : msg.error ? <span className="ic-msg err" role="alert">{msg.error}</span> : hint ? <span className="ic-msg">{hint}</span> : null}
      </span>
    );
  return (
    <button type="button" className={`ic${msg.ok ? " ic-ok" : ""}${className ? ` ${className}` : ""}`} aria-label={`${label} (กดเพื่อแก้)`} data-tip={msg.ok ?? "กดเพื่อแก้"} onClick={() => setEditing(true)}>
      <span className="ic-v">{shown}</span>
      <svg className="ic-pen" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}
