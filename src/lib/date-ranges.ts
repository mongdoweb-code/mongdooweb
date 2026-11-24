// ช่วงเวลาด่วน (วันนี้ · เมื่อวาน · 7/30 วัน · เดือนนี้ · เดือนก่อน · ปีนี้) + ช่วงก่อนหน้าสำหรับลูกศรเทียบ ▲▼
// ฟังก์ชันล้วน วันที่เป็น "YYYY-MM-DD" ตามเวลาไทย — ใช้ทั้งหน้าเอกสารขายและหน้าคำสั่งซื้อ

export const QUICK_RANGES = [
  ["today", "วันนี้"],
  ["yest", "เมื่อวาน"],
  ["d7", "7 วันล่าสุด"],
  ["d30", "30 วันล่าสุด"],
  ["month", "เดือนนี้"],
  ["last", "เดือนก่อน"],
  ["year", "ปีนี้"],
] as const;
export type QuickKey = (typeof QUICK_RANGES)[number][0];
export const QUICK_LABEL = Object.fromEntries(QUICK_RANGES) as Record<QuickKey, string>;
export const isQuickKey = (k: string): k is QuickKey => k in QUICK_LABEL;

export type Span = { from: string; to: string };

const ms = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => ymd(ms(d) + n * 864e5);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12
const pad = (n: number) => String(n).padStart(2, "0");
/** เดือนที่เลื่อนไป n เดือน (วันที่เกินจำนวนวันของเดือนนั้น → วันสุดท้ายของเดือน) */
function shiftMonth(d: string, n: number) {
  const [y, m, day] = d.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(day, daysIn(ny, nm)))}`;
}
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => `${d.slice(0, 7)}-${pad(daysIn(Number(d.slice(0, 4)), Number(d.slice(5, 7))))}`;

export function quickSpan(k: QuickKey, today: string): Span {
  switch (k) {
    case "today": return { from: today, to: today };
    case "yest": { const y = addDays(today, -1); return { from: y, to: y }; }
    case "d7": return { from: addDays(today, -6), to: today };
    case "d30": return { from: addDays(today, -29), to: today };
    case "month": return { from: monthStart(today), to: today };
    case "last": { const p = shiftMonth(monthStart(today), -1); return { from: p, to: monthEnd(p) }; }
    case "year": return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** ช่วงวันที่ตรงกับปุ่มด่วนไหน (ไม่ตรง = null) */
export function matchQuick(from: string, to: string, today: string): QuickKey | null {
  if (!from || !to) return null;
  return QUICK_RANGES.find(([k]) => { const s = quickSpan(k, today); return s.from === from && s.to === to; })?.[0] ?? null;
}

/**
 * ช่วงก่อนหน้าที่เทียบกันได้ (ยาวเท่ากัน):
 * เดือนนี้ → เดือนก่อน ณ วันที่เดียวกัน · เดือนก่อน → เดือนก่อนหน้านั้นทั้งเดือน · ปีนี้ → ปีก่อนช่วงเดียวกัน · อื่นๆ → ช่วงยาวเท่ากันที่อยู่ติดกันก่อนหน้า
 */
export function prevSpan(s: Span, today: string): Span & { label: string } {
  const k = matchQuick(s.from, s.to, today);
  if (k === "month") return { from: shiftMonth(s.from, -1), to: shiftMonth(s.to, -1), label: "เดือนก่อน" };
  if (k === "last") { const p = shiftMonth(s.from, -1); return { from: p, to: monthEnd(p), label: "เดือนก่อนหน้า" }; }
  if (k === "year") return { from: shiftMonth(s.from, -12), to: shiftMonth(s.to, -12), label: "ปีก่อน" };
  const len = Math.round((ms(s.to) - ms(s.from)) / 864e5) + 1;
  const label = k === "today" ? "เมื่อวาน" : k === "yest" ? "วันก่อนหน้า" : k === "d7" ? "7 วันก่อนหน้า" : k === "d30" ? "30 วันก่อนหน้า" : "ช่วงก่อนหน้า";
  return { from: addDays(s.from, -len), to: addDays(s.from, -1), label };
}

export type Change = { dir: "up" | "down" | "same"; pct: number | null; label: string };
/** เปลี่ยนแปลงเป็น % เทียบช่วงก่อนหน้า · ช่วงก่อนเป็น 0 แต่ช่วงนี้มียอด → pct = null (บอกว่าช่วงก่อนไม่มียอด) */
export function change(cur: number, prev: number, label: string): Change {
  if (prev === 0) return cur === 0 ? { dir: "same", pct: 0, label } : { dir: cur > 0 ? "up" : "down", pct: null, label };
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return { dir: pct > 0 ? "up" : pct < 0 ? "down" : "same", pct: Math.abs(pct), label };
}
export const changeText = (c: Change) =>
  c.dir === "same" ? `เท่ากับ${c.label}` : c.pct === null ? `${c.dir === "up" ? "▲" : "▼"} ${c.label}ไม่มียอด` : `${c.dir === "up" ? "▲" : "▼"} ${c.pct.toLocaleString("th-TH")}% จาก${c.label}`;
