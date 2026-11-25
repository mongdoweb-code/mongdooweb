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

/**
 * คำที่ใช้บ่อยในหมายเหตุสถานะงาน (แท็กช่วยเลือก) — สรุปจากงานขายไฟของร้าน แยกตามชนิดเอกสาร
 * แสดงคู่กับคำที่ร้านเคยพิมพ์บ่อย (recentWorkNotes) · กดแท็ก = เติมลงช่องหมายเหตุ (ยังไม่บันทึกจนกดบันทึก/เลือกสถานะ)
 */
export const WORK_SUGGEST: Record<"QUOTATION" | "INVOICE" | "RECEIPT" | "CREDIT_NOTE" | "DELIVERY", string[]> = {
  QUOTATION: ["รอลูกค้าตอบรับ", "โทรติดตาม", "ส่งใบเสนอราคาทาง LINE แล้ว", "ลูกค้าขอส่วนลด", "รอยืนยันรุ่น/ขนาด", "รอยืนยันจำนวน", "รอสินค้าเข้า", "รอโอนมัดจำ", "นัดดูหน้างาน", "ทำราคาใหม่"],
  INVOICE: ["รอโอนเงิน", "วางบิลแล้ว", "รอรอบจ่ายเงิน", "รอเช็ค", "ทวงถามแล้ว", "รอสลิป", "รอหนังสือรับรองหัก ณ ที่จ่าย", "รอจัดส่ง", "ส่งใบแจ้งหนี้ตัวจริง"],
  RECEIPT: ["รอจัดส่ง", "จัดส่งแล้ว", "รอเลขพัสดุ", "ส่งใบเสร็จตัวจริง", "รอหนังสือรับรองหัก ณ ที่จ่าย", "ลูกค้าขอใบกำกับภาษี", "รอติดตั้ง", "ติดตั้งเสร็จแล้ว"],
  CREDIT_NOTE: ["รอรับสินค้าคืน", "รับสินค้าคืนแล้ว", "รอโอนเงินคืน", "โอนเงินคืนแล้ว", "เปลี่ยนสินค้าใหม่", "ส่งเคลมผู้ผลิต"],
  DELIVERY: ["นัดวันส่ง", "รอจัดส่ง", "จัดส่งแล้ว", "รอลูกค้าเซ็นรับ", "รอเลขพัสดุ", "ส่งรถร้าน", "ลูกค้ามารับเอง", "สินค้าไม่ครบ ส่งเพิ่ม"],
};
export const WORK_SUGGEST_MAX = 14;

/** แท็กที่จะแสดง: คำที่ร้านใช้บ่อยก่อน แล้วคำแนะนำของชนิดเอกสาร (ไม่ซ้ำ ไม่ว่าง) */
export function workSuggestions(type: keyof typeof WORK_SUGGEST, used: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...used, ...WORK_SUGGEST[type]]) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || t.length > 40 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= WORK_SUGGEST_MAX) break;
  }
  return out;
}

/** เติมแท็กลงหมายเหตุ: ว่าง = แทน · มีแล้ว = ไม่ซ้ำ · อื่นๆ = ต่อท้ายด้วย " · " (ตัดที่ WORK_NOTE_MAX) */
export function addWorkNote(text: string, tag: string): string {
  const cur = text.trim();
  if (!cur) return tag;
  if (cur.split(/\s*·\s*/).some((x) => x.toLowerCase() === tag.toLowerCase())) return cur;
  return `${cur} · ${tag}`.slice(0, WORK_NOTE_MAX);
}
