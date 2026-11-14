// สถานะงานภายในร้านของเอกสารขาย (แบบป้ายในแชต LINE OA): ต้องดำเนินการ · เสร็จสิ้น · ยังไม่ระบุ
// ใช้ภายในร้านเท่านั้น — ไม่พิมพ์บนเอกสาร ไม่ส่งไปหน้าลูกค้า (toView/DocView ไม่มีฟิลด์นี้)
// ไม่มี import ฝั่ง server จึงใช้ได้ทั้ง server และ client component

export type WorkState = "TODO" | "DONE";
/** ค่าใน URL ของตัวกรอง (?work=) */
export type WorkFilter = "" | "todo" | "done" | "none";

export const WORK_META: Record<WorkState, { label: string; short: string; tone: "todo" | "done" }> = {
  TODO: { label: "ต้องดำเนินการ", short: "ต้องทำ", tone: "todo" },
  DONE: { label: "เสร็จสิ้น", short: "เสร็จ", tone: "done" },
};

export const WORK_FILTERS: [WorkFilter, string][] = [["", "ทั้งหมด"], ["todo", "ต้องดำเนินการ"], ["done", "เสร็จสิ้น"], ["none", "ยังไม่ระบุ"]];

export const WORK_NOTE_MAX = 200;

/** ค่าจากฟอร์ม → สถานะ (null = ล้าง) · ค่าอื่น = undefined (ไม่ถูกต้อง) */
export function parseWorkState(v: unknown): WorkState | null | undefined {
  if (v === "TODO" || v === "DONE") return v;
  if (v === "NONE" || v === "") return null;
  return undefined;
}

export function parseWorkFilter(v: unknown): WorkFilter {
  return v === "todo" || v === "done" || v === "none" ? v : "";
}

/** ตัวกรอง → where ของ Prisma (ไม่ import Prisma เพื่อให้ใช้ได้ทุกที่) */
export function workWhere(f: WorkFilter): { workState?: WorkState | null } {
  return f === "todo" ? { workState: "TODO" } : f === "done" ? { workState: "DONE" } : f === "none" ? { workState: null } : {};
}

/** ข้อความในประวัติเอกสาร */
export function workEventNote(state: WorkState | null, note: string) {
  const head = state ? WORK_META[state].label : "ล้างสถานะงาน";
  return [head, note].filter(Boolean).join(" — ").slice(0, 600);
}
