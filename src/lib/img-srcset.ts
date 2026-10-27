// srcset ของรูปหลายขนาด (U14) — ไม่มี import ฝั่ง server ใช้ได้ทั้ง server/client component
// รูปที่อัปโหลด (/media/<key>.webp) มีรูปย่อตามความกว้างคงที่: <key>-w320.webp, -w640, -w960, -w1280 (+ ไฟล์เต็ม ≤1600 และ -sm 480)
// ถ้ารูปย่อยังไม่ถูกสร้าง /media สร้างให้ตอนเรียกครั้งแรก · เบราว์เซอร์ที่รองรับ AVIF ได้ AVIF (ตัดสินที่ /media ตาม Accept)
// รูป Unsplash ใช้พารามิเตอร์ w= ของ Unsplash แทน

export const IMG_WIDTHS = [320, 640, 960, 1280] as const;
export const FULL_WIDTH = 1600;

const MEDIA_RE = /^\/media\/(.+?)(-sm)?\.webp$/;

/** "/media/products/x.webp" หรือ "/media/products/x-sm.webp" → "/media/products/x" (null = ไม่ใช่รูปที่อัปโหลด) */
export const mediaBase = (url: string | null | undefined) => {
  const m = url ? MEDIA_RE.exec(url) : null;
  return m && !/-w\d+$/.test(m[1]) ? `/media/${m[1]}` : null;
};

/** srcset จาก URL ของรูป — maxW จำกัดขนาดใหญ่สุด (เช่น การ์ดสินค้าไม่ต้องใช้เกิน 640) */
export function srcSetOf(url: string | null | undefined, maxW = FULL_WIDTH): string | undefined {
  if (!url) return undefined;
  const base = mediaBase(url);
  if (base) {
    const list = IMG_WIDTHS.filter((w) => w <= maxW).map((w) => `${base}-w${w}.webp ${w}w`);
    if (maxW >= FULL_WIDTH) list.push(`${base}.webp ${FULL_WIDTH}w`);
    return list.join(", ");
  }
  if (url.startsWith("https://images.unsplash.com/")) {
    const b = url.split("?")[0];
    return [640, 828, 1280, 1920].filter((w) => w <= Math.max(maxW, 640)).map((w) => `${b}?auto=format&fit=crop&w=${w}&q=72 ${w}w`).join(", ");
  }
  return undefined;
}

/** sizes มาตรฐานของการ์ดสินค้า (2 คอลัมน์บนมือถือ, 3–4 คอลัมน์บนจอใหญ่) */
export const CARD_SIZES = "(max-width: 640px) 46vw, (max-width: 1024px) 31vw, 280px";
