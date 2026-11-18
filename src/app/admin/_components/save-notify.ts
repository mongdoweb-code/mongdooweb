// ช่องทางกลางแจ้งผลการบันทึกของหลังบ้าน → ป๊อปอัปเดียวกันทุกเมนู (SaveCenter ใน layout หลังบ้าน)
// - ฟอร์มที่ใช้ useFormAction: แจ้งให้อัตโนมัติจากผล { ok, error, fields }
// - ฟอร์ม server action ในหน้า server (<form action={…}>): SaveCenter ดูการส่งฟอร์ม + ผลตอบกลับเอง
// - ตัวแก้ไขที่เรียก action ตรง (ไม่ผ่านฟอร์ม): เรียก notifySave(...) เอง
// ใช้ได้ในเบราว์เซอร์เท่านั้น (ฝั่ง server เรียกแล้วไม่มีผล)

export type SaveNotice = {
  ok: boolean;
  /** หัวข้อ (ไม่ใส่ = เดาจากปุ่มที่กด เช่น "ลบสำเร็จ" / "บันทึกสำเร็จ") */
  title?: string;
  /** ข้อความรอง */
  message?: string;
  /** ปุ่ม "ดู…" ตอนสำเร็จ */
  viewHref?: string;
  viewLabel?: string;
  /** ชื่อช่องที่ผิด (ปุ่ม "แก้ไขช่องที่ผิด" พาไปช่องแรก) */
  fields?: string[];
  /** true = ไม่แสดงป๊อปอัป แต่บอก SaveCenter ว่าแจ้งผลเองแล้ว (เช่น ขั้นตอนพรีวิว CSV) */
  silent?: boolean;
};

export const SAVE_EVENT = "mdw:save";

export function notifySave(n: SaveNotice) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SaveNotice>(SAVE_EVENT, { detail: n }));
}

type StateLike = { ok?: unknown; error?: unknown; fields?: unknown } | null | undefined;

/** ผลจาก server action ({ ok?: string; error?: string; fields?: string[] }) → การแจ้งผล (ไม่มีทั้ง ok/error = เงียบ) */
export function noticeFromState(s: StateLike): SaveNotice {
  if (!s || typeof s !== "object") return { ok: true, silent: true };
  const fields = Array.isArray(s.fields) ? s.fields.filter((x): x is string => typeof x === "string") : undefined;
  if (typeof s.error === "string" && s.error) return { ok: false, message: s.error, fields };
  if (s.ok) return { ok: true, message: typeof s.ok === "string" ? s.ok : undefined };
  return { ok: true, silent: true };
}

/** หัวข้อป๊อปอัปจากข้อความบนปุ่มที่กด */
export function titleFor(label: string, ok: boolean) {
  const l = label.replace(/\s+/g, " ").trim();
  const verb =
    /ลบ/.test(l) ? "ลบ"
    : /ยกเลิก/.test(l) ? "ยกเลิก"
    : /อนุมัติ/.test(l) ? "อนุมัติ"
    : /ปฏิเสธ/.test(l) ? "ปฏิเสธ"
    : /คืนค่า|ย้อน/.test(l) ? "คืนค่า"
    : /เผยแพร่/.test(l) ? "เผยแพร่"
    : /ออก(ใบ|เอกสาร)/.test(l) ? "ออกเอกสาร"
    : /ส่ง/.test(l) && !/บันทึก/.test(l) ? "ส่ง"
    : /นำเข้า/.test(l) ? "นำเข้า"
    : /อัปโหลด/.test(l) ? "อัปโหลด"
    : /เพิ่ม|สร้าง/.test(l) ? "เพิ่ม"
    : "บันทึก";
  return `${verb}${ok ? "สำเร็จ" : "ไม่สำเร็จ"}`;
}
