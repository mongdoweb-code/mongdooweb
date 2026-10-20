// ที่เก็บไฟล์ (สลิป รูปสไลด์ รูปสินค้า โลโก้) — เลือกด้วย STORAGE_DRIVER=local|s3
// ตอนนี้ใช้ local: เก็บในโฟลเดอร์ UPLOAD_DIR บนเซิร์ฟเวอร์ (ค่าเริ่มต้น ./uploads)
// ไฟล์ไม่ได้อยู่ใน public/ — สลิปเปิดได้ผ่าน route ที่ตรวจสิทธิ์แอดมินเท่านั้น
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

// key ต้องเป็น path ย่อยปลอดภัย เช่น "slips/2026/10/abc.jpg" — กัน ../ หลุดออกนอกโฟลเดอร์
const SAFE_KEY = /^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]+$/i;

function localDriver(root: string): StorageDriver {
  const base = resolve(root);
  const pathOf = (key: string) => {
    if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`storage key ไม่ถูกต้อง: ${key}`);
    const p = resolve(join(base, key));
    if (!p.startsWith(base + sep)) throw new Error(`storage key ไม่ถูกต้อง: ${key}`);
    return p;
  };
  return {
    async put(key, data) {
      const p = pathOf(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, data, { flag: "wx" }); // ไม่เขียนทับไฟล์เดิม
    },
    async get(key) {
      try {
        return await readFile(pathOf(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
  };
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER ?? "local";
  if (kind === "local") return (driver = localDriver(process.env.UPLOAD_DIR ?? "uploads"));
  // TODO: STORAGE_DRIVER=s3 (S3 / Cloudflare R2) เมื่อย้ายไปเก็บบนคลาวด์
  throw new Error(`ยังไม่รองรับ STORAGE_DRIVER=${kind}`);
}

/** ตรวจชนิดไฟล์ภาพจากไบต์จริง (ไม่เชื่อนามสกุล/Content-Type จากเบราว์เซอร์) */
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: "image/png", ext: "png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  return null;
}
