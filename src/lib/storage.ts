// ที่เก็บไฟล์ (สลิป รูปสไลด์ รูปสินค้า โลโก้) — เลือกด้วย STORAGE_DRIVER=local|s3
// local: โฟลเดอร์ UPLOAD_DIR บนเซิร์ฟเวอร์ (ค่าเริ่มต้น ./uploads — บน Railway ให้ชี้ไปที่ volume)
// s3: S3 หรือบริการที่เข้ากันได้ (Railway Bucket, Cloudflare R2, AWS S3) — bucket ต้องเป็นแบบ private
// ไฟล์ไม่ได้อยู่ใน public/ — สลิปเปิดได้ผ่าน route ที่ตรวจสิทธิ์แอดมินเท่านั้น
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

const checkKey = (key: string) => {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`storage key ไม่ถูกต้อง: ${key}`);
  return key;
};

/** S3 / R2 / Railway Bucket — ค่าจาก env: S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY */
function s3Driver(): StorageDriver {
  const env = (k: string) => process.env[k]?.trim() ?? "";
  const bucket = env("S3_BUCKET");
  if (!bucket || !env("S3_ACCESS_KEY_ID") || !env("S3_SECRET_ACCESS_KEY")) throw new Error("STORAGE_DRIVER=s3 ต้องตั้ง S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
  const prefix = env("S3_PREFIX").replace(/^\/+|\/+$/g, "");
  const client = new S3Client({
    region: env("S3_REGION") || "auto",
    endpoint: env("S3_ENDPOINT") || undefined,
    // บริการที่ไม่ใช่ AWS ส่วนใหญ่ใช้ URL แบบ path (https://endpoint/bucket/key)
    forcePathStyle: env("S3_FORCE_PATH_STYLE") ? env("S3_FORCE_PATH_STYLE") === "true" : !!env("S3_ENDPOINT"),
    credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") },
  });
  const full = (key: string) => (prefix ? `${prefix}/${checkKey(key)}` : checkKey(key));
  return {
    async put(key, data) {
      // ชื่อไฟล์มีเวลา/ค่าสุ่มอยู่แล้ว จึงไม่ชนกัน
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: full(key), Body: data, ContentType: mimeOf(key) }));
    },
    async get(key) {
      try {
        const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: full(key) }));
        return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
      } catch (e) {
        if (e instanceof NoSuchKey || (e as { name?: string }).name === "NoSuchKey" || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
  };
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", json: "application/json" };
const mimeOf = (key: string) => MIME[key.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER ?? "local";
  if (kind === "local") return (driver = localDriver(process.env.UPLOAD_DIR ?? "uploads"));
  if (kind === "s3") return (driver = s3Driver());
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
