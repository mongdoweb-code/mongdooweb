// ข้อความแจ้งเตือนหน้าสินค้า (ใต้ปุ่มสั่งซื้อ) — ส่วนที่ไม่แตะฐานข้อมูล ใช้ร่วมกันทั้งหลังบ้าน หน้าร้าน และเทสต์
// คลังข้อความ (ProductNotice) ใช้ซ้ำได้กับทุกสินค้า: แสดงเฉพาะสินค้าที่เลือก · ทุกสินค้า · ทุกสินค้าในหมวดที่เลือก
// สินค้าแต่ละตัว: noticeIds = เลือกเอง · noticeOff = ปิดข้อความอัตโนมัติเฉพาะตัวนี้

export type NoticeTone = "INFO" | "WARNING" | "DANGER" | "SUCCESS";
export type NoticeScope = "MANUAL" | "ALL" | "CATEGORIES";
export type NoticeView = { id: string; text: string; tone: NoticeTone; icon: string };
export type NoticeRow = NoticeView & {
  name: string; scope: NoticeScope; categoryIds: string[]; skipAccessory: boolean; isActive: boolean; sortOrder: number;
};

export const NOTICE_NAME_MAX = 60;
export const NOTICE_TEXT_MAX = 220;
export const NOTICE_MAX_PER_PRODUCT = 6;

export const NOTICE_TONES: Record<NoticeTone, { label: string; hint: string }> = {
  WARNING: { label: "ข้อควรระวัง", hint: "ส้ม — เตือนการใช้งาน" },
  INFO: { label: "ข้อมูลทั่วไป", hint: "ครีม — บอกข้อมูลเพิ่มเติม" },
  DANGER: { label: "อันตราย / ห้าม", hint: "แดง — สิ่งที่ห้ามทำเด็ดขาด" },
  SUCCESS: { label: "จุดเด่น / ข้อดี", hint: "เขียว — บอกข้อดีของสินค้า" },
};
export const TONE_KEYS = Object.keys(NOTICE_TONES) as NoticeTone[];

/** ไอคอนเส้น 24×24 (stroke) — วาดเอง ใช้ทั้งหลังบ้านและหน้าร้าน */
export const NOTICE_ICONS: { key: string; label: string; path: string }[] = [
  { key: "bolt", label: "ไฟฟ้า", path: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>' },
  { key: "plug", label: "ปลั๊กไฟ", path: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>' },
  { key: "box", label: "ชุดพร้อมใช้", path: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>' },
  { key: "alert", label: "เตือน", path: '<path d="M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17h.01"/>' },
  { key: "stop", label: "ห้าม", path: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>' },
  { key: "info", label: "ข้อมูล", path: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8h.01"/>' },
  { key: "check", label: "ถูกต้อง", path: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>' },
  { key: "water", label: "กันน้ำ", path: '<path d="M12 3c3.2 4.2 6 7.4 6 11a6 6 0 0 1-12 0c0-3.6 2.8-6.8 6-11z"/>' },
  { key: "shield", label: "รับประกัน", path: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>' },
  { key: "tool", label: "ติดตั้ง", path: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 6.7-6.7a4 4 0 0 0-5-5L10 4.6z"/><path d="M3 21l6-6"/>' },
  { key: "truck", label: "จัดส่ง", path: '<path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>' },
  { key: "clock", label: "เวลา", path: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>' },
  { key: "sun", label: "กลางแจ้ง", path: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' },
  { key: "thermo", label: "ความร้อน", path: '<path d="M14 14.8V4.5a2 2 0 0 0-4 0v10.3a4 4 0 1 0 4 0z"/><path d="M12 10v7"/>' },
];
const ICON_MAP = new Map(NOTICE_ICONS.map((i) => [i.key, i.path]));
export const noticeIconPath = (key: string) => ICON_MAP.get(key) ?? ICON_MAP.get("info")!;

const line = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** ข้อความ → ชิ้นส่วน (b = ตัวหนา จาก **…**) — หน้าร้านแสดงเป็นข้อความธรรมดา ไม่มี HTML */
export function noticeParts(text: string): { t: string; b: boolean }[] {
  const out: { t: string; b: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), b: false });
    out.push({ t: m[1], b: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), b: false });
  return out.filter((p) => p.t);
}

/** ชื่อเรียกอัตโนมัติจากข้อความ (ตัด ** และย่อ) */
export const noticeNameFrom = (text: string) => line(text.replace(/\*\*/g, "").split(/[·.|]/)[0], NOTICE_NAME_MAX);

export type NoticeInput = { name?: unknown; text?: unknown; tone?: unknown; icon?: unknown; scope?: unknown; categoryIds?: unknown; skipAccessory?: unknown; isActive?: unknown };
export type NoticeClean = { name: string; text: string; tone: NoticeTone; icon: string; scope: NoticeScope; categoryIds: string[]; skipAccessory: boolean; isActive: boolean };

/** ตรวจข้อมูลจากฟอร์ม — categoryIds ที่ส่งมาต้องอยู่ใน validCats */
export function cleanNotice(p: NoticeInput, validCats: Set<string>): { data?: NoticeClean; error?: string; fields?: string[] } {
  const text = line(p.text, NOTICE_TEXT_MAX + 20);
  const bad: string[] = [], msgs: string[] = [];
  if (text.replace(/\*\*/g, "").trim().length < 3) { bad.push("text"); msgs.push("กรุณาพิมพ์ข้อความแจ้งเตือน"); }
  else if (text.length > NOTICE_TEXT_MAX) { bad.push("text"); msgs.push(`ข้อความยาวเกิน ${NOTICE_TEXT_MAX} ตัวอักษร`); }
  else if ((text.match(/\*\*/g)?.length ?? 0) % 2) { bad.push("text"); msgs.push("เครื่องหมาย ** สำหรับตัวหนาต้องมีเปิดและปิด"); }
  const name = line(p.name, NOTICE_NAME_MAX) || noticeNameFrom(text);
  const tone = TONE_KEYS.includes(p.tone as NoticeTone) ? (p.tone as NoticeTone) : "WARNING";
  const icon = typeof p.icon === "string" && (p.icon === "none" || ICON_MAP.has(p.icon)) ? p.icon : "info";
  const scope: NoticeScope = p.scope === "ALL" || p.scope === "CATEGORIES" ? p.scope : "MANUAL";
  const categoryIds = scope === "CATEGORIES" && Array.isArray(p.categoryIds) ? [...new Set(p.categoryIds.filter((c): c is string => typeof c === "string" && validCats.has(c)))] : [];
  if (scope === "CATEGORIES" && !categoryIds.length) { bad.push("categories"); msgs.push("เลือกอย่างน้อย 1 หมวด"); }
  if (bad.length) return { error: msgs.join(" · "), fields: bad };
  return { data: { name, text, tone, icon, scope, categoryIds, skipAccessory: p.skipAccessory !== false, isActive: p.isActive !== false } };
}

/** ข้อความนี้แสดงอัตโนมัติกับสินค้านี้ไหม (ไม่ต้องติ๊ก) */
export function autoApplies(n: Pick<NoticeRow, "scope" | "categoryIds" | "skipAccessory" | "isActive">, p: { categoryId: string; isAccessory: boolean }) {
  if (!n.isActive || n.scope === "MANUAL") return false;
  if (n.skipAccessory && p.isAccessory) return false;
  return n.scope === "ALL" || n.categoryIds.includes(p.categoryId);
}

/** ข้อความที่สินค้านี้แสดงจริง (ตามลำดับในคลัง) */
export function noticesFor(
  lib: NoticeRow[],
  p: { categoryId: string; isAccessory: boolean; noticeIds: string[]; noticeOff: string[] },
): NoticeView[] {
  return lib
    .filter((n) => n.isActive && (p.noticeIds.includes(n.id) || (autoApplies(n, p) && !p.noticeOff.includes(n.id))))
    .slice(0, NOTICE_MAX_PER_PRODUCT)
    .map(({ id, text, tone, icon }) => ({ id, text, tone, icon }));
}

/** ค่าที่ฟอร์มสินค้าส่งมา (JSON) → noticeIds / noticeOff ที่มีอยู่จริงในคลัง */
export function parseProductNotices(raw: string, ids: Set<string>): { noticeIds: string[]; noticeOff: string[] } | null {
  try {
    const j = JSON.parse(raw || "{}") as { ids?: unknown; off?: unknown };
    const pick = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ids.has(x)))] : []);
    return { noticeIds: pick(j.ids).slice(0, NOTICE_MAX_PER_PRODUCT), noticeOff: pick(j.off) };
  } catch {
    return null;
  }
}

export const SCOPE_LABEL = (n: Pick<NoticeRow, "scope" | "categoryIds">, catName: (id: string) => string | undefined) =>
  n.scope === "ALL" ? "ทุกสินค้า (อัตโนมัติ)" : n.scope === "CATEGORIES" ? `หมวด: ${n.categoryIds.map(catName).filter(Boolean).join(", ") || "—"}` : "เฉพาะสินค้าที่เลือก";
