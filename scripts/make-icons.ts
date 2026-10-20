// สร้างไอคอนเว็บ (favicon, apple-touch-icon, ไอคอน PWA 192/512 + maskable) จากโลโก้ในใบแจ้งหนี้
// รัน: npx tsx scripts/make-icons.ts  (ใช้ sharp ที่ติดตั้งอยู่แล้ว)
// โลโก้ต้นฉบับเล็ก (113×89) จึงขยายแบบ lanczos แล้ว "คม" ขอบด้วยการปรับ alpha + ระบายสีใหม่เป็น 2 สีของโลโก้
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SRC = "docs/reference/logo-from-invoice.png";

/** โลโก้ขนาดใหญ่ ขอบคม พื้นโปร่งใส */
async function crispLogo(width: number) {
  const meta = await sharp(SRC).metadata();
  const scale = width / (meta.width ?? 113);
  const height = Math.round((meta.height ?? 89) * scale);
  // สีของโลโก้: ส้มเหลือง (บน) และฟ้า (ล่าง) — แยกเป็น 2 หน้ากาก ขยาย+เบลอ+ตัดขอบทีละสี แล้วซ้อนกัน
  const palette = [
    [247, 178, 59],
    [86, 172, 224],
  ];
  // วัดสีจริงจากต้นฉบับ
  const src = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sums = palette.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < src.data.length; i += 4) {
    if (src.data[i + 3] < 250) continue;
    const c = [src.data[i], src.data[i + 1], src.data[i + 2]];
    const k = dist(c, palette[0]) < dist(c, palette[1]) ? 0 : 1;
    sums[k][0] += c[0];
    sums[k][1] += c[1];
    sums[k][2] += c[2];
    sums[k][3]++;
  }
  const colors = sums.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]].map(Math.round) : palette[k]));
  const sw = src.info.width;
  const sh = src.info.height;
  const out = Buffer.alloc(width * height * 4);
  for (let k = 0; k < 2; k++) {
    // หน้ากากของสี k: alpha ของพิกเซลที่ใกล้สีนี้
    const mask = Buffer.alloc(sw * sh);
    for (let i = 0, j = 0; i < src.data.length; i += 4, j++) {
      const c = [src.data[i], src.data[i + 1], src.data[i + 2]];
      const mine = k === 0 ? c[0] >= c[2] : c[2] > c[0]; // ส้ม = แดงมากกว่าน้ำเงิน
      mask[j] = mine ? src.data[i + 3] : 0;
    }
    const big = await sharp(mask, { raw: { width: sw, height: sh, channels: 1 } })
      .resize(width, height, { kernel: "cubic" })
      .blur(Math.max(0.6, scale * 0.9))
      .extractChannel(0)
      .raw()
      .toBuffer();
    for (let j = 0; j < big.length; j++) {
      // ตัดขอบที่ 50% แบบนุ่มประมาณ 1.5px (anti-alias)
      const a = Math.max(0, Math.min(255, Math.round((big[j] - 128) * Math.max(1, 1.25 * Math.max(0.6, scale * 0.9)) + 128)));
      if (a <= out[j * 4 + 3]) continue;
      out[j * 4] = colors[k][0];
      out[j * 4 + 1] = colors[k][1];
      out[j * 4 + 2] = colors[k][2];
      out[j * 4 + 3] = a;
    }
  }
  return { buf: await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer(), width, height };
}

function dist(a: number[], b: number[]) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/** ไอคอนสี่เหลี่ยม size×size: โลโก้กว้าง ratio ของกรอบ วางกลาง บนพื้น bg (null = โปร่งใส) */
async function square(size: number, ratio: number, bg: string | null) {
  const logo = await crispLogo(Math.round(size * ratio * 2));
  const w = Math.round(size * ratio);
  const small = await sharp(logo.buf).resize({ width: w, kernel: "lanczos3" }).png().toBuffer();
  const h = (await sharp(small).metadata()).height ?? w;
  return sharp({ create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: small, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ไฟล์ .ico ที่ฝัง PNG หลายขนาด (รองรับทุกเบราว์เซอร์สมัยใหม่) */
function ico(pngs: { size: number; buf: Buffer }[]) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dir = pngs.map(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...pngs.map((p) => p.buf)]);
}

async function main() {
  mkdirSync("public/icons", { recursive: true });
  const WHITE = "#ffffff";
  writeFileSync("src/app/icon.png", await square(192, 0.86, null));
  writeFileSync("src/app/apple-icon.png", await square(180, 0.72, WHITE));
  writeFileSync("public/icons/icon-192.png", await square(192, 0.78, WHITE));
  writeFileSync("public/icons/icon-512.png", await square(512, 0.78, WHITE));
  // maskable: เนื้อหาอยู่ในวงกลมกลาง 80% (safe zone) → โลโก้กว้าง 58%
  writeFileSync("public/icons/maskable-512.png", await square(512, 0.58, WHITE));
  writeFileSync(
    "src/app/favicon.ico",
    ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await square(size, 0.94, null) })))),
  );
  console.log("icons written");
}

main();
