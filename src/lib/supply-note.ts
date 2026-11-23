// คำเตือนการต่อไฟในหน้าสินค้า (กล่องใต้ปุ่มใส่ตะกร้า) — ตั้งแยกได้ทุกสินค้าในหลังบ้าน
// pure: ใช้ได้ทั้ง server (หน้าสินค้า) และ client (ตัวอย่างในฟอร์มหลังบ้าน)

export const SUPPLY_TYPES = ["AUTO", "LOW_VOLTAGE", "MAINS", "HIDDEN"] as const;
export type SupplyType = (typeof SUPPLY_TYPES)[number];

export const SUPPLY_LABELS: Record<SupplyType, string> = {
  AUTO: "อัตโนมัติ (ดูจากหมวดและสเปก)",
  LOW_VOLTAGE: "ไฟแรงดันต่ำ DC12V/24V — ต้องใช้หม้อแปลง",
  MAINS: "ไฟบ้าน AC 220V — ต่อตรงได้",
  HIDDEN: "ไม่แสดงกล่องนี้",
};

/** ความยาวสูงสุดของข้อความเฉพาะสินค้า */
export const SUPPLY_NOTE_MAX = 300;

/** หมวดที่แสดงคำเตือนอัตโนมัติ (เหมือนเดิมก่อนมีการตั้งรายสินค้า) */
export const SUPPLY_AUTO_CATS = new Set(["underwater-light", "pool-light", "fountain-light", "garden-light", "uplight-led"]);

/** ข้อความระบุไฟบ้าน เช่น "AC 85-265V", "AC220V", "100-240V AC" */
export function isMainsText(text: string): boolean {
  return (
    /\bAC\s*:?\s*(?:85|90|100|110|120|180|200|220|230|240)\s*(?:[-–~]\s*\d{2,3}\s*)?V/i.test(text) ||
    /\b(?:85|90|100|110|180|200|220)\s*[-–~]\s*(?:240|250|260|264|265|277)\s*V\s*(?:AC)?\b/i.test(text)
  );
}
/** ข้อความระบุไฟแรงดันต่ำ เช่น "DC12V", "12V DC", "24VDC" */
export function isLowVoltageText(text: string): boolean {
  return /(?:\bDC\s*(?:12|24)\s*V)|(?:\b(?:12|24)\s*V\s*DC)/i.test(text);
}

export type SupplyNote = { kind: "low" | "kit" | "mains" | "custom"; lead: string; strong: string };

export const DEFAULT_NOTES: Record<"low" | "kit" | "mains", Omit<SupplyNote, "kind">> = {
  low: { lead: "ไฟแรงดันต่ำ ต้องต่อผ่านหม้อแปลง · ", strong: "ห้ามต่อไฟบ้าน 220V โดยตรง" },
  kit: { lead: "ชุดพร้อมใช้ มีหม้อแปลงไฟในกล่องแล้ว · ", strong: "ห้ามต่อไฟบ้าน 220V โดยตรง" },
  mains: { lead: "ต่อไฟบ้าน 220V ได้โดยตรง · ", strong: "ควรให้ช่างไฟติดตั้ง" },
};

/** ทำความสะอาดข้อความที่แอดมินพิมพ์: CRLF → LF, เว้นบรรทัดว่างได้ไม่เกิน 1, ตัดความยาว */
export function cleanSupplyNote(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, SUPPLY_NOTE_MAX);
}

export const parseSupplyType = (v: unknown): SupplyType => (SUPPLY_TYPES.includes(v as SupplyType) ? (v as SupplyType) : "AUTO");

/** AUTO แปลว่าอะไรสำหรับสินค้านี้ (ไม่สนข้อความเฉพาะ) */
export function autoSupplyKind(p: { isAccessory: boolean; includesPsu: boolean; categorySlug: string; text: string }): "low" | "kit" | "mains" | null {
  if (p.isAccessory || !SUPPLY_AUTO_CATS.has(p.categorySlug)) return null;
  if (p.includesPsu) return "kit";
  if (isMainsText(p.text) && !isLowVoltageText(p.text)) return "mains";
  return "low";
}

/**
 * กล่องคำเตือนของสินค้า — null = ไม่แสดง
 * ข้อความเฉพาะสินค้า (supplyNote) แทนข้อความมาตรฐานเสมอ ยกเว้นเลือก "ไม่แสดง"
 */
export function supplyNoteFor(p: {
  supplyType: SupplyType;
  supplyNote: string | null;
  isAccessory: boolean;
  includesPsu: boolean;
  categorySlug: string;
  /** ชื่อ + คำอธิบายย่อ + สเปก (ข้อความล้วน) ใช้เดาไฟบ้าน/แรงดันต่ำในโหมดอัตโนมัติ */
  text: string;
}): SupplyNote | null {
  if (p.supplyType === "HIDDEN") return null;
  const custom = cleanSupplyNote(p.supplyNote ?? "");
  if (custom) return { kind: "custom", lead: custom, strong: "" };
  const kind =
    p.supplyType === "MAINS" ? "mains" : p.supplyType === "LOW_VOLTAGE" ? (p.includesPsu ? "kit" : "low") : autoSupplyKind(p);
  return kind ? { kind, ...DEFAULT_NOTES[kind] } : null;
}
