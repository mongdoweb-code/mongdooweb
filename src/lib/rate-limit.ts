// จำกัดจำนวนครั้งต่อช่วงเวลา (เช่น ต่อ IP) สำหรับฟอร์มสาธารณะ
// TODO: ตอนมีหลายเครื่อง/serverless ให้ย้ายตัวนับไปเก็บใน DB หรือ Redis
import "server-only";
import { headers } from "next/headers";

const buckets = new Map<string, { n: number; since: number }>();

/** คืน true เมื่อเกินโควตา */
export function overLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.since > windowMs) {
    buckets.set(key, { n: 1, since: now });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (now - v.since > windowMs) buckets.delete(k);
    return false;
  }
  b.n += 1;
  return b.n > max;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}
