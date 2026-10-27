// กฎการลบ/ปิดบังข้อมูลส่วนบุคคล (PDPA) แบบ pure — ใช้ใน src/lib/pdpa.ts และทดสอบได้โดยไม่ต้องมีฐานข้อมูล (tests/unit/privacy.test.ts)

const digits = (s: string) => s.replace(/\D/g, "");

export const REDACTED = "ลบตามคำขอ PDPA";

/** ฟิลด์ใน AdminLog.diff ที่เป็นข้อมูลส่วนบุคคล → ค่าก่อน/หลังถูกแทนด้วย REDACTED (ชื่อฟิลด์ยังอยู่ ให้รู้ว่าเคยแก้อะไร) */
export const PII_DIFF_KEYS = new Set([
  "customerName", "name", "contactName", "phone", "email", "lineId", "addressLine", "subdistrict", "district", "province", "postalCode",
  "address", "shipTo", "note", "taxInvoice", "tags", "acceptedBy", "cancelReason", "body", "title",
]);

/** ชนิดเหตุการณ์คำสั่งซื้อที่ข้อความมักมีข้อมูลส่วนบุคคล (ค่าเก่า/ใหม่ของที่อยู่, เหตุผลที่ลูกค้าพิมพ์, โน้ต) → แทนทั้งข้อความ */
export const FREE_TEXT_EVENTS = new Set(["EDITED", "NOTE", "CANCELLED", "REFUNDED"]);
/** ชนิดบันทึกหลังบ้านที่ข้อความเป็นข้อความอิสระเกี่ยวกับลูกค้า → แทนทั้งข้อความ (ส่วนชนิดอื่นลบเฉพาะคำที่ตรงกับข้อมูลของบุคคล) */
export const FREE_TEXT_LOGS = new Set(["NOTE", "TASK", "CUSTOMER"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** คำที่ต้องลบออกจากข้อความ: เบอร์ (ตัวเลขล้วน/มีขีด/เว้นวรรค), อีเมล, ชื่อ, ที่อยู่ — ตัดคำสั้นเกินไป (กันลบคำทั่วไป) */
export function needlesOf(values: (string | null | undefined)[]) {
  const out = new Set<string>();
  for (const raw of values) {
    const v = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (v.length < 3 || v === "-" || v === REDACTED) continue;
    out.add(v);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** เบอร์โทรในข้อความอาจเขียน 0811112222 / 081-111-2222 / 081 111 2222 → regex ที่ยอมขีด/ช่องว่างระหว่างตัวเลข */
const phoneRe = (digits: string) => new RegExp(digits.split("").map(esc).join("[-\\s.]?"), "g");

/** แทนข้อมูลของบุคคลในข้อความด้วย [ลบแล้ว] */
export function scrubText(text: string, needles: string[], phones: string[] = []) {
  let t = text;
  for (const p of phones) if (/^\d{9,10}$/.test(p)) t = t.replace(phoneRe(p), "[ลบแล้ว]");
  for (const n of needles) t = t.replace(new RegExp(esc(n), "gi"), "[ลบแล้ว]");
  return t;
}

/** diff ของ AdminLog: ค่าในฟิลด์ข้อมูลส่วนบุคคล → REDACTED · ฟิลด์อื่นเป็นข้อความ → ลบคำที่ตรงกับบุคคล */
export function redactDiff(diff: unknown, needles: string[], phones: string[] = []): Record<string, [unknown, unknown]> | null {
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
  const out: Record<string, [unknown, unknown]> = {};
  const fix = (k: string, v: unknown) => (v === null || v === undefined || v === "" ? v ?? null : PII_DIFF_KEYS.has(k) ? REDACTED : typeof v === "string" ? scrubText(v, needles, phones) : v);
  for (const [k, v] of Object.entries(diff as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    out[k] = [fix(k, v[0]), fix(k, v[1])];
  }
  return Object.keys(out).length ? out : null;
}

/** ข้อความของเหตุการณ์คำสั่งซื้อหลังลบ */
export function redactEventNote(type: string, note: string | null, needles: string[], phones: string[] = []) {
  if (note == null || note === "") return note;
  return FREE_TEXT_EVENTS.has(type) ? REDACTED : scrubText(note, needles, phones);
}

/** ข้อความของบันทึกหลังบ้านที่ผูกกับคำสั่งซื้อ/ลูกค้าของบุคคล: ข้อความอิสระ/การแก้ข้อมูลผู้รับ → แทนทั้งข้อความ (คงเลขอ้างอิงไว้) */
export function redactLogNote(type: string, note: string | null, ref: string, needles: string[], phones: string[] = []) {
  if (note == null || note === "") return note;
  if (FREE_TEXT_LOGS.has(type) || /แก้ไขข้อมูล/.test(note)) return `${ref}: ${REDACTED}`;
  return scrubText(note, needles, phones);
}

/** ใช้ส่งข่าวสาร/โปรโมชันได้หรือไม่ */
export function marketingAllowed(c: { marketingOptOut: boolean; phone: string | null; email: string | null }, blocked: { phones: Set<string>; emails: Set<string> }) {
  if (c.marketingOptOut) return false;
  if (c.phone && blocked.phones.has(digits(c.phone))) return false;
  if (c.email && blocked.emails.has(c.email.toLowerCase())) return false;
  return true;
}

