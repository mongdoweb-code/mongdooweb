// ข้อความล้วนที่ใช้เดาไฟบ้าน/แรงดันต่ำ (src/lib/supply-note.ts) — ชื่อ + คำอธิบายย่อ + สเปก
// ไม่ใช้คำอธิบายยาว เพราะมักมีคำเตือนทั่วไปหรือพูดถึงรุ่นอื่นปนอยู่
import { htmlToText } from "@/lib/html";

export function supplyText(p: { name: string; shortDescription?: string | null; specs?: unknown }): string {
  const specs = Array.isArray(p.specs)
    ? (p.specs as { label?: unknown; value?: unknown }[]).map((s) => `${String(s?.label ?? "")} ${String(s?.value ?? "")}`).join(" ")
    : "";
  return `${p.name} ${htmlToText(p.shortDescription ?? "")} ${specs}`;
}
