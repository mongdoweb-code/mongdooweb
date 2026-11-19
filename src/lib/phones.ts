// เบอร์โทร/โทรสารของลูกค้า (หลายเบอร์) — ฟังก์ชันล้วน ใช้ได้ทั้ง server และเบราว์เซอร์ (ไม่มี import)
// รูปแบบที่เก็บ: ตัวเลขล้วน "0863099066" · มีเบอร์ต่อ "021234567#12" · ต่างประเทศ "+8613812345678"
// รับได้: 086-309-9066 · 02 123 4567 ต่อ 12 · (044) 251-234 ext.5 · +66 86 309 9066 (→ 0863099066)
// หลายเบอร์ในช่องเดียว คั่นด้วย , ; / | ขึ้นบรรทัด หรือ "หรือ"

export const PHONES_MAX = 5;

/** แยกข้อความที่วางมาเป็นหลายเบอร์ */
export function splitPhones(text: string): string[] {
  return String(text ?? "")
    .normalize("NFC")
    .split(/[,;|\n\r]+|\s+\/\s+|\/(?=\s*[+0(])|\s+หรือ\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type PhoneKind = "mobile" | "landline" | "hotline" | "intl";

/** ตรวจเลขหมายไทย (ไม่รวมเบอร์ต่อ) */
export function phoneKind(digits: string): PhoneKind | null {
  if (/^0[689]\d{8}$/.test(digits)) return "mobile"; // มือถือ 10 หลัก
  if (/^0[2-7]\d{7}$/.test(digits)) return "landline"; // บ้าน/สำนักงาน 9 หลัก
  if (/^1\d{3}$/.test(digits) || /^1[89]00\d{6}$/.test(digits)) return "hotline"; // 1xxx · 1800/1900
  return null;
}

/** ข้อความหนึ่งเบอร์ → ค่าที่เก็บ (null = รูปแบบไม่ถูกต้อง) */
export function normalizePhone(raw: string): string | null {
  let s = String(raw ?? "").normalize("NFC").trim();
  if (!s) return null;
  // เบอร์ต่อ: ต่อ / ext / x / # ตามด้วยตัวเลข 1–6 หลักท้ายข้อความ
  let ext = "";
  const m = s.match(/\s*(?:ต่อ|ext\.?|x|#)\s*(\d{1,6})\s*$/i);
  if (m && m.index! > 0) {
    ext = m[1];
    s = s.slice(0, m.index);
  }
  if (/[^\d\s\-().+]/.test(s)) return null; // มีตัวอักษรอื่น = ไม่ใช่เบอร์
  const plus = s.trim().startsWith("+");
  let d = s.replace(/\D/g, "");
  if (plus || d.startsWith("00")) {
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("66")) d = "0" + d.slice(2).replace(/^0/, ""); // +66 (0)86… → 086…
    else return /^\d{8,15}$/.test(d) ? `+${d}${ext ? "#" + ext : ""}` : null;
  }
  if (!phoneKind(d)) return null;
  return ext ? `${d}#${ext}` : d;
}

/** ค่าที่เก็บ → ตัวเลขหลักของเบอร์ (ไม่มีเบอร์ต่อ, ไม่มี +) ใช้ค้นหา/จับคู่คำสั่งซื้อ */
export const phoneMain = (v: string) => String(v ?? "").split("#")[0].replace(/\D/g, "");

/** ค่าที่เก็บ → ข้อความแสดง "086-309-9066" · "02-123-4567 ต่อ 12" · "+86 13812345678" */
export function formatPhoneEntry(v: string): string {
  const [num, ext] = String(v ?? "").split("#");
  let out: string;
  if (num.startsWith("+")) out = `+${num.slice(1, num.length > 11 ? 3 : 2)} ${num.slice(num.length > 11 ? 3 : 2)}`;
  else if (num.length === 10 && num.startsWith("0")) out = `${num.slice(0, 3)}-${num.slice(3, 6)}-${num.slice(6)}`;
  else if (num.length === 9 && num.startsWith("02")) out = `${num.slice(0, 2)}-${num.slice(2, 5)}-${num.slice(5)}`; // กรุงเทพฯ 02-123-4567
  else if (num.length === 9) out = `${num.slice(0, 3)}-${num.slice(3, 6)}-${num.slice(6)}`; // ต่างจังหวัด 044-251-234
  else if (num.length === 10 && num.startsWith("1")) out = `${num.slice(0, 4)}-${num.slice(4, 7)}-${num.slice(7)}`;
  else out = num;
  return ext ? `${out} ต่อ ${ext}` : out;
}

export type PhoneListResult = { phones: string[]; bad: string[]; tooMany: boolean };

/** หลายช่อง (แต่ละช่องอาจมีหลายเบอร์) → รายการที่เก็บ: ตัดซ้ำ, เก็บลำดับ (ตัวแรก = เบอร์หลัก), สูงสุด PHONES_MAX */
export function parsePhoneList(inputs: string[]): PhoneListResult {
  const phones: string[] = [], bad: string[] = [];
  for (const raw of inputs.flatMap(splitPhones)) {
    const v = normalizePhone(raw);
    if (!v) bad.push(raw.slice(0, 40));
    else if (!phones.includes(v)) phones.push(v);
  }
  return { phones: phones.slice(0, PHONES_MAX), bad, tooMany: phones.length > PHONES_MAX };
}

/** รายการเบอร์ของลูกค้า (ข้อมูลเก่าที่มีแค่ phone = ใช้ phone) */
export const customerPhones = (c: { phones?: string[] | null; phone?: string | null }) =>
  c.phones && c.phones.length ? c.phones : c.phone ? [c.phone] : [];
