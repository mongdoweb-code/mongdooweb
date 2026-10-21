// ลิงก์ติดตามพัสดุของบริษัทขนส่ง (ชื่อขนส่งตาม CARRIERS ใน admin-orders.ts) — ใช้ในหน้าติดตามคำสั่งซื้อ
const LINKS: [RegExp, string, (no: string) => string][] = [
  [/kerry|เคอรี่/i, "Kerry Express", (n) => `https://th.kerryexpress.com/th/track/?track=${n}`],
  [/flash|แฟลช/i, "Flash Express", (n) => `https://www.flashexpress.co.th/fle/tracking?se=${n}`],
  [/j\s*&\s*t|j&amp;t|เจแอนด์ที/i, "J&T Express", (n) => `https://www.jtexpress.co.th/service/track?bills=${n}`],
  [/ไปรษณีย์|ems|thailand\s*post|thaipost/i, "ไปรษณีย์ไทย", (n) => `https://track.thailandpost.co.th/?trackNumber=${n}`],
];

/** URL ติดตามพัสดุ หรือ null เมื่อไม่รู้จักขนส่ง/เลขพัสดุผิดรูปแบบ */
export function carrierTrackUrl(carrier: string | null | undefined, trackingNo: string | null | undefined) {
  const no = (trackingNo ?? "").trim();
  if (!carrier || !/^[A-Za-z0-9-]{6,40}$/.test(no)) return null;
  const hit = LINKS.find(([re]) => re.test(carrier));
  return hit ? hit[2](encodeURIComponent(no)) : null;
}
